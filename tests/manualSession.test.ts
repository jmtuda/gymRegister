import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { createCatalogRepository } from '../src/data/catalogRepository.ts';
import { seedSystemCatalog } from '../src/data/catalogSeed.ts';
import { initializeDatabase } from '../src/data/database.ts';
import { createManualSessionRepository } from '../src/data/manualSessionRepository.ts';
import type { Database, DatabaseConnection } from '../src/data/types.ts';
import type { CatalogSeedData } from '../src/domain/catalog.ts';

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

async function setup() {
  const value = createDatabase();
  await initializeDatabase(value.database);
  const catalog = JSON.parse(await readFile('data/catalog.v0.2.json', 'utf8')) as CatalogSeedData;
  await seedSystemCatalog(value.database, catalog);
  return { ...value, sessions: createManualSessionRepository(value.database) };
}

async function addBackSquat(sessions: ReturnType<typeof createManualSessionRepository>, sessionId: string, id = 'session-exercise-1') {
  return sessions.addExercise({
    id, sessionId, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL',
    now: '2026-03-01T10:01:00.000Z',
  });
}

test('crea y recupera la sesión draft al reabrir el flujo', async () => {
  const { sqlite, sessions } = await setup();
  const created = await sessions.createDraft('2026-03-01T10:00:00.000Z');
  assert.equal(created.status, 'draft');
  const reopenedDatabase: Database = {
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params as SQLInputValue[]),
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) => (sqlite.prepare(sql).get(...params as SQLInputValue[]) as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...params as SQLInputValue[]) as T[],
    withExclusiveTransactionAsync: async (task) => { sqlite.exec('BEGIN'); try { await task(reopenedDatabase); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } },
  };
  const reopened = createManualSessionRepository(reopenedDatabase);
  assert.deepEqual(await reopened.getCurrentDraft(), created);
  sqlite.close();
});

test('el flujo normal y una doble acción concurrente no crean múltiples drafts', async () => {
  const { sqlite, sessions } = await setup();
  const [first, second] = await Promise.all([sessions.createDraft(), sessions.createDraft()]);
  assert.equal(first.id, second.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE status = 'draft'").get()?.count, 1);
  sqlite.close();
});

test('añade una configuración válida, guarda selecciones y snapshots obligatorios', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  const added = await sessions.addExercise({
    id: 'curl-1', sessionId: session.id, exerciseId: 'BICEPS_CURL',
    configurationId: 'BICEPS_CURL.DUMBBELL', selectedEquipment: 'DUMBBELL',
    selectedLaterality: 'ALTERNATING', selectedGrip: 'SUPINATED', selectedGripWidth: 'NARROW',
  });
  assert.equal(added.exerciseNameSnapshot, 'Curl de bíceps');
  assert.equal(added.configurationNameSnapshot, 'Curl de bíceps con mancuernas');
  assert.deepEqual(
    [added.selectedEquipment, added.selectedLaterality, added.selectedGrip, added.selectedGripWidth],
    ['DUMBBELL', 'ALTERNATING', 'SUPINATED', 'NARROW'],
  );
  sqlite.close();
});

test('rechaza selecciones que no pertenecen a la configuración', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  await assert.rejects(sessions.addExercise({
    sessionId: session.id, exerciseId: 'BACK_SQUAT', configurationId: 'BACK_SQUAT.BARBELL',
    selectedEquipment: 'DUMBBELL',
  }), /no pertenece/);
  sqlite.close();
});

test('elementos inactivos no se ofrecen, pero los ya añadidos siguen recuperables', async () => {
  const { sqlite, database, sessions } = await setup();
  const catalog = createCatalogRepository(database);
  const customExercise = await catalog.createCustomExercise({ id: 'custom-exercise', groupId: 'CHEST', nameEs: 'Press propio' });
  const customConfiguration = await catalog.createCustomConfiguration({
    id: 'custom-config', exerciseId: customExercise.id, nameEs: 'Máquina propia',
    equipmentOptions: ['MACHINE'], doseUnit: 'reps', loadMode: 'DISPLAYED_KG',
  });
  const session = await sessions.createDraft();
  const added = await sessions.addExercise({
    id: 'custom-added', sessionId: session.id, exerciseId: customExercise.id,
    configurationId: customConfiguration.id,
  });
  await catalog.updateCustomExercise(customExercise.id, { nameEs: 'Press renombrado' });
  await catalog.updateCustomConfiguration(customConfiguration.id, { nameEs: 'Máquina renombrada' });
  await catalog.setCustomConfigurationActive(customConfiguration.id, false);
  await catalog.setCustomExerciseActive(customExercise.id, false);
  assert.equal((await catalog.listExercisesByGroup('CHEST')).some((item) => item.id === customExercise.id), false);
  assert.equal((await sessions.listSessionExercises(session.id))[0].id, added.id);
  assert.equal((await sessions.listSessionExercises(session.id))[0].exerciseNameSnapshot, 'Press propio');
  assert.equal((await sessions.listSessionExercises(session.id))[0].configurationNameSnapshot, 'Máquina propia');
  sqlite.close();
});

