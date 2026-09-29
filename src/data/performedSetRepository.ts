import type { DoseUnit, LoadMode, PerformedSet, SessionExercise } from '../domain/training.ts';
import { createUuid } from '../domain/id.ts';
import type { Database, DatabaseConnection } from './types.ts';

type SessionExerciseRow = {
  id: string; session_id: string; exercise_id: string; configuration_id: string;
  exercise_name_snapshot: string | null; configuration_name_snapshot: string | null;
  order_index: number; selected_equipment: string | null; selected_laterality: string | null;
  selected_grip: string | null; selected_grip_width: string | null; note: string | null;
  created_at: string; updated_at: string;
};
type SetRow = {
  id: string; session_exercise_id: string; set_index: number; dose_unit: DoseUnit;
  dose_value: number; per_side: number; load_mode: LoadMode; load_value: number | null;
  load_label: string | null; rir: number | null; confirmed_at: string;
  created_at: string; updated_at: string;
};

export type CreateSessionExerciseInput = {
  id?: string; sessionId: string; exerciseId: string; configurationId: string;
  exerciseNameSnapshot?: string | null; configurationNameSnapshot?: string | null;
  orderIndex: number; selectedEquipment?: string | null; selectedLaterality?: string | null;
  selectedGrip?: string | null; selectedGripWidth?: string | null; note?: string | null; now?: string;
};
export type CreatePerformedSetInput = {
  id?: string; sessionExerciseId: string; setIndex: number; doseUnit: DoseUnit;
  doseValue: number; perSide?: boolean; loadMode: LoadMode; loadValue?: number | null;
  loadLabel?: string | null; rir?: number | null; confirmedAt?: string; now?: string;
};

const mapSessionExercise = (row: SessionExerciseRow): SessionExercise => ({
  id: row.id, sessionId: row.session_id, exerciseId: row.exercise_id,
  configurationId: row.configuration_id, exerciseNameSnapshot: row.exercise_name_snapshot,
  configurationNameSnapshot: row.configuration_name_snapshot, orderIndex: row.order_index,
  selectedEquipment: row.selected_equipment, selectedLaterality: row.selected_laterality,
  selectedGrip: row.selected_grip, selectedGripWidth: row.selected_grip_width,
  note: row.note, createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapSet = (row: SetRow): PerformedSet => ({
  id: row.id, sessionExerciseId: row.session_exercise_id, setIndex: row.set_index,
  doseUnit: row.dose_unit, doseValue: row.dose_value, perSide: row.per_side === 1,
  loadMode: row.load_mode, loadValue: row.load_value, loadLabel: row.load_label,
  rir: row.rir, confirmedAt: row.confirmed_at, createdAt: row.created_at, updatedAt: row.updated_at,
});

async function getSessionExercise(
  database: DatabaseConnection,
  id: string,
): Promise<SessionExercise | null> {
  const row = await database.getFirstAsync<SessionExerciseRow>(
    'SELECT * FROM session_exercises WHERE id = ?', id,
  );
  return row ? mapSessionExercise(row) : null;
}

async function getSet(database: DatabaseConnection, id: string): Promise<PerformedSet | null> {
  const row = await database.getFirstAsync<SetRow>('SELECT * FROM performed_sets WHERE id = ?', id);
  return row ? mapSet(row) : null;
}

export function createPerformedSetRepository(database: Database) {
  return {
    async createSessionExercise(input: CreateSessionExerciseInput): Promise<SessionExercise> {
      const id = input.id ?? createUuid();
      const now = input.now ?? new Date().toISOString();
      let result: SessionExercise | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const session = await transaction.getFirstAsync<{ status: string }>(
          'SELECT status FROM training_sessions WHERE id = ?', input.sessionId,
        );
        if (!session) throw new Error('Sesión no encontrada.');
        if (session.status !== 'draft' && session.status !== 'in_progress') {
          throw new Error('Solo se pueden añadir ejercicios a una sesión abierta.');
        }
        await transaction.runAsync(
          `INSERT INTO session_exercises
            (id, session_id, exercise_id, configuration_id, exercise_name_snapshot,
             configuration_name_snapshot, order_index, selected_equipment,
             selected_laterality, selected_grip, selected_grip_width, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, input.sessionId, input.exerciseId, input.configurationId,
          input.exerciseNameSnapshot ?? null, input.configurationNameSnapshot ?? null, input.orderIndex,
          input.selectedEquipment ?? null, input.selectedLaterality ?? null,
          input.selectedGrip ?? null, input.selectedGripWidth ?? null, input.note ?? null, now, now,
        );
        result = await getSessionExercise(transaction, id);
      });
      if (!result) throw new Error('No se pudo recuperar el ejercicio de sesión creado.');
      return result;
    },

    async getSessionExerciseById(id: string): Promise<SessionExercise | null> {
      return getSessionExercise(database, id);
    },

    async createSet(input: CreatePerformedSetInput): Promise<PerformedSet> {
      const id = input.id ?? createUuid();
      const now = input.now ?? new Date().toISOString();
      let result: PerformedSet | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const session = await transaction.getFirstAsync<{ status: string }>(
          `SELECT training_sessions.status
           FROM session_exercises
           JOIN training_sessions ON training_sessions.id = session_exercises.session_id
           WHERE session_exercises.id = ?`,
          input.sessionExerciseId,
        );
        if (!session) throw new Error('Ejercicio de sesión no encontrado.');
        if (session.status !== 'in_progress') {
          throw new Error('Solo se pueden registrar series en una sesión en curso.');
        }
        await transaction.runAsync(
          `INSERT INTO performed_sets
            (id, session_exercise_id, set_index, dose_unit, dose_value, per_side, load_mode,
             load_value, load_label, rir, confirmed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, input.sessionExerciseId, input.setIndex, input.doseUnit, input.doseValue,
          input.perSide ? 1 : 0, input.loadMode, input.loadValue ?? null, input.loadLabel ?? null,
          input.rir ?? null, input.confirmedAt ?? now, now, now,
        );
        result = await getSet(transaction, id);
      });
      if (!result) throw new Error('No se pudo recuperar la serie creada.');
      return result;
    },

    async getSetById(id: string): Promise<PerformedSet | null> {
      return getSet(database, id);
    },
  };
}
