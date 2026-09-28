import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { createCatalogRepository } from '../src/data/catalogRepository.ts';
import { seedSystemCatalog } from '../src/data/catalogSeed.ts';
import { initializeDatabase } from '../src/data/database.ts';
import { createHistoryRepository } from '../src/data/historyRepository.ts';
import { createManualSessionRepository } from '../src/data/manualSessionRepository.ts';
import { createSessionExecutionRepository } from '../src/data/sessionExecutionRepository.ts';
import type { Database } from '../src/data/types.ts';
import type { CatalogSeedData } from '../src/domain/catalog.ts';
import { createUuid } from '../src/domain/id.ts';

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
  };
}

async function addAndStart(
  sessions: ReturnType<typeof createManualSessionRepository>,
  sessionId: string,
  exerciseId = 'BACK_SQUAT',
  configurationId = 'BACK_SQUAT.BARBELL',
  itemId = createUuid(),
  startedAt = '2026-05-01T10:00:00.000Z',
) {
  const exercise = await sessions.addExercise({
    id: itemId, sessionId, exerciseId, configurationId,
  });
  await sessions.startSession(sessionId, startedAt);
  return exercise;
}

test('finalizar persiste estado, timestamps y nota sin crear ni modificar series', async () => {
  const { sqlite, sessions, execution, history } = await setup();
  const session = await sessions.createDraft('2026-05-01T09:55:00.000Z');
  const exercise = await addAndStart(sessions, session.id);
  const set = await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 60,
    now: '2026-05-01T10:10:00.000Z',
  });

  const completed = await history.completeSession(
    session.id, '  Buen entrenamiento  ', '2026-05-01T11:15:00.000Z',
  );
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, '2026-05-01T11:15:00.000Z');
  assert.equal(completed.updatedAt, '2026-05-01T11:15:00.000Z');
  assert.equal(completed.note, 'Buen entrenamiento');
  assert.deepEqual(await execution.listSets(exercise.id), [set]);
  assert.equal((await history.getCompletedSessionById(session.id))?.id, session.id);
  sqlite.close();
});

test('finalizar con cero series es válido y repetir conserva los hechos originales', async () => {
  const { sqlite, sessions, history } = await setup();
  const session = await sessions.createDraft();
  await addAndStart(sessions, session.id);
  const first = await history.completeSession(session.id, 'Original', '2026-05-01T11:00:00.000Z');
  const repeated = await history.completeSession(session.id, 'No debe sustituir', '2026-05-01T12:00:00.000Z');
  assert.deepEqual(repeated, first);
  assert.equal(repeated.completedAt, '2026-05-01T11:00:00.000Z');
  assert.equal(repeated.note, 'Original');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM performed_sets').get()?.count, 0);
  sqlite.close();
});

test('una sesión completed queda cerrada y deja crear un nuevo draft', async () => {
  const { sqlite, sessions, execution, history } = await setup();
  const session = await sessions.createDraft();
  const exercise = await addAndStart(sessions, session.id);
  const set = await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 5, loadValue: 40,
  });
  await history.completeSession(session.id, null);

  assert.equal(await sessions.getOpenSession(), null);
  await assert.rejects(execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 6, loadValue: 42,
  }), /en curso/);
  await assert.rejects(execution.editSet({
    setId: set.id, sessionExerciseId: exercise.id, doseValue: 6, loadValue: 42,
  }), /en curso/);
  await assert.rejects(execution.deleteSet(exercise.id, set.id), /en curso/);
  await assert.rejects(execution.updateExerciseNote(exercise.id, 'Cambio'), /en curso/);
  await assert.rejects(sessions.addExercise({
    sessionId: session.id, exerciseId: 'ROW', configurationId: 'ROW.BARBELL',
  }), /abierta/);
  await assert.rejects(sessions.removeExercise(session.id, exercise.id), /borrador/);
  await assert.rejects(sessions.reorderExercises(session.id, [exercise.id]), /abierta/);
  await assert.rejects(sessions.updateNote(session.id, 'Cambio'), /borrador/);

  const next = await sessions.createDraft('2026-05-02T10:00:00.000Z');
  assert.notEqual(next.id, session.id);
  assert.equal(next.status, 'draft');
  sqlite.close();
});

