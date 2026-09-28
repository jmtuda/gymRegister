import { createUuid } from '../domain/id.ts';
import type { SessionExercise, TrainingSession } from '../domain/training.ts';
import type { Database, DatabaseConnection } from './types.ts';

type SessionRow = {
  id: string; status: TrainingSession['status']; note: string | null; created_at: string;
  started_at: string | null; completed_at: string | null; updated_at: string;
};
type SessionExerciseRow = {
  id: string; session_id: string; exercise_id: string; configuration_id: string;
  exercise_name_snapshot: string | null; configuration_name_snapshot: string | null;
  order_index: number; selected_equipment: string | null; selected_laterality: string | null;
  selected_grip: string | null; selected_grip_width: string | null; note: string | null;
  created_at: string; updated_at: string;
};
type CatalogSelectionRow = {
  exercise_id: string; exercise_name: string; exercise_active: number;
  configuration_id: string; configuration_name: string; configuration_active: number;
  configuration_exercise_id: string; equipment_options: string; laterality_options: string | null;
  grip_options: string | null; grip_width_options: string | null;
};

export type AddSessionExerciseInput = {
  id?: string;
  sessionId: string;
  exerciseId: string;
  configurationId: string;
  selectedEquipment?: string | null;
  selectedLaterality?: string | null;
  selectedGrip?: string | null;
  selectedGripWidth?: string | null;
  now?: string;
};

const mapSession = (row: SessionRow): TrainingSession => ({
  id: row.id, status: row.status, note: row.note, createdAt: row.created_at,
  startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
});
const mapSessionExercise = (row: SessionExerciseRow): SessionExercise => ({
  id: row.id, sessionId: row.session_id, exerciseId: row.exercise_id,
  configurationId: row.configuration_id, exerciseNameSnapshot: row.exercise_name_snapshot,
  configurationNameSnapshot: row.configuration_name_snapshot, orderIndex: row.order_index,
  selectedEquipment: row.selected_equipment, selectedLaterality: row.selected_laterality,
  selectedGrip: row.selected_grip, selectedGripWidth: row.selected_grip_width,
  note: row.note, createdAt: row.created_at, updatedAt: row.updated_at,
});
const parseOptions = (value: string | null): string[] => value ? JSON.parse(value) as string[] : [];

function resolveSelection(label: string, options: string[], selected?: string | null): string | null {
  if (options.length === 0) {
    if (selected) throw new Error(`${label} no aplica a esta configuración.`);
    return null;
  }
  if (selected && !options.includes(selected)) throw new Error(`${label} no pertenece a esta configuración.`);
  if (options.length === 1) return selected ?? options[0];
  if (!selected) throw new Error(`Debes elegir ${label.toLowerCase()}.`);
  return selected;
}

async function requireDraft(database: DatabaseConnection, sessionId: string): Promise<void> {
  const row = await database.getFirstAsync<{ status: string }>(
    'SELECT status FROM training_sessions WHERE id = ?', sessionId,
  );
  if (!row) throw new Error('Sesión no encontrada.');
  if (row.status !== 'draft') throw new Error('Solo se puede modificar una sesión en borrador.');
}

async function listExercises(database: DatabaseConnection, sessionId: string): Promise<SessionExercise[]> {
  const rows = await database.getAllAsync<SessionExerciseRow>(
    'SELECT * FROM session_exercises WHERE session_id = ? ORDER BY order_index, id', sessionId,
  );
  return rows.map(mapSessionExercise);
}

async function compactOrder(database: DatabaseConnection, sessionId: string, orderedIds: string[]) {
  const temporary = await database.getFirstAsync<{ offset: number }>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS offset FROM session_exercises WHERE session_id = ?',
    sessionId,
  );
  await database.runAsync(
    'UPDATE session_exercises SET order_index = order_index + ? WHERE session_id = ?',
    Number(temporary?.offset ?? 0), sessionId,
  );
  for (let index = 0; index < orderedIds.length; index += 1) {
    await database.runAsync(
      'UPDATE session_exercises SET order_index = ? WHERE id = ? AND session_id = ?',
      index, orderedIds[index], sessionId,
    );
  }
}