test('admite múltiples ejercicios sin límite lógico artificial', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  for (let index = 0; index < 40; index += 1) await addBackSquat(sessions, session.id, `item-${index}`);
  assert.equal((await sessions.listSessionExercises(session.id)).length, 40);
  sqlite.close();
});

test('elimina un ejercicio draft y compacta el orden', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  await addBackSquat(sessions, session.id, 'first');
  await addBackSquat(sessions, session.id, 'second');
  await addBackSquat(sessions, session.id, 'third');
  await sessions.removeExercise(session.id, 'second');
  const remaining = await sessions.listSessionExercises(session.id);
  assert.deepEqual(remaining.map((item) => item.id), ['first', 'third']);
  assert.deepEqual(remaining.map((item) => item.orderIndex), [0, 1]);
  sqlite.close();
});

test('reordena atómicamente sin duplicar order_index', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  await addBackSquat(sessions, session.id, 'first');
  await addBackSquat(sessions, session.id, 'second');
  await addBackSquat(sessions, session.id, 'third');
  const reordered = await sessions.reorderExercises(session.id, ['third', 'first', 'second']);
  assert.deepEqual(reordered.map((item) => [item.id, item.orderIndex]), [['third', 0], ['first', 1], ['second', 2]]);
  await assert.rejects(sessions.reorderExercises(session.id, ['first', 'missing', 'third']), /exactamente/);
  assert.deepEqual((await sessions.listSessionExercises(session.id)).map((item) => item.id), ['third', 'first', 'second']);
  sqlite.close();
});

test('un fallo intermedio en el handle exclusivo revierte por completo la reordenación', async () => {
  const { sqlite, database, sessions } = await setup();
  const session = await sessions.createDraft();
  await addBackSquat(sessions, session.id, 'first');
  await addBackSquat(sessions, session.id, 'second');
  await addBackSquat(sessions, session.id, 'third');

  const failingDatabase: Database = {
    ...database,
    withExclusiveTransactionAsync: async (task) => {
      let positionWrites = 0;
      const transaction: DatabaseConnection = {
        execAsync: database.execAsync,
        getFirstAsync: database.getFirstAsync,
        getAllAsync: database.getAllAsync,
        runAsync: async (sql, ...params) => {
          if (sql.includes('UPDATE session_exercises SET order_index = ?')) {
            positionWrites += 1;
            if (positionWrites === 2) throw new Error('fallo intermedio simulado');
          }
          return database.runAsync(sql, ...params);
        },
      };
      sqlite.exec('BEGIN');
      try { await task(transaction); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const failingSessions = createManualSessionRepository(failingDatabase);
  await assert.rejects(
    failingSessions.reorderExercises(session.id, ['third', 'second', 'first']),
    /fallo intermedio simulado/,
  );
  assert.deepEqual(
    (await sessions.listSessionExercises(session.id)).map((item) => [item.id, item.orderIndex]),
    [['first', 0], ['second', 1], ['third', 2]],
  );
  sqlite.close();
});

test('la nota de sesión persiste', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  await sessions.updateNote(session.id, 'Trabajo suave', '2026-03-01T11:00:00.000Z');
  assert.equal((await sessions.getCurrentDraft())?.note, 'Trabajo suave');
  sqlite.close();
});

test('no inicia una sesión vacía', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  await assert.rejects(sessions.startSession(session.id), /al menos un ejercicio/);
  assert.equal((await sessions.getSessionById(session.id))?.status, 'draft');
  sqlite.close();
});

test('iniciar cambia a in_progress, fija started_at y no crea series', async () => {
  const { sqlite, sessions } = await setup();
  const session = await sessions.createDraft();
  await addBackSquat(sessions, session.id);
  const started = await sessions.startSession(session.id, '2026-03-01T12:00:00.000Z');
  assert.equal(started.status, 'in_progress');
  assert.equal(started.startedAt, '2026-03-01T12:00:00.000Z');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM performed_sets').get()?.count, 0);
  assert.equal((await sessions.getOpenSession())?.id, session.id);
  assert.equal((await sessions.getCurrentInProgress())?.id, session.id);
  sqlite.close();
});