test('historial lista solo completed, ordena y calcula agregados y duración', async () => {
  const { sqlite, sessions, execution, history } = await setup();
  const first = await sessions.createDraft();
  const firstExercise = await addAndStart(sessions, first.id, 'BACK_SQUAT', 'BACK_SQUAT.BARBELL', 'first-exercise');
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: firstExercise.id, doseValue: 8, loadValue: 50 });
  await history.completeSession(first.id, null, '2026-05-01T11:30:00.000Z');

  const second = await sessions.createDraft();
  const secondExercise = await addAndStart(
    sessions, second.id, 'ROW', 'ROW.BARBELL', 'second-exercise', '2026-05-02T10:00:00.000Z',
  );
  await sessions.addExercise({
    id: 'zero-set-exercise', sessionId: second.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL',
  });
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: secondExercise.id, doseValue: 10, loadValue: 45 });
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: secondExercise.id, doseValue: 11, loadValue: 47 });
  await history.completeSession(second.id, 'Segunda', '2026-05-02T10:45:00.000Z');
  await sessions.createDraft('2026-05-03T10:00:00.000Z');

  const list = await history.listCompletedSessions();
  assert.deepEqual(list.map((item) => item.id), [second.id, first.id]);
  assert.deepEqual([list[0].exerciseCount, list[0].setCount, list[0].durationMs], [2, 2, 45 * 60_000]);
  const detail = await history.getCompletedSessionDetail(second.id);
  assert.deepEqual(detail?.exercises.map((item) => item.id), ['second-exercise', 'zero-set-exercise']);
  assert.deepEqual(detail?.exercises[0].sets.map((item) => item.setIndex), [0, 1]);
  assert.equal(detail?.exercises[1].sets.length, 0);
  sqlite.close();
});

test('el detalle histórico usa snapshots y semántica persistida, no el catálogo actual', async () => {
  const { sqlite, catalog, sessions, execution, history } = await setup();
  const exercise = await catalog.createCustomExercise({
    id: 'HISTORY_CUSTOM', groupId: 'CHEST', nameEs: 'Press histórico',
  });
  const configuration = await catalog.createCustomConfiguration({
    id: 'HISTORY_CUSTOM.CONFIG', exerciseId: exercise.id, nameEs: 'Configuración histórica',
    equipmentOptions: ['MACHINE'], doseUnit: 'reps', loadMode: 'DISPLAYED_KG',
  });
  const session = await sessions.createDraft();
  const item = await addAndStart(
    sessions, session.id, exercise.id, configuration.id, 'historical-item',
  );
  await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: item.id, doseValue: 12, loadValue: 35,
  });
  await history.completeSession(session.id, null);

  await catalog.updateCustomExercise(exercise.id, { nameEs: 'Nombre nuevo' });
  await catalog.updateCustomConfiguration(configuration.id, {
    nameEs: 'Configuración nueva', doseUnit: 'seconds', loadMode: 'BAND_LABEL',
  });
  await catalog.setCustomConfigurationActive(configuration.id, false);
  await catalog.setCustomExerciseActive(exercise.id, false);

  const detail = await history.getCompletedSessionDetail(session.id);
  assert.equal(detail?.exercises[0].exerciseNameSnapshot, 'Press histórico');
  assert.equal(detail?.exercises[0].configurationNameSnapshot, 'Configuración histórica');
  assert.equal(detail?.exercises[0].sets[0].doseUnit, 'reps');
  assert.equal(detail?.exercises[0].sets[0].loadMode, 'DISPLAYED_KG');
  assert.equal(detail?.exercises[0].sets[0].loadValue, 35);
  sqlite.close();
});
