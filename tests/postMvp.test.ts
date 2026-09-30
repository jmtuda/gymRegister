import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

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
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) => (sqlite.prepare(sql).get(...params as SQLInputValue[]) as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...params as SQLInputValue[]) as T[],
    withExclusiveTransactionAsync: async (task) => { sqlite.exec('BEGIN'); try { await task(database); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } },
  };
  return { sqlite, database };
}

async function setup() {
  const value = createDatabase();
  await initializeDatabase(value.database);
  await seedSystemCatalog(value.database, JSON.parse(await readFile('data/catalog.v0.2.json', 'utf8')) as CatalogSeedData);
  return {
    ...value, sessions: createManualSessionRepository(value.database),
    execution: createSessionExecutionRepository(value.database), history: createHistoryRepository(value.database),
    exports: createExportRepository(value.database),
  };
}

test('confirmar una serie informa creación una sola vez para no duplicar el descanso', async () => {
  const { sqlite, sessions, execution } = await setup();
  const session = await sessions.createDraft();
  const exercise = await sessions.addExercise({ sessionId: session.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL' });
  await sessions.startSession(session.id);
  const input = { attemptId: createUuid(), sessionExerciseId: exercise.id, doseValue: 8, loadValue: 50 };
  const first = await execution.confirmSetWithStatus(input);
  const repeated = await execution.confirmSetWithStatus({ ...input, doseValue: 99, loadValue: 99 });
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.deepEqual(repeated.set, first.set);
  sqlite.close();
});

test('defaults priorizan la sesión actual, ignoran abiertas ajenas y no persisten nada', async () => {
  const { sqlite, sessions, execution, history } = await setup();
  const historical = await sessions.createDraft('2026-07-01T08:00:00.000Z');
  const oldExercise = await sessions.addExercise({ sessionId: historical.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL' });
  await sessions.startSession(historical.id);
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: oldExercise.id, doseValue: 8, loadValue: 50, rir: 2 });
  await history.completeSession(historical.id, null, '2026-07-01T09:00:00.000Z');

  const current = await sessions.createDraft('2026-07-02T08:00:00.000Z');
  const currentExercise = await sessions.addExercise({ sessionId: current.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL' });
  await sessions.startSession(current.id);
  assert.deepEqual(await execution.getReusableSetDefaults(currentExercise.id), {
    doseUnit: 'reps', doseValue: 8, perSide: false, loadMode: 'TOTAL_KG', loadValue: 50, loadLabel: null, rir: 2,
  });
  assert.equal((await execution.listSets(currentExercise.id)).length, 0);
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: currentExercise.id, doseValue: 10, loadValue: 55, rir: 1 });
  assert.equal((await execution.getReusableSetDefaults(currentExercise.id))?.doseValue, 10);
  sqlite.close();
});

test('defaults incompatibles con el load_mode actual se descartan', async () => {
  const { sqlite, database, sessions, execution, history } = await setup();
  await database.runAsync(`INSERT INTO exercises (id, group_id, name_es, origin, active, created_at, updated_at) VALUES ('CUSTOM_DEFAULT', 'CHEST', 'Prueba', 'CUSTOM', 1, 'x', 'x')`);
  await database.runAsync(`INSERT INTO exercise_configurations (id, exercise_id, name_es, equipment_options, dose_unit, load_mode, origin, active, created_at, updated_at) VALUES ('CUSTOM_DEFAULT.CONFIG', 'CUSTOM_DEFAULT', 'Prueba', '["MACHINE"]', 'reps', 'DISPLAYED_KG', 'CUSTOM', 1, 'x', 'x')`);
  const old = await sessions.createDraft();
  const oldExercise = await sessions.addExercise({ sessionId: old.id, exerciseId: 'CUSTOM_DEFAULT', configurationId: 'CUSTOM_DEFAULT.CONFIG' });
  await sessions.startSession(old.id);
  await execution.confirmSet({ attemptId: createUuid(), sessionExerciseId: oldExercise.id, doseValue: 10, loadValue: 40 });
  await history.completeSession(old.id);
  await database.runAsync(`UPDATE exercise_configurations SET load_mode = 'BODYWEIGHT' WHERE id = 'CUSTOM_DEFAULT.CONFIG'`);
  const current = await sessions.createDraft();
  const currentExercise = await sessions.addExercise({ sessionId: current.id, exerciseId: 'CUSTOM_DEFAULT', configurationId: 'CUSTOM_DEFAULT.CONFIG' });
  await sessions.startSession(current.id);
  assert.equal(await execution.getReusableSetDefaults(currentExercise.id), null);
  sqlite.close();
});

test('alta manual completed coexiste con in_progress, conserva tiempos, cero series y exporta hechos reales', async () => {
  const { sqlite, sessions, history, exports } = await setup();
  const open = await sessions.createDraft();
  await sessions.addExercise({ sessionId: open.id, exerciseId: 'ROW', configurationId: 'ROW.BARBELL' });
  await sessions.startSession(open.id, '2026-07-03T10:00:00.000Z');
  const manual = await sessions.createCompletedSessionManual({
    id: 'manual-completed', completedAt: '2026-07-02T18:00:00.000Z', durationMinutes: 75,
    note: 'Registro posterior', now: '2026-07-03T12:00:00.000Z',
    exercises: [
      { id: 'manual-exercise-1', exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL', note: 'Profundidad', sets: [{ id: 'manual-set-1', doseValue: 8, loadValue: 60, rir: 2 }] },
      { id: 'manual-exercise-empty', exerciseId: 'ANTI_EXTENSION', configurationId: 'ANTI_EXTENSION.PLANK', sets: [] },
    ],
  });
  assert.equal((await sessions.getCurrentInProgress())?.id, open.id);
  assert.deepEqual([manual.status, manual.startedAt, manual.completedAt, manual.createdAt], ['completed', '2026-07-02T16:45:00.000Z', '2026-07-02T18:00:00.000Z', '2026-07-03T12:00:00.000Z']);
  const detail = await history.getCompletedSessionDetail(manual.id);
  assert.equal(detail?.exercises.length, 2);
  assert.equal(detail?.exercises[1].sets.length, 0);
  assert.equal(detail?.exercises[0].sets[0].confirmedAt, '2026-07-03T12:00:00.000Z');
  const document = buildExportDocument(await exports.readCompletedSessions(), '2026-07-03T12:01:00.000Z');
  assert.match(serializeExportJson(document), /manual-exercise-empty/);
  const csv = serializeExportCsv(document);
  assert.match(csv, /manual-set-1/);
  assert.doesNotMatch(csv, /manual-exercise-empty/);
  sqlite.close();
});

test('alta manual hace rollback completo si una serie es inválida', async () => {
  const { sqlite, sessions } = await setup();
  await assert.rejects(sessions.createCompletedSessionManual({
    id: 'manual-invalid', completedAt: '2026-07-02T18:00:00.000Z',
    exercises: [{ id: 'manual-invalid-exercise', exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL', sets: [{ doseValue: 0, loadValue: 50 }] }],
  }), /dosis/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE id = 'manual-invalid'").get()?.count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM session_exercises WHERE id = 'manual-invalid-exercise'").get()?.count, 0);
  sqlite.close();
});

test('borrado completed es atómico, rechaza abiertas y desaparece de historial y exportación', async () => {
  const { sqlite, database, sessions, history, exports } = await setup();
  const open = await sessions.createDraft();
  await assert.rejects(history.deleteCompletedSession(open.id), /completada/);
  const completed = await sessions.createCompletedSessionManual({
    id: 'delete-me', completedAt: '2026-07-02T18:00:00.000Z',
    exercises: [{ id: 'delete-exercise', exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL', sets: [{ id: 'delete-set', doseValue: 8, loadValue: 50 }] }],
  });
  const originalRun = database.runAsync;
  database.runAsync = async (sql, ...params) => {
    const result = await originalRun(sql, ...params);
    if (sql.startsWith('DELETE FROM training_sessions')) throw new Error('fallo simulado');
    return result;
  };
  await assert.rejects(history.deleteCompletedSession(completed.id), /fallo simulado/);
  assert.equal((await history.getCompletedSessionById(completed.id))?.id, completed.id);
  database.runAsync = originalRun;
  await history.deleteCompletedSession(completed.id);
  assert.equal(await history.getCompletedSessionById(completed.id), null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM session_exercises WHERE id = 'delete-exercise'").get()?.count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM performed_sets WHERE id = 'delete-set'").get()?.count, 0);
  assert.equal((await exports.readCompletedSessions()).some((item) => item.session.id === completed.id), false);
  sqlite.close();
});
