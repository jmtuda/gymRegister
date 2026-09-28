import { createUuid } from '../domain/id.ts';
import type {
  CatalogOrigin, Exercise, ExerciseConfiguration, ExerciseGroup,
} from '../domain/catalog.ts';
import type { DoseUnit, LoadMode } from '../domain/training.ts';
import type { Database } from './types.ts';

type GroupRow = { id: string; name_es: string; sort_order: number; active: number; active_exercise_count: number };
type ExerciseRow = {
  id: string; group_id: string; name_es: string; technical_pattern: string | null;
  primary_muscles: string | null; secondary_muscles: string | null; origin: CatalogOrigin;
  active: number; created_at: string; updated_at: string;
};
type ConfigurationRow = {
  id: string; exercise_id: string; name_es: string; equipment_options: string;
  laterality_options: string | null; grip_options: string | null; grip_width_options: string | null;
  attachment: string | null; auxiliary_equipment: string | null; band_type: string | null;
  anchor_required: number; anchor_height_options: string | null; dose_unit: DoseUnit;
  load_mode: LoadMode; origin: CatalogOrigin; active: number; created_at: string; updated_at: string;
};

const parseList = (value: string | null): string[] => value ? JSON.parse(value) as string[] : [];
const mapExercise = (row: ExerciseRow): Exercise => ({
  id: row.id, groupId: row.group_id, nameEs: row.name_es, technicalPattern: row.technical_pattern,
  primaryMuscles: parseList(row.primary_muscles), secondaryMuscles: parseList(row.secondary_muscles),
  origin: row.origin, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapConfiguration = (row: ConfigurationRow): ExerciseConfiguration => ({
  id: row.id, exerciseId: row.exercise_id, nameEs: row.name_es,
  equipmentOptions: parseList(row.equipment_options), lateralityOptions: parseList(row.laterality_options),
  gripOptions: parseList(row.grip_options), gripWidthOptions: parseList(row.grip_width_options),
  attachment: row.attachment, auxiliaryEquipment: parseList(row.auxiliary_equipment),
  bandType: parseList(row.band_type), anchorRequired: row.anchor_required === 1,
  anchorHeightOptions: parseList(row.anchor_height_options), doseUnit: row.dose_unit,
  loadMode: row.load_mode, origin: row.origin, active: row.active === 1,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export type CreateCustomExerciseInput = {
  id?: string; groupId: string; nameEs: string; technicalPattern?: string | null;
  primaryMuscles?: string[]; secondaryMuscles?: string[]; now?: string;
};
export type UpdateCustomExerciseInput = Partial<Omit<CreateCustomExerciseInput, 'id' | 'now'>> & { now?: string };
export type CreateCustomConfigurationInput = {
  id?: string; exerciseId: string; nameEs: string; equipmentOptions: string[];
  lateralityOptions?: string[]; gripOptions?: string[]; gripWidthOptions?: string[];
  attachment?: string | null; auxiliaryEquipment?: string[]; bandType?: string[];
  anchorRequired?: boolean; anchorHeightOptions?: string[]; doseUnit: DoseUnit;
  loadMode: LoadMode; now?: string;
};
export type UpdateCustomConfigurationInput = Partial<Omit<CreateCustomConfigurationInput, 'id' | 'exerciseId' | 'now'>> & { now?: string };

async function requireCustomExercise(database: Database, id: string) {
  const row = await database.getFirstAsync<{ origin: CatalogOrigin }>('SELECT origin FROM exercises WHERE id = ?', id);
  if (!row) throw new Error('Ejercicio no encontrado.');
  if (row.origin !== 'CUSTOM') throw new Error('Los ejercicios SYSTEM no se pueden modificar.');
}

async function requireCustomConfiguration(database: Database, id: string) {
  const row = await database.getFirstAsync<{ origin: CatalogOrigin }>(
    'SELECT origin FROM exercise_configurations WHERE id = ?', id,
  );
  if (!row) throw new Error('Configuración no encontrada.');
  if (row.origin !== 'CUSTOM') throw new Error('Las configuraciones SYSTEM no se pueden modificar.');
}

export function createCatalogRepository(database: Database) {
  return {
    async listGroups(): Promise<ExerciseGroup[]> {
      const rows = await database.getAllAsync<GroupRow>(
        `SELECT groups.id, groups.name_es, groups.sort_order, groups.active,
          COUNT(exercises.id) AS active_exercise_count
         FROM exercise_groups AS groups
         LEFT JOIN exercises ON exercises.group_id = groups.id AND exercises.active = 1
         WHERE groups.active = 1
         GROUP BY groups.id
         ORDER BY groups.sort_order, groups.id`,
      );
      return rows.map((row) => ({
        id: row.id, nameEs: row.name_es, sortOrder: row.sort_order,
        active: row.active === 1, activeExerciseCount: Number(row.active_exercise_count),
      }));
    },

    async listExercisesByGroup(groupId: string): Promise<Exercise[]> {
      const rows = await database.getAllAsync<ExerciseRow>(
        `SELECT * FROM exercises WHERE group_id = ? AND active = 1
         ORDER BY name_es COLLATE NOCASE, id`, groupId,
      );
      return rows.map(mapExercise);
    },

    async getExerciseById(id: string): Promise<Exercise | null> {
      const row = await database.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', id);
      return row ? mapExercise(row) : null;
    },

    async listConfigurationsByExercise(exerciseId: string): Promise<ExerciseConfiguration[]> {
      const rows = await database.getAllAsync<ConfigurationRow>(
        `SELECT * FROM exercise_configurations WHERE exercise_id = ? AND active = 1
         ORDER BY name_es COLLATE NOCASE, id`, exerciseId,
      );
      return rows.map(mapConfiguration);
    },

    async getConfigurationById(id: string): Promise<ExerciseConfiguration | null> {
      const row = await database.getFirstAsync<ConfigurationRow>(
        'SELECT * FROM exercise_configurations WHERE id = ?', id,
      );
      return row ? mapConfiguration(row) : null;
    },

    async createCustomExercise(input: CreateCustomExerciseInput): Promise<Exercise> {
      const id = input.id ?? createUuid();
      const now = input.now ?? new Date().toISOString();
      await database.runAsync(
        `INSERT INTO exercises
          (id, group_id, name_es, technical_pattern, primary_muscles, secondary_muscles,
           origin, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'CUSTOM', 1, ?, ?)`,
        id, input.groupId, input.nameEs.trim(), input.technicalPattern?.trim() || null,
        JSON.stringify(input.primaryMuscles ?? []), JSON.stringify(input.secondaryMuscles ?? []), now, now,
      );
      const created = await this.getExerciseById(id);
      if (!created) throw new Error('No se pudo recuperar el ejercicio creado.');
      return created;
    },

    async updateCustomExercise(id: string, input: UpdateCustomExerciseInput): Promise<Exercise> {
      await requireCustomExercise(database, id);
      const current = await this.getExerciseById(id);
      if (!current) throw new Error('Ejercicio no encontrado.');
      const now = input.now ?? new Date().toISOString();
      await database.runAsync(
        `UPDATE exercises SET group_id = ?, name_es = ?, technical_pattern = ?, primary_muscles = ?,
          secondary_muscles = ?, updated_at = ? WHERE id = ? AND origin = 'CUSTOM'`,
        input.groupId ?? current.groupId, input.nameEs?.trim() ?? current.nameEs,
        input.technicalPattern === undefined ? current.technicalPattern : input.technicalPattern?.trim() || null,
        JSON.stringify(input.primaryMuscles ?? current.primaryMuscles),
        JSON.stringify(input.secondaryMuscles ?? current.secondaryMuscles), now, id,
      );
      return (await this.getExerciseById(id))!;
    },

    async setCustomExerciseActive(id: string, active: boolean, now = new Date().toISOString()): Promise<Exercise> {
      await requireCustomExercise(database, id);
      await database.runAsync(
        `UPDATE exercises SET active = ?, updated_at = ? WHERE id = ? AND origin = 'CUSTOM'`,
        active ? 1 : 0, now, id,
      );
      return (await this.getExerciseById(id))!;
    },

    async createCustomConfiguration(input: CreateCustomConfigurationInput): Promise<ExerciseConfiguration> {
      const id = input.id ?? createUuid();
      const now = input.now ?? new Date().toISOString();
      await database.runAsync(
        `INSERT INTO exercise_configurations
          (id, exercise_id, name_es, equipment_options, laterality_options, grip_options,
           grip_width_options, attachment, auxiliary_equipment, band_type, anchor_required,
           anchor_height_options, dose_unit, load_mode, origin, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CUSTOM', 1, ?, ?)`,
        id, input.exerciseId, input.nameEs.trim(), JSON.stringify(input.equipmentOptions),
        JSON.stringify(input.lateralityOptions ?? []), JSON.stringify(input.gripOptions ?? []),
        JSON.stringify(input.gripWidthOptions ?? []), input.attachment?.trim() || null,
        JSON.stringify(input.auxiliaryEquipment ?? []), JSON.stringify(input.bandType ?? []),
        input.anchorRequired ? 1 : 0, JSON.stringify(input.anchorHeightOptions ?? []),
        input.doseUnit, input.loadMode, now, now,
      );
      const created = await this.getConfigurationById(id);
      if (!created) throw new Error('No se pudo recuperar la configuración creada.');
      return created;
    },

    async updateCustomConfiguration(id: string, input: UpdateCustomConfigurationInput): Promise<ExerciseConfiguration> {
      await requireCustomConfiguration(database, id);
      const current = await this.getConfigurationById(id);
      if (!current) throw new Error('Configuración no encontrada.');
      const now = input.now ?? new Date().toISOString();
      await database.runAsync(
        `UPDATE exercise_configurations SET name_es = ?, equipment_options = ?, laterality_options = ?,
          grip_options = ?, grip_width_options = ?, attachment = ?, auxiliary_equipment = ?,
          band_type = ?, anchor_required = ?, anchor_height_options = ?, dose_unit = ?, load_mode = ?,
          updated_at = ? WHERE id = ? AND origin = 'CUSTOM'`,
        input.nameEs?.trim() ?? current.nameEs, JSON.stringify(input.equipmentOptions ?? current.equipmentOptions),
        JSON.stringify(input.lateralityOptions ?? current.lateralityOptions),
        JSON.stringify(input.gripOptions ?? current.gripOptions),
        JSON.stringify(input.gripWidthOptions ?? current.gripWidthOptions),
        input.attachment === undefined ? current.attachment : input.attachment?.trim() || null,
        JSON.stringify(input.auxiliaryEquipment ?? current.auxiliaryEquipment),
        JSON.stringify(input.bandType ?? current.bandType),
        (input.anchorRequired ?? current.anchorRequired) ? 1 : 0,
        JSON.stringify(input.anchorHeightOptions ?? current.anchorHeightOptions),
        input.doseUnit ?? current.doseUnit, input.loadMode ?? current.loadMode, now, id,
      );
      return (await this.getConfigurationById(id))!;
    },

    async setCustomConfigurationActive(id: string, active: boolean, now = new Date().toISOString()): Promise<ExerciseConfiguration> {
      await requireCustomConfiguration(database, id);
      await database.runAsync(
        `UPDATE exercise_configurations SET active = ?, updated_at = ?
         WHERE id = ? AND origin = 'CUSTOM'`, active ? 1 : 0, now, id,
      );
      return (await this.getConfigurationById(id))!;
    },
  };
}
