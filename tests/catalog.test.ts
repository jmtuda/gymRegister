import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import { createCatalogRepository } from '../src/data/catalogRepository.ts';
import { initializeDatabase } from '../src/data/database.ts';
import { seedSystemCatalog } from '../src/data/catalogSeed.ts';
import type { Database } from '../src/data/types.ts';
import type { CatalogSeedData, ExerciseConfiguration } from '../src/domain/catalog.ts';
import { configurationDetails } from '../src/features/exercises/catalogPresentation.ts';

async function approvedCatalog(): Promise<CatalogSeedData> {
  return JSON.parse(await readFile('data/catalog.v0.2.json', 'utf8')) as CatalogSeedData;
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
      try { await task(database); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, database };
}

async function seededDatabase() {
  const value = createDatabase();
  await initializeDatabase(value.database);
  await seedSystemCatalog(value.database, await approvedCatalog());
  return value;
}

test('el seed produce exactamente 9 grupos, 29 ejercicios SYSTEM y 108 configuraciones SYSTEM', async () => {
  const { sqlite } = await seededDatabase();
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM exercise_groups').get()?.count, 9);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM exercises WHERE origin = 'SYSTEM'").get()?.count, 29);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM exercise_configurations WHERE origin = 'SYSTEM'").get()?.count, 108);
  sqlite.close();
});

test('la inicialización de la app ejecuta schema y seed aprobado', async () => {
  const layout = await readFile('app/_layout.tsx', 'utf8');
  const initialization = await readFile('src/data/initializeAppDatabase.ts', 'utf8');
  assert.match(layout, /onInit=\{initializeAppDatabase\}/);
  assert.match(initialization, /initializeDatabase\(database\)/);
  assert.match(initialization, /seedSystemCatalog\(database, APPROVED_CATALOG\)/);
});

test('ejecutar el seed dos veces no duplica datos ni borra CUSTOM', async () => {
  const { sqlite, database } = await seededDatabase();
  const repository = createCatalogRepository(database);
  const custom = await repository.createCustomExercise({ id: 'custom-keep', groupId: 'CHEST', nameEs: 'Personalizado' });
  await repository.setCustomExerciseActive(custom.id, false);
  await seedSystemCatalog(database, await approvedCatalog());
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM exercise_groups').get()?.count, 9);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM exercises WHERE origin = 'SYSTEM'").get()?.count, 29);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM exercise_configurations WHERE origin = 'SYSTEM'").get()?.count, 108);
  assert.equal(sqlite.prepare("SELECT active FROM exercises WHERE id = 'custom-keep'").get()?.active, 0);
  sqlite.close();
});

test('todas las referencias SYSTEM son válidas y sus IDs son únicos', async () => {
  const catalog = await approvedCatalog();
  const groupIds = new Set(catalog.groups.map((item) => item.id));
  const exerciseIds = new Set(catalog.exercises.map((item) => item.id));
  assert.ok(catalog.exercises.every((item) => groupIds.has(item.groupId)));
  assert.ok(catalog.configurations.every((item) => exerciseIds.has(item.exerciseId)));
  assert.equal(groupIds.size, catalog.groups.length);
  assert.equal(exerciseIds.size, catalog.exercises.length);
  assert.equal(new Set(catalog.configurations.map((item) => item.id)).size, catalog.configurations.length);
});

test('los listados devuelven solo elementos activos y getById recupera inactivos', async () => {
  const { sqlite, database } = await seededDatabase();
  const repository = createCatalogRepository(database);
  const exercise = await repository.createCustomExercise({ id: 'inactive-exercise', groupId: 'CHEST', nameEs: 'Oculto' });
  await repository.setCustomExerciseActive(exercise.id, false);
  assert.equal((await repository.listExercisesByGroup('CHEST')).some((item) => item.id === exercise.id), false);
  assert.equal((await repository.getExerciseById(exercise.id))?.active, false);
  const configuration = await repository.createCustomConfiguration({
    id: 'inactive-config', exerciseId: 'CHEST_PRESS', nameEs: 'Oculta',
    equipmentOptions: ['MACHINE'], doseUnit: 'reps', loadMode: 'DISPLAYED_KG',
  });
  await repository.setCustomConfigurationActive(configuration.id, false);
  assert.equal((await repository.listConfigurationsByExercise('CHEST_PRESS')).some((item) => item.id === configuration.id), false);
  assert.equal((await repository.getConfigurationById(configuration.id))?.active, false);
  sqlite.close();
});

test('se crea, recupera y edita un ejercicio CUSTOM', async () => {
  const { sqlite, database } = await seededDatabase();
  const repository = createCatalogRepository(database);
  const created = await repository.createCustomExercise({
    id: 'custom-exercise', groupId: 'BACK', nameEs: 'Remo personal', primaryMuscles: ['dorsal'],
    now: '2026-02-01T10:00:00.000Z',
  });
  assert.equal(created.origin, 'CUSTOM');
  assert.deepEqual(await repository.getExerciseById(created.id), created);
  const updated = await repository.updateCustomExercise(created.id, {
    nameEs: 'Remo personal editado', now: '2026-02-02T10:00:00.000Z',
  });
  assert.equal(updated.nameEs, 'Remo personal editado');
  assert.equal(updated.updatedAt, '2026-02-02T10:00:00.000Z');
  sqlite.close();
});

test('se crea, recupera y edita una configuración CUSTOM', async () => {
  const { sqlite, database } = await seededDatabase();
  const repository = createCatalogRepository(database);
  const created = await repository.createCustomConfiguration({
    id: 'custom-configuration', exerciseId: 'CHEST_PRESS', nameEs: 'Máquina del gimnasio',
    equipmentOptions: ['MACHINE'], doseUnit: 'reps', loadMode: 'DISPLAYED_KG',
  });
  assert.equal(created.origin, 'CUSTOM');
  assert.deepEqual(await repository.getConfigurationById(created.id), created);
  const updated = await repository.updateCustomConfiguration(created.id, { nameEs: 'Máquina convergente' });
  assert.equal(updated.nameEs, 'Máquina convergente');
  sqlite.close();
});

test('no se permite modificar elementos SYSTEM mediante operaciones CUSTOM', async () => {
  const { sqlite, database } = await seededDatabase();
  const repository = createCatalogRepository(database);
  await assert.rejects(repository.updateCustomExercise('CHEST_PRESS', { nameEs: 'No permitido' }), /SYSTEM/);
  await assert.rejects(repository.setCustomExerciseActive('CHEST_PRESS', false), /SYSTEM/);
  await assert.rejects(repository.updateCustomConfiguration('CHEST_PRESS.MACHINE', { nameEs: 'No permitido' }), /SYSTEM/);
  await assert.rejects(repository.setCustomConfigurationActive('CHEST_PRESS.MACHINE', false), /SYSTEM/);
  sqlite.close();
});

test('los campos no aplicables no generan filas de detalle para la UI', () => {
  const configuration = {
    id: 'config', exerciseId: 'exercise', nameEs: 'Sin campos opcionales',
    equipmentOptions: ['BODYWEIGHT'], lateralityOptions: [], gripOptions: [], gripWidthOptions: [],
    attachment: null, auxiliaryEquipment: [], bandType: [], anchorRequired: false,
    anchorHeightOptions: [], doseUnit: 'reps', loadMode: 'BODYWEIGHT', origin: 'CUSTOM',
    active: true, createdAt: 'now', updatedAt: 'now',
  } satisfies ExerciseConfiguration;
  assert.deepEqual(configurationDetails(configuration), [{ label: 'Equipamiento', value: 'Peso corporal' }]);
});
