import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { createCatalogRepository } from '../src/data/catalogRepository.ts';
import { seedSystemCatalog } from '../src/data/catalogSeed.ts';
import { initializeDatabase } from '../src/data/database.ts';
import { createManualSessionRepository } from '../src/data/manualSessionRepository.ts';
import { createSessionExecutionRepository } from '../src/data/sessionExecutionRepository.ts';
import type { Database, DatabaseConnection } from '../src/data/types.ts';
import type { CatalogSeedData } from '../src/domain/catalog.ts';
import { createUuid } from '../src/domain/id.ts';
import { INITIAL_REST_TIMER, restTimerReducer } from '../src/features/training/restTimer.ts';

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
  const sessions = createManualSessionRepository(value.database);
  return { ...value, sessions, execution: createSessionExecutionRepository(value.database) };
}

async function inProgressFixture(
  sessions: ReturnType<typeof createManualSessionRepository>,
  exerciseId = 'BACK_SQUAT',
  configurationId = 'BACK_SQUAT.BARBELL',
  sessionExerciseId = 'session-exercise-1',
) {
  const session = await sessions.createDraft('2026-04-01T10:00:00.000Z');
  const selectedEquipment = configurationId === 'FRONT_OR_GOBLET_SQUAT.GOBLET'
    || configurationId === 'GRIP_CARRY.FARMER' ? 'DUMBBELL' : undefined;
  const selectedGrip = configurationId === 'PULL_UP.ASSISTED_MACHINE' ? 'PRONATED' : undefined;
  const exercise = await sessions.addExercise({
    id: sessionExerciseId, sessionId: session.id, exerciseId, configurationId,
    selectedEquipment, selectedGrip,
    now: '2026-04-01T10:01:00.000Z',
  });
  await sessions.startSession(session.id, '2026-04-01T10:02:00.000Z');
  return { session, exercise };
}

test('una serie solo existe tras confirmar y se guarda con UUID y timestamps', async () => {
  const { sqlite, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions);
  assert.equal((await execution.listSets(exercise.id)).length, 0);
  const attemptId = createUuid();
  const created = await execution.confirmSet({
    attemptId, sessionExerciseId: exercise.id, doseValue: 8, loadValue: 50,
    now: '2026-04-01T10:05:00.000Z',
  });
  assert.match(created.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(created.confirmedAt, '2026-04-01T10:05:00.000Z');
  assert.equal(created.createdAt, created.confirmedAt);
  assert.equal(created.updatedAt, created.confirmedAt);
  sqlite.close();
});

test('doble confirmación del mismo intento no duplica y set_index es consecutivo', async () => {
  const { sqlite, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions);
  const input = { attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 40 };
  const first = await execution.confirmSet(input);
  const repeated = await execution.confirmSet({ ...input, doseValue: 99, loadValue: 99 });
  await execution.confirmSet({ ...input, attemptId: createUuid(), doseValue: 10 });
  assert.deepEqual(repeated, first);
  assert.deepEqual((await execution.listSets(exercise.id)).map((item) => item.setIndex), [0, 1]);
  sqlite.close();
});

test('conserva correctamente reps, seconds y meters', async () => {
  const cases = [
    ['BACK_SQUAT', 'BACK_SQUAT.BARBELL', 'reps'],
    ['ANTI_EXTENSION', 'ANTI_EXTENSION.PLANK', 'seconds'],
    ['GRIP_CARRY', 'GRIP_CARRY.FARMER', 'meters'],
  ] as const;
  for (const [exerciseId, configurationId, expectedUnit] of cases) {
    const { sqlite, sessions, execution } = await setup();
    const { exercise } = await inProgressFixture(sessions, exerciseId, configurationId);
    const context = await execution.getExecutionContext(exercise.id);
    const loadValue = context.load_mode === 'BODYWEIGHT' ? null : 20;
    const created = await execution.confirmSet({
      attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 12, loadValue,
    });
    assert.equal(created.doseUnit, expectedUnit);
    assert.equal(created.doseValue, 12);
    sqlite.close();
  }
});

test('rechaza dosis no positiva y RIR fuera de 0-5', async () => {
  const { sqlite, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions);
  await assert.rejects(execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 0, loadValue: 10,
  }), /mayor que cero/);
  await assert.rejects(execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 10, rir: 6,
  }), /RIR/);
  sqlite.close();
});

