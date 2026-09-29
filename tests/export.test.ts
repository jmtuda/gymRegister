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
import type { ExportSourceSession } from '../src/domain/export.ts';
import { createUuid } from '../src/domain/id.ts';
import { createExportGate } from '../src/features/export/exportGate.ts';
import { buildExportDocument } from '../src/features/export/exportModel.ts';
import {
  CSV_COLUMNS, serializeExportCsv, serializeExportJson,
} from '../src/features/export/exportSerializers.ts';

const EXPORTED_AT = '2026-06-10T12:00:00.000Z';

function sourceFixture(): ExportSourceSession[] {
  return [{
    session: {
      id: 'session-2', status: 'completed', note: 'Nota, "fuerte"\nmañana',
      createdAt: '2026-06-02T09:00:00.000Z', startedAt: '2026-06-02T10:00:00.000Z',
      completedAt: '2026-06-02T11:00:00.000Z', updatedAt: '2026-06-02T11:00:00.000Z',
    },
    exercises: [{
      id: 'exercise-b', sessionId: 'session-2', exerciseId: 'CUSTOM', configurationId: 'CUSTOM.CONFIG',
      groupName: 'Pecho', exerciseNameSnapshot: 'Press, “especial”',
      configurationNameSnapshot: 'Máquina "única"', orderIndex: 3,
      selectedEquipment: 'MACHINE', selectedLaterality: null, selectedGrip: 'NEUTRAL',
      selectedGripWidth: null, note: 'Línea 1\n"Línea 2"',
      createdAt: '2026-06-02T10:01:00.000Z', updatedAt: '2026-06-02T10:02:00.000Z',
      sets: [{
        id: 'set-b', sessionExerciseId: 'exercise-b', setIndex: 5,
        doseUnit: 'reps', doseValue: 8, perSide: false, loadMode: 'DISPLAYED_KG',
        loadValue: 0, loadLabel: null, rir: 0, confirmedAt: '2026-06-02T10:10:00.000Z',
        createdAt: '2026-06-02T10:10:00.000Z', updatedAt: '2026-06-02T10:11:00.000Z',
      }, {
        id: 'set-a', sessionExerciseId: 'exercise-b', setIndex: 7,
        doseUnit: 'reps', doseValue: 6, perSide: true, loadMode: 'BAND_LABEL',
        loadValue: null, loadLabel: 'Azul, fuerte', rir: null,
        confirmedAt: '2026-06-02T10:20:00.000Z', createdAt: '2026-06-02T10:20:00.000Z',
        updatedAt: '2026-06-02T10:20:00.000Z',
      }],
    }, {
      id: 'exercise-empty', sessionId: 'session-2', exerciseId: 'EMPTY', configurationId: 'EMPTY.CONFIG',
      groupName: null, exerciseNameSnapshot: 'Sin series', configurationNameSnapshot: 'Peso corporal',
      orderIndex: 8, selectedEquipment: 'BODYWEIGHT', selectedLaterality: null,
      selectedGrip: null, selectedGripWidth: null, note: null,
      createdAt: '2026-06-02T10:30:00.000Z', updatedAt: '2026-06-02T10:30:00.000Z', sets: [],
    }],
  }, {
    session: {
      id: 'session-1', status: 'completed', note: null,
      createdAt: '2026-06-01T09:00:00.000Z', startedAt: null,
      completedAt: '2026-06-01T11:00:00.000Z', updatedAt: '2026-06-01T11:00:00.000Z',
    },
    exercises: [],
  }];
}

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

async function setup() {
  const value = createDatabase();
  await initializeDatabase(value.database);
  await seedSystemCatalog(
    value.database,
    JSON.parse(await readFile('data/catalog.v0.2.json', 'utf8')) as CatalogSeedData,
  );
  return {
    ...value,
    catalog: createCatalogRepository(value.database),
    sessions: createManualSessionRepository(value.database),
    execution: createSessionExecutionRepository(value.database),
    history: createHistoryRepository(value.database),
    exports: createExportRepository(value.database),
  };
}

test('CSV tiene cabecera estable, una fila por serie y conserva índices y ceros', () => {
  const csv = serializeExportCsv(buildExportDocument(sourceFixture(), EXPORTED_AT));
  const lines = csv.split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.length, 3);
  assert.match(lines[1], /exercise-b,set-b,3/);
  assert.match(lines[1], /,5,reps,8,false,DISPLAYED_KG,0,,0,/);
  assert.match(lines[2], /,7,reps,6,true,BAND_LABEL,,"Azul, fuerte",,/);
  assert.doesNotMatch(csv, /exercise-empty/);
});

test('CSV vacío conserva la cabecera y escapa comas, comillas, saltos y Unicode', () => {
  const empty = serializeExportCsv(buildExportDocument([], EXPORTED_AT));
  assert.equal(empty, CSV_COLUMNS.join(','));
  const csv = serializeExportCsv(buildExportDocument(sourceFixture(), EXPORTED_AT));
  assert.match(csv, /"Press, “especial”"/u);
  assert.match(csv, /"Máquina ""única"""/u);
  assert.match(csv, /"Línea 1\n""Línea 2"""/u);
  assert.match(csv, /"Nota, ""fuerte""\nmañana"/u);
});