export function createManualSessionRepository(database: Database) {
  return {
    async getSessionById(id: string): Promise<TrainingSession | null> {
      const row = await database.getFirstAsync<SessionRow>('SELECT * FROM training_sessions WHERE id = ?', id);
      return row ? mapSession(row) : null;
    },

    async getCurrentDraft(): Promise<TrainingSession | null> {
      const row = await database.getFirstAsync<SessionRow>(
        `SELECT * FROM training_sessions WHERE status = 'draft' ORDER BY created_at LIMIT 1`,
      );
      return row ? mapSession(row) : null;
    },

    async getCurrentInProgress(): Promise<TrainingSession | null> {
      const row = await database.getFirstAsync<SessionRow>(
        `SELECT * FROM training_sessions WHERE status = 'in_progress' ORDER BY started_at LIMIT 1`,
      );
      return row ? mapSession(row) : null;
    },

    async getOpenSession(): Promise<TrainingSession | null> {
      return (await this.getCurrentInProgress()) ?? this.getCurrentDraft();
    },

    async createDraft(now = new Date().toISOString()): Promise<TrainingSession> {
      const open = await this.getOpenSession();
      if (open) return open;
      const id = createUuid();
      try {
        await database.runAsync(
          `INSERT INTO training_sessions (id, status, note, created_at, updated_at)
           VALUES (?, 'draft', NULL, ?, ?)`, id, now, now,
        );
      } catch (error) {
        const existing = await this.getOpenSession();
        if (existing) return existing;
        throw error;
      }
      const created = await this.getSessionById(id);
      if (!created) throw new Error('No se pudo recuperar la sesión creada.');
      return created;
    },

    async updateNote(sessionId: string, note: string | null, now = new Date().toISOString()): Promise<TrainingSession> {
      await requireDraft(database, sessionId);
      await database.runAsync(
        `UPDATE training_sessions SET note = ?, updated_at = ? WHERE id = ? AND status = 'draft'`,
        note?.trim() || null, now, sessionId,
      );
      return (await this.getSessionById(sessionId))!;
    },

    async listSessionExercises(sessionId: string): Promise<SessionExercise[]> {
      return listExercises(database, sessionId);
    },

    async addExercise(input: AddSessionExerciseInput): Promise<SessionExercise> {
      const id = input.id ?? createUuid();
      const now = input.now ?? new Date().toISOString();

      await database.withExclusiveTransactionAsync(async (transaction) => {
        await requireDraft(transaction, input.sessionId);
        const catalog = await transaction.getFirstAsync<CatalogSelectionRow>(
          `SELECT exercises.id AS exercise_id, exercises.name_es AS exercise_name,
            exercises.active AS exercise_active, configurations.id AS configuration_id,
            configurations.name_es AS configuration_name, configurations.active AS configuration_active,
            configurations.exercise_id AS configuration_exercise_id,
            configurations.equipment_options, configurations.laterality_options,
            configurations.grip_options, configurations.grip_width_options
           FROM exercises
           JOIN exercise_configurations AS configurations ON configurations.id = ?
           WHERE exercises.id = ?`,
          input.configurationId, input.exerciseId,
        );
        if (!catalog || catalog.configuration_exercise_id !== input.exerciseId) {
          throw new Error('La configuración no pertenece al ejercicio.');
        }
        if (catalog.exercise_active !== 1 || catalog.configuration_active !== 1) {
          throw new Error('Solo se pueden añadir elementos activos.');
        }
        const selectedEquipment = resolveSelection(
          'Equipamiento', parseOptions(catalog.equipment_options), input.selectedEquipment,
        );
        const selectedLaterality = resolveSelection(
          'Lateralidad', parseOptions(catalog.laterality_options), input.selectedLaterality,
        );
        const selectedGrip = resolveSelection('Agarre', parseOptions(catalog.grip_options), input.selectedGrip);
        const selectedGripWidth = resolveSelection(
          'Anchura de agarre', parseOptions(catalog.grip_width_options), input.selectedGripWidth,
        );
        const order = await transaction.getFirstAsync<{ next_index: number }>(
          'SELECT COALESCE(MAX(order_index) + 1, 0) AS next_index FROM session_exercises WHERE session_id = ?',
          input.sessionId,
        );
        await transaction.runAsync(
          `INSERT INTO session_exercises
            (id, session_id, exercise_id, configuration_id, exercise_name_snapshot,
             configuration_name_snapshot, order_index, selected_equipment, selected_laterality,
             selected_grip, selected_grip_width, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          id, input.sessionId, input.exerciseId, input.configurationId,
          catalog.exercise_name, catalog.configuration_name, Number(order?.next_index ?? 0),
          selectedEquipment, selectedLaterality, selectedGrip, selectedGripWidth, now, now,
        );
      });
      return (await this.listSessionExercises(input.sessionId)).find((item) => item.id === id)!;
    },

    async removeExercise(sessionId: string, exerciseId: string): Promise<void> {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await requireDraft(transaction, sessionId);
        const existing = await listExercises(transaction, sessionId);
        if (!existing.some((item) => item.id === exerciseId)) throw new Error('Ejercicio de sesión no encontrado.');
        await transaction.runAsync(
          'DELETE FROM session_exercises WHERE id = ? AND session_id = ?', exerciseId, sessionId,
        );
        await compactOrder(transaction, sessionId, existing.filter((item) => item.id !== exerciseId).map((item) => item.id));
      });
    },

    async reorderExercises(sessionId: string, orderedIds: string[]): Promise<SessionExercise[]> {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await requireDraft(transaction, sessionId);
        const existing = await listExercises(transaction, sessionId);
        const currentIds = existing.map((item) => item.id);
        if (orderedIds.length !== currentIds.length
          || new Set(orderedIds).size !== orderedIds.length
          || orderedIds.some((id) => !currentIds.includes(id))) {
          throw new Error('El nuevo orden debe contener exactamente los ejercicios de la sesión.');
        }
        await compactOrder(transaction, sessionId, orderedIds);
      });
      return this.listSessionExercises(sessionId);
    },

    async startSession(sessionId: string, now = new Date().toISOString()): Promise<TrainingSession> {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await requireDraft(transaction, sessionId);
        const count = await transaction.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM session_exercises WHERE session_id = ?', sessionId,
        );
        if (Number(count?.count ?? 0) === 0) throw new Error('Añade al menos un ejercicio antes de iniciar.');
        await transaction.runAsync(
          `UPDATE training_sessions SET status = 'in_progress', started_at = ?, updated_at = ?
           WHERE id = ? AND status = 'draft'`, now, now, sessionId,
        );
      });
      return (await this.getSessionById(sessionId))!;
    },
  };
}
