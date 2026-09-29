import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { initializeDatabase } from '../src/data/database.ts';
import { createPerformedSetRepository } from '../src/data/performedSetRepository.ts';
import { createTrainingSessionRepository } from '../src/data/trainingSessionRepository.ts';
import type { Database } from '../src/data/types.ts';

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
      try { await task(database); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, database };
}

async function migratedDatabase() {
  const value = createDatabase();
  await initializeDatabase(value.database);
  return value;
}

function seedCatalog(sqlite: DatabaseSync) {
  sqlite.exec(`
    INSERT INTO exercise_groups (id, name_es, sort_order) VALUES ('TEST_GROUP', 'Grupo test', 0);
    INSERT INTO exercises
      (id, group_id, name_es, origin, created_at, updated_at)
      VALUES ('TEST_EXERCISE', 'TEST_GROUP', 'Ejercicio test', 'SYSTEM', '2026-01-01', '2026-01-01');
    INSERT INTO exercise_configurations
      (id, exercise_id, name_es, equipment_options, dose_unit, load_mode, origin, created_at, updated_at)
      VALUES ('TEST_CONFIG', 'TEST_EXERCISE', 'Configuración test', '["DUMBBELL"]',
        'reps', 'TOTAL_KG', 'SYSTEM', '2026-01-01', '2026-01-01');
  `);
}

async function createExerciseFixture(database: Database, sqlite: DatabaseSync) {
  seedCatalog(sqlite);
  const sessions = createTrainingSessionRepository(database);
  const sets = createPerformedSetRepository(database);
  await sessions.create({ id: 'session-1', status: 'in_progress', now: '2026-01-01T10:00:00.000Z' });
  const exercise = await sets.createSessionExercise({
    id: 'session-exercise-1', sessionId: 'session-1', exerciseId: 'TEST_EXERCISE',
    configurationId: 'TEST_CONFIG', exerciseNameSnapshot: 'Ejercicio test',
    configurationNameSnapshot: 'Configuración test', orderIndex: 0,
    now: '2026-01-01T10:01:00.000Z',
  });
  return { sets, exercise };
}

test('una DB vacía migra correctamente al schema v1', async () => {
  const { sqlite, database } = createDatabase();
  await initializeDatabase(database);
  const tables = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all().map((row) => String(row.name));
  assert.deepEqual(tables, [
    'exercise_configurations', 'exercise_groups', 'exercises', 'performed_sets',
    'schema_metadata', 'session_exercises', 'training_sessions',
  ]);
  assert.equal(sqlite.prepare("SELECT value FROM schema_metadata WHERE key = 'version'").get()?.value, '1');
  assert.equal(sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  sqlite.close();
});

test('la inicialización es idempotente', async () => {
  const { sqlite, database } = await migratedDatabase();
  await assert.doesNotReject(initializeDatabase(database));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM schema_metadata WHERE key = 'version'").get()?.total, 1);
  sqlite.close();
});

test('el repositorio crea y recupera una sesión draft', async () => {
  const { sqlite, database } = await migratedDatabase();
  const repository = createTrainingSessionRepository(database);
  const created = await repository.create({ id: 'draft-1', note: 'Sesión manual', now: '2026-01-01T10:00:00.000Z' });
  assert.equal(created.status, 'draft');
  assert.equal(created.createdAt, '2026-01-01T10:00:00.000Z');
  assert.deepEqual(await repository.getById('draft-1'), created);
  sqlite.close();
});

test('una sesión no acepta estados inválidos', async () => {
  const { sqlite } = await migratedDatabase();
  assert.throws(() => sqlite.prepare(
    'INSERT INTO training_sessions (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run('bad', 'paused', 'now', 'now'), /CHECK constraint failed/);
  sqlite.close();
});

test('se crea y recupera un session_exercise y una performed_set válida', async () => {
  const { sqlite, database } = await migratedDatabase();
  const { sets, exercise } = await createExerciseFixture(database, sqlite);
  assert.equal(exercise.configurationId, 'TEST_CONFIG');
  assert.equal(exercise.exerciseNameSnapshot, 'Ejercicio test');
  const performed = await sets.createSet({
    id: 'set-1', sessionExerciseId: exercise.id, setIndex: 0, doseUnit: 'reps', doseValue: 8,
    loadMode: 'TOTAL_KG', loadValue: 40, rir: 2, now: '2026-01-01T10:05:00.000Z',
  });
  assert.equal(performed.doseValue, 8);
  assert.equal(performed.rir, 2);
  assert.deepEqual(await sets.getSetById('set-1'), performed);
  sqlite.close();
});

test('RIR fuera de 0-5 se rechaza', async () => {
  const { sqlite, database } = await migratedDatabase();
  const { sets, exercise } = await createExerciseFixture(database, sqlite);
  await assert.rejects(sets.createSet({
    id: 'bad-rir', sessionExerciseId: exercise.id, setIndex: 0, doseUnit: 'reps',
    doseValue: 8, loadMode: 'NONE', rir: 6,
  }), /RIR debe ser/);
  sqlite.close();
});

test('dose_value menor o igual que cero se rechaza', async () => {
  const { sqlite, database } = await migratedDatabase();
  const { sets, exercise } = await createExerciseFixture(database, sqlite);
  await assert.rejects(sets.createSet({
    id: 'bad-dose', sessionExerciseId: exercise.id, setIndex: 0, doseUnit: 'reps',
    doseValue: 0, loadMode: 'NONE',
  }), /dosis debe ser mayor/);
  sqlite.close();
});

test('carga inválida se rechaza antes de escribir y sin filtrar errores SQLite', async () => {
  const { sqlite, database } = await migratedDatabase();
  const { sets, exercise } = await createExerciseFixture(database, sqlite);
  await assert.rejects(sets.createSet({
    id: 'negative-load', sessionExerciseId: exercise.id, setIndex: 0,
    doseUnit: 'reps', doseValue: 8, loadMode: 'TOTAL_KG', loadValue: -1,
  }), /carga numérica mayor o igual/);
  await assert.rejects(sets.createSet({
    id: 'wrong-band', sessionExerciseId: exercise.id, setIndex: 0,
    doseUnit: 'reps', doseValue: 8, loadMode: 'BAND_LABEL', loadValue: 10,
  }), /etiqueta/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM performed_sets').get()?.count, 0);
  sqlite.close();
});

test('no pueden existir dos sesiones in_progress', async () => {
  const { sqlite, database } = await migratedDatabase();
  const repository = createTrainingSessionRepository(database);
  await repository.create({ id: 'active-1', status: 'in_progress' });
  await assert.rejects(repository.create({ id: 'active-2', status: 'in_progress' }), /UNIQUE constraint failed/);
  sqlite.close();
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  }));
  return nested.flat().filter((file) => /\.(ts|tsx)$/.test(file));
}

test('la UI y la capa feature no contienen SQL directo', async () => {
  const files = [...await sourceFiles('app'), ...await sourceFiles('src/features')];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|PRAGMA)\b/i, file);
  }
});