test('JSON versionado conserva jerarquía, campos completos y ejercicios sin series', () => {
  const document = buildExportDocument(sourceFixture(), EXPORTED_AT);
  const parsed = JSON.parse(serializeExportJson(document));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.exportedAt, EXPORTED_AT);
  assert.deepEqual(parsed.sessions.map((value: { id: string }) => value.id), ['session-2', 'session-1']);
  assert.deepEqual(parsed.sessions[0].exercises.map((value: { id: string }) => value.id), ['exercise-b', 'exercise-empty']);
  assert.deepEqual(parsed.sessions[0].exercises[0].sets.map((value: { id: string }) => value.id), ['set-b', 'set-a']);
  assert.deepEqual(parsed.sessions[0].exercises[1].sets, []);
  assert.deepEqual(parsed.sessions[0].exercises[0], document.sessions[0].exercises[0]);
});

test('serializar repetidamente con el mismo exportedAt es determinista', () => {
  const first = buildExportDocument(sourceFixture(), EXPORTED_AT);
  const second = buildExportDocument(sourceFixture(), EXPORTED_AT);
  assert.equal(serializeExportJson(first), serializeExportJson(second));
  assert.equal(serializeExportCsv(first), serializeExportCsv(second));
});

test('la lectura exporta solo completed, preserva snapshots y no modifica SQLite', async () => {
  const { sqlite, database, catalog, sessions, execution, history, exports } = await setup();
  const customExercise = await catalog.createCustomExercise({
    id: 'EXPORT_CUSTOM', groupId: 'CHEST', nameEs: 'Press exportado',
  });
  const customConfiguration = await catalog.createCustomConfiguration({
    id: 'EXPORT_CUSTOM.CONFIG', exerciseId: customExercise.id, nameEs: 'Máquina exportada',
    equipmentOptions: ['MACHINE'], doseUnit: 'reps', loadMode: 'DISPLAYED_KG',
  });
  const completed = await sessions.createDraft('2026-06-01T09:00:00.000Z');
  const item = await sessions.addExercise({
    id: 'export-item', sessionId: completed.id, exerciseId: customExercise.id,
    configurationId: customConfiguration.id, now: '2026-06-01T09:05:00.000Z',
  });
  await sessions.startSession(completed.id, '2026-06-01T10:00:00.000Z');
  await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: item.id, doseValue: 10, loadValue: 0, rir: 0,
    now: '2026-06-01T10:10:00.000Z',
  });
  await history.completeSession(completed.id, 'Terminada', '2026-06-01T11:00:00.000Z');
  const draft = await sessions.createDraft('2026-06-02T09:00:00.000Z');
  await sessions.addExercise({
    id: 'draft-item', sessionId: draft.id, exerciseId: 'ROW', configurationId: 'ROW.BARBELL',
  });
  await catalog.updateCustomExercise(customExercise.id, { nameEs: 'Nombre actual' });
  await catalog.updateCustomConfiguration(customConfiguration.id, { nameEs: 'Configuración actual' });
  await catalog.setCustomConfigurationActive(customConfiguration.id, false);
  await catalog.setCustomExerciseActive(customExercise.id, false);

  const before = {
    sessions: await database.getAllAsync('SELECT * FROM training_sessions ORDER BY id'),
    exercises: await database.getAllAsync('SELECT * FROM session_exercises ORDER BY id'),
    sets: await database.getAllAsync('SELECT * FROM performed_sets ORDER BY id'),
  };
  const source = await exports.readCompletedSessions();
  const document = buildExportDocument(source, EXPORTED_AT);
  serializeExportCsv(document);
  serializeExportJson(document);
  const after = {
    sessions: await database.getAllAsync('SELECT * FROM training_sessions ORDER BY id'),
    exercises: await database.getAllAsync('SELECT * FROM session_exercises ORDER BY id'),
    sets: await database.getAllAsync('SELECT * FROM performed_sets ORDER BY id'),
  };

  assert.deepEqual(source.map((value) => value.session.id), [completed.id]);
  assert.equal(source[0].exercises[0].exerciseNameSnapshot, 'Press exportado');
  assert.equal(source[0].exercises[0].configurationNameSnapshot, 'Máquina exportada');
  assert.equal(source[0].exercises[0].sets[0].loadMode, 'DISPLAYED_KG');
  assert.deepEqual(after, before);
  sqlite.close();
});

test('la puerta de exportación ignora dobles pulsaciones y se libera tras errores', async () => {
  const gate = createExportGate();
  let release: (() => void) | undefined;
  const pending = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
  assert.equal(gate.isRunning, true);
  assert.equal(await gate.run(async () => undefined), false);
  release?.();
  assert.equal(await pending, true);
  assert.equal(gate.isRunning, false);

  await assert.rejects(gate.run(async () => { throw new Error('fallo al compartir'); }), /fallo al compartir/);
  assert.equal(gate.isRunning, false);
  assert.equal(await gate.run(async () => undefined), true);
});
