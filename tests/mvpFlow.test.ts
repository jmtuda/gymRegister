import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { createCatalogRepository } from '../src/data/catalogRepository.ts';
import { seedSystemCatalog } from '../src/data/catalogSeed.ts';
import { initializeDatabase } from '../src/data/database.ts';
import { createExportRepository } from '../src/data/exportRepository.ts';
import { createHistoryRepository } from '../src/data/historyRepository.ts';
import { createManualSessionRepository } from '../src/data/manualSessionRepository.ts';
import { createSessionExecutionRepository } from '../src/data/sessionExecutionRepository.ts';
import type { Database } from '../src/data/types.ts';
import type { CatalogSeedData } from '../src/domain/catalog.ts';
import { createUuid } from '../src/domain/id.ts';
import { buildExportDocument } from '../src/features/export/exportModel.ts';
import { serializeExportCsv, serializeExportJson } from '../src/features/export/exportSerializers.ts';

function createDatabase(): { sqlite: DatabaseSync; database: Database } {
  const sqlite = new DatabaseSync(':memory:');
  const database: Database = {
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params as SQLInputValue[]),
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) =>
      (sqlite.prepare(sql).get(...params as SQLInputValue[]) as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params as SQLInputValue[]) as T[],
    withExclusiveTransactionAsync: async (task) => {
      sqlite.exec('BEGIN');
      try { await task(database); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, database };
}

test('flujo integral local persiste, recupera, completa, historiza y exporta sin mutar', async () => {
  const { sqlite, database } = createDatabase();
  await initializeDatabase(database);
  await seedSystemCatalog(
    database,
    JSON.parse(await readFile('data/catalog.v0.2.json', 'utf8')) as CatalogSeedData,
  );
  let catalog = createCatalogRepository(database);
  let sessions = createManualSessionRepository(database);
  let execution = createSessionExecutionRepository(database);

  const customExercise = await catalog.createCustomExercise({
    id: 'MVP_CUSTOM', groupId: 'ARMS', nameEs: 'Curl persistente',
  });
  const customConfiguration = await catalog.createCustomConfiguration({
    id: 'MVP_CUSTOM.DUMBBELL', exerciseId: customExercise.id, nameEs: 'Mancuernas históricas',
    equipmentOptions: ['DUMBBELL'], lateralityOptions: ['BILATERAL', 'ALTERNATING'],
    gripOptions: ['SUPINATED', 'NEUTRAL'], doseUnit: 'reps', loadMode: 'IMPLEMENT_KG',
  });
  const draft = await sessions.createDraft('2026-07-01T09:00:00.000Z');
  await sessions.updateNote(draft.id, 'Nota draft', '2026-07-01T09:01:00.000Z');
  const customItem = await sessions.addExercise({
    id: 'mvp-custom-item', sessionId: draft.id, exerciseId: customExercise.id,
    configurationId: customConfiguration.id, selectedEquipment: 'DUMBBELL',
    selectedLaterality: 'ALTERNATING', selectedGrip: 'NEUTRAL',
    now: '2026-07-01T09:02:00.000Z',
  });

  catalog = createCatalogRepository(database);
  sessions = createManualSessionRepository(database);
  assert.equal((await catalog.getExerciseById(customExercise.id))?.id, customExercise.id);
  assert.equal((await sessions.getOpenSession())?.id, draft.id);
  assert.deepEqual(
    (await sessions.listSessionExercises(draft.id))[0],
    customItem,
  );

  await sessions.startSession(draft.id, '2026-07-01T10:00:00.000Z');
  const liveItem = await sessions.addExercise({
    id: 'mvp-live-item', sessionId: draft.id, exerciseId: 'ROW', configurationId: 'ROW.BARBELL',
    now: '2026-07-01T10:01:00.000Z',
  });
  await sessions.reorderExercises(draft.id, [liveItem.id, customItem.id]);
  execution = createSessionExecutionRepository(database);
  await execution.updateExerciseNote(customItem.id, 'Nota del ejercicio', '2026-07-01T10:02:00.000Z');
  const attemptId = createUuid();
  const confirmed = await execution.confirmSet({
    attemptId, sessionExerciseId: customItem.id, doseValue: 12, perSide: true,
    loadValue: 14, rir: 0, now: '2026-07-01T10:10:00.000Z',
  });
  assert.deepEqual(await execution.confirmSet({
    attemptId, sessionExerciseId: customItem.id, doseValue: 99, loadValue: 99,
  }), confirmed);

  sessions = createManualSessionRepository(database);
  execution = createSessionExecutionRepository(database);
  assert.equal((await sessions.getCurrentInProgress())?.id, draft.id);
  assert.deepEqual(
    (await sessions.listSessionExercises(draft.id)).map((value) => value.id),
    [liveItem.id, customItem.id],
  );
  assert.deepEqual(await execution.listSets(customItem.id), [confirmed]);

  const history = createHistoryRepository(database);
  await history.completeSession(draft.id, 'Nota final', '2026-07-01T11:00:00.000Z');
  assert.equal(await createManualSessionRepository(database).getOpenSession(), null);
  const historicalBeforeCatalogChange = await history.getCompletedSessionDetail(draft.id);

  await catalog.updateCustomExercise(customExercise.id, { nameEs: 'Nombre nuevo' });
  await catalog.updateCustomConfiguration(customConfiguration.id, { nameEs: 'Configuración nueva' });
  await catalog.setCustomConfigurationActive(customConfiguration.id, false);
  await catalog.setCustomExerciseActive(customExercise.id, false);

  const beforeExport = {
    sessions: await database.getAllAsync('SELECT * FROM training_sessions ORDER BY id'),
    exercises: await database.getAllAsync('SELECT * FROM session_exercises ORDER BY id'),
    sets: await database.getAllAsync('SELECT * FROM performed_sets ORDER BY id'),
  };
  const source = await createExportRepository(database).readCompletedSessions();
  const document = buildExportDocument(source, '2026-07-01T12:00:00.000Z');
  const csv = serializeExportCsv(document);
  const json = serializeExportJson(document);
  const afterExport = {
    sessions: await database.getAllAsync('SELECT * FROM training_sessions ORDER BY id'),
    exercises: await database.getAllAsync('SELECT * FROM session_exercises ORDER BY id'),
    sets: await database.getAllAsync('SELECT * FROM performed_sets ORDER BY id'),
  };

  const historicalAfterCatalogChange = await createHistoryRepository(database).getCompletedSessionDetail(draft.id);
  assert.deepEqual(historicalAfterCatalogChange, historicalBeforeCatalogChange);
  assert.equal(document.sessions[0].exercises[1].exercise_name_snapshot, 'Curl persistente');
  assert.equal(document.sessions[0].exercises[1].configuration_name_snapshot, 'Mancuernas históricas');
  assert.match(csv, /Curl persistente/);
  assert.match(json, /Mancuernas históricas/);
  assert.deepEqual(afterExport, beforeExport);
  sqlite.close();
});