test('los cuatro modos numéricos guardan load_value', async () => {
  const cases = [
    ['BACK_SQUAT', 'BACK_SQUAT.BARBELL', 'TOTAL_KG'],
    ['FRONT_OR_GOBLET_SQUAT', 'FRONT_OR_GOBLET_SQUAT.GOBLET', 'IMPLEMENT_KG'],
    ['LEG_PRESS', 'LEG_PRESS.MACHINE_45', 'DISPLAYED_KG'],
    ['PULL_UP', 'PULL_UP.ASSISTED_MACHINE', 'ASSISTANCE_KG'],
  ] as const;
  for (const [exerciseId, configurationId, loadMode] of cases) {
    const { sqlite, sessions, execution } = await setup();
    const { exercise } = await inProgressFixture(sessions, exerciseId, configurationId);
    const created = await execution.confirmSet({
      attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 25,
    });
    assert.equal(created.loadMode, loadMode);
    assert.equal(created.loadValue, 25);
    assert.equal(created.loadLabel, null);
    sqlite.close();
  }
});

test('BAND_LABEL guarda etiqueta sin valor numérico', async () => {
  const { sqlite, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(
    sessions, 'FRONT_OR_GOBLET_SQUAT', 'FRONT_OR_GOBLET_SQUAT.BAND',
  );
  const created = await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 10, loadLabel: 'Roja',
  });
  assert.equal(created.loadLabel, 'Roja');
  assert.equal(created.loadValue, null);
  sqlite.close();
});

test('BODYWEIGHT y NONE rechazan carga y ningún modo acepta valor más etiqueta', async () => {
  for (const [exerciseId, configurationId] of [
    ['SPLIT_SQUAT', 'SPLIT_SQUAT.BODYWEIGHT'],
    ['CUSTOM_NONE', 'CUSTOM_NONE.NONE'],
  ] as const) {
    const { sqlite, database, sessions, execution } = await setup();
    if (exerciseId === 'CUSTOM_NONE') {
      const catalog = createCatalogRepository(database);
      await catalog.createCustomExercise({ id: exerciseId, groupId: 'CORE', nameEs: 'Sin carga' });
      await catalog.createCustomConfiguration({
        id: configurationId, exerciseId, nameEs: 'Sin carga', equipmentOptions: ['BODYWEIGHT'],
        doseUnit: 'reps', loadMode: 'NONE',
      });
    }
    const { exercise } = await inProgressFixture(sessions, exerciseId, configurationId);
    await assert.rejects(execution.confirmSet({
      attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 1,
    }), /no admite datos de carga/);
    sqlite.close();
  }
  const { sqlite, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions);
  await assert.rejects(execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8,
    loadValue: 10, loadLabel: 'doble',
  }), /simultáneamente/);
  sqlite.close();
});

test('per_side se guarda explícitamente solo para lateralidad aplicable', async () => {
  const { sqlite, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions, 'SPLIT_SQUAT', 'SPLIT_SQUAT.BODYWEIGHT');
  const perSide = await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, perSide: true,
  });
  assert.equal(perSide.perSide, true);
  sqlite.close();
});

