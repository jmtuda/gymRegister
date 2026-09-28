import type { CatalogSeedData } from '../domain/catalog.ts';
import type { Database } from './types.ts';

const SYSTEM_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function assertApprovedCatalog(catalog: CatalogSeedData) {
  if (catalog.groups.length !== 9 || catalog.exercises.length !== 29 || catalog.configurations.length !== 108) {
    throw new Error('El catálogo aprobado debe contener exactamente 9 grupos, 29 ejercicios y 108 configuraciones.');
  }
  const ids = [...catalog.groups, ...catalog.exercises, ...catalog.configurations].map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('El catálogo aprobado contiene IDs duplicados.');
  if (catalog.exercises.some((item) => item.origin !== 'SYSTEM')
    || catalog.configurations.some((item) => item.origin !== 'SYSTEM')) {
    throw new Error('El catálogo inicial solo puede contener elementos SYSTEM.');
  }
}

export async function seedSystemCatalog(database: Database, catalog: CatalogSeedData): Promise<void> {
  assertApprovedCatalog(catalog);

  for (const group of catalog.groups) {
    await database.runAsync(
      `INSERT INTO exercise_groups (id, name_es, sort_order, active) VALUES (?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name_es = excluded.name_es, sort_order = excluded.sort_order`,
      group.id, group.nameEs, group.sortOrder,
    );
  }

  for (const exercise of catalog.exercises) {
    await database.runAsync(
      `INSERT INTO exercises
        (id, group_id, name_es, technical_pattern, primary_muscles, secondary_muscles,
         origin, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         group_id = excluded.group_id, name_es = excluded.name_es,
         technical_pattern = excluded.technical_pattern, primary_muscles = excluded.primary_muscles,
         secondary_muscles = excluded.secondary_muscles, active = excluded.active,
         updated_at = excluded.updated_at
       WHERE exercises.origin = 'SYSTEM'`,
      exercise.id, exercise.groupId, exercise.nameEs, exercise.technicalPattern ?? null,
      JSON.stringify(exercise.primaryMuscles ?? []), JSON.stringify(exercise.secondaryMuscles ?? []),
      exercise.active ? 1 : 0, SYSTEM_TIMESTAMP, SYSTEM_TIMESTAMP,
    );
  }

  for (const configuration of catalog.configurations) {
    await database.runAsync(
      `INSERT INTO exercise_configurations
        (id, exercise_id, name_es, equipment_options, laterality_options, grip_options,
         grip_width_options, attachment, auxiliary_equipment, band_type, anchor_required,
         anchor_height_options, dose_unit, load_mode, origin, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         exercise_id = excluded.exercise_id, name_es = excluded.name_es,
         equipment_options = excluded.equipment_options, laterality_options = excluded.laterality_options,
         grip_options = excluded.grip_options, grip_width_options = excluded.grip_width_options,
         attachment = excluded.attachment, auxiliary_equipment = excluded.auxiliary_equipment,
         band_type = excluded.band_type, anchor_required = excluded.anchor_required,
         anchor_height_options = excluded.anchor_height_options, dose_unit = excluded.dose_unit,
         load_mode = excluded.load_mode, active = excluded.active, updated_at = excluded.updated_at
       WHERE exercise_configurations.origin = 'SYSTEM'`,
      configuration.id, configuration.exerciseId, configuration.nameEs,
      JSON.stringify(configuration.equipmentOptions), JSON.stringify(configuration.lateralityOptions ?? []),
      JSON.stringify(configuration.gripOptions ?? []), JSON.stringify(configuration.gripWidthOptions ?? []),
      configuration.attachment ?? null, JSON.stringify(configuration.auxiliaryEquipment ?? []),
      JSON.stringify(configuration.bandType ?? []), configuration.anchorRequired ? 1 : 0,
      JSON.stringify(configuration.anchorHeightOptions ?? []), configuration.doseUnit,
      configuration.loadMode, configuration.active ? 1 : 0, SYSTEM_TIMESTAMP, SYSTEM_TIMESTAMP,
    );
  }

  await database.runAsync(
    `INSERT INTO schema_metadata (key, value) VALUES ('catalog_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    catalog.catalogId,
  );
}