test('editar conserva ID y confirmed_at y no permite un session_exercise ajeno', async () => {
  const { sqlite, sessions, execution } = await setup();
  const session = await sessions.createDraft();
  const firstExercise = await sessions.addExercise({
    id: 'first-exercise', sessionId: session.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL',
  });
  const secondExercise = await sessions.addExercise({
    id: 'second-exercise', sessionId: session.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL',
  });
  await sessions.startSession(session.id);
  const created = await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: firstExercise.id, doseValue: 8, loadValue: 40,
    now: '2026-04-01T10:05:00.000Z',
  });
  const edited = await execution.editSet({
    setId: created.id, sessionExerciseId: firstExercise.id, doseValue: 10, loadValue: 45,
    now: '2026-04-01T10:06:00.000Z',
  });
  assert.equal(edited.id, created.id);
  assert.equal(edited.confirmedAt, created.confirmedAt);
  assert.equal(edited.updatedAt, '2026-04-01T10:06:00.000Z');
  await assert.rejects(execution.editSet({
    setId: created.id, sessionExerciseId: secondExercise.id, doseValue: 5, loadValue: 5,
  }), /no pertenece/);
  sqlite.close();
});

test('eliminar compacta set_index y un fallo intermedio hace rollback completo', async () => {
  const { sqlite, database, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions);
  const values = [];
  for (let index = 0; index < 3; index += 1) values.push(await execution.confirmSet({
    attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: index + 5, loadValue: 40,
  }));
  await execution.deleteSet(exercise.id, values[1].id);
  assert.deepEqual((await execution.listSets(exercise.id)).map((item) => item.setIndex), [0, 1]);

  const failingDatabase: Database = {
    ...database,
    withExclusiveTransactionAsync: async (task) => {
      const transaction: DatabaseConnection = {
        execAsync: database.execAsync, getFirstAsync: database.getFirstAsync, getAllAsync: database.getAllAsync,
        runAsync: async (sql, ...params) => {
          if (sql.includes('UPDATE performed_sets SET set_index = set_index +')) throw new Error('fallo simulado');
          return database.runAsync(sql, ...params);
        },
      };
      sqlite.exec('BEGIN');
      try { await task(transaction); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const failingExecution = createSessionExecutionRepository(failingDatabase);
  const before = await execution.listSets(exercise.id);
  await assert.rejects(failingExecution.deleteSet(exercise.id, before[0].id), /fallo simulado/);
  assert.deepEqual(await execution.listSets(exercise.id), before);
  sqlite.close();
});

test('nota, añadir y reordenar funcionan durante in_progress sin crear series', async () => {
  const { sqlite, sessions, execution } = await setup();
  const { session, exercise } = await inProgressFixture(sessions);
  await execution.updateExerciseNote(exercise.id, 'Controlar técnica');
  const added = await sessions.addExercise({
    id: 'added-live', sessionId: session.id, exerciseId: 'ROW', configurationId: 'ROW.BARBELL',
  });
  assert.equal((await execution.listSets(added.id)).length, 0);
  const reordered = await sessions.reorderExercises(session.id, [added.id, exercise.id]);
  assert.deepEqual(reordered.map((item) => item.id), [added.id, exercise.id]);
  assert.equal(reordered.find((item) => item.id === exercise.id)?.note, 'Controlar técnica');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM performed_sets').get()?.count, 0);
  sqlite.close();
});

test('reabrir el repositorio recupera todas las series confirmadas', async () => {
  const { sqlite, database, sessions, execution } = await setup();
  const { exercise } = await inProgressFixture(sessions);
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 40 });
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 9, loadValue: 42 });
  const reopened = createSessionExecutionRepository(database);
  assert.equal((await reopened.listSets(exercise.id)).length, 2);
  sqlite.close();
});

test('el temporizador es estado efímero y no escribe datos históricos', async () => {
  const { sqlite } = await setup();
  const before = sqlite.prepare('SELECT COUNT(*) AS count FROM performed_sets').get()?.count;
  const started = restTimerReducer(INITIAL_REST_TIMER, { type: 'start', seconds: 60 });
  const ticked = restTimerReducer(started, { type: 'tick' });
  const cancelled = restTimerReducer(ticked, { type: 'cancel' });
  assert.deepEqual([started.remaining, ticked.remaining, cancelled], [60, 59, INITIAL_REST_TIMER]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM performed_sets').get()?.count, before);
  sqlite.close();
});
