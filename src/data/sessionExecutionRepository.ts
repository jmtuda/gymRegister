import type { DoseUnit, LoadMode, PerformedSet } from '../domain/training.ts';
import type { Database, DatabaseConnection } from './types.ts';

type ExecutionContext = {
  session_exercise_id: string;
  session_id: string;
  session_status: string;
  selected_laterality: string | null;
  dose_unit: DoseUnit;
  load_mode: LoadMode;
};
type SetSemantics = Pick<ExecutionContext, 'selected_laterality' | 'dose_unit' | 'load_mode'>;
type SetRow = {
  id: string; session_exercise_id: string; set_index: number; dose_unit: DoseUnit;
  dose_value: number; per_side: number; load_mode: LoadMode; load_value: number | null;
  load_label: string | null; rir: number | null; confirmed_at: string;
  created_at: string; updated_at: string;
};

export type SetValues = {
  doseValue: number;
  perSide?: boolean;
  loadValue?: number | null;
  loadLabel?: string | null;
  rir?: number | null;
};
export type ConfirmSetInput = SetValues & {
  attemptId: string;
  sessionExerciseId: string;
  now?: string;
};
export type EditSetInput = SetValues & {
  setId: string;
  sessionExerciseId: string;
  now?: string;
};
export type ReusableSetDefaults = SetValues & {
  doseUnit: DoseUnit;
  loadMode: LoadMode;
};

const NUMERIC_LOAD_MODES: LoadMode[] = [
  'TOTAL_KG', 'IMPLEMENT_KG', 'DISPLAYED_KG', 'ASSISTANCE_KG',
];
const mapSet = (row: SetRow): PerformedSet => ({
  id: row.id, sessionExerciseId: row.session_exercise_id, setIndex: row.set_index,
  doseUnit: row.dose_unit, doseValue: row.dose_value, perSide: row.per_side === 1,
  loadMode: row.load_mode, loadValue: row.load_value, loadLabel: row.load_label,
  rir: row.rir, confirmedAt: row.confirmed_at, createdAt: row.created_at, updatedAt: row.updated_at,
});

async function getContext(database: DatabaseConnection, sessionExerciseId: string): Promise<ExecutionContext> {
  const context = await database.getFirstAsync<ExecutionContext>(
    `SELECT session_exercises.id AS session_exercise_id, session_exercises.session_id,
      training_sessions.status AS session_status, session_exercises.selected_laterality,
      exercise_configurations.dose_unit, exercise_configurations.load_mode
     FROM session_exercises
     JOIN training_sessions ON training_sessions.id = session_exercises.session_id
     JOIN exercise_configurations ON exercise_configurations.id = session_exercises.configuration_id
     WHERE session_exercises.id = ?`,
    sessionExerciseId,
  );
  if (!context) throw new Error('Ejercicio de sesión no encontrado.');
  if (context.session_status !== 'in_progress') throw new Error('La sesión debe estar en curso.');
  return context;
}

export function validateSetValues(context: SetSemantics, values: SetValues) {
  if (!Number.isFinite(values.doseValue) || values.doseValue <= 0) {
    throw new Error('La dosis debe ser mayor que cero.');
  }
  if (values.rir !== null && values.rir !== undefined
    && (!Number.isInteger(values.rir) || values.rir < 0 || values.rir > 5)) {
    throw new Error('El RIR debe ser un entero entre 0 y 5.');
  }
  if (values.loadValue !== null && values.loadValue !== undefined && values.loadLabel?.trim()) {
    throw new Error('No se puede guardar carga numérica y etiqueta simultáneamente.');
  }

  let loadValue: number | null = null;
  let loadLabel: string | null = null;
  if (NUMERIC_LOAD_MODES.includes(context.load_mode)) {
    if (values.loadLabel?.trim()) throw new Error('Este modo de carga solo acepta un valor numérico.');
    if (values.loadValue === null || values.loadValue === undefined
      || !Number.isFinite(values.loadValue) || values.loadValue < 0) {
      throw new Error('Introduce una carga numérica mayor o igual que cero.');
    }
    loadValue = values.loadValue;
  } else if (context.load_mode === 'BAND_LABEL') {
    if (values.loadValue !== null && values.loadValue !== undefined) {
      throw new Error('Las bandas se registran mediante una etiqueta, no en kg.');
    }
    loadLabel = values.loadLabel?.trim() || null;
    if (!loadLabel) throw new Error('Introduce la banda o resistencia utilizada.');
  } else if ((values.loadValue !== null && values.loadValue !== undefined) || values.loadLabel?.trim()) {
    throw new Error('Este modo no admite datos de carga.');
  }

  const canBePerSide = context.selected_laterality === 'UNILATERAL'
    || context.selected_laterality === 'ALTERNATING';
  return {
    doseValue: values.doseValue,
    perSide: canBePerSide ? Boolean(values.perSide) : false,
    loadValue,
    loadLabel,
    rir: values.rir ?? null,
  };
}

async function listSets(database: DatabaseConnection, sessionExerciseId: string): Promise<PerformedSet[]> {
  const rows = await database.getAllAsync<SetRow>(
    'SELECT * FROM performed_sets WHERE session_exercise_id = ? ORDER BY set_index, id',
    sessionExerciseId,
  );
  return rows.map(mapSet);
}

async function compactSetOrder(database: DatabaseConnection, sessionExerciseId: string, orderedIds: string[]) {
  const temporary = await database.getFirstAsync<{ offset: number }>(
    'SELECT COALESCE(MAX(set_index), -1) + 1 AS offset FROM performed_sets WHERE session_exercise_id = ?',
    sessionExerciseId,
  );
  await database.runAsync(
    'UPDATE performed_sets SET set_index = set_index + ? WHERE session_exercise_id = ?',
    Number(temporary?.offset ?? 0), sessionExerciseId,
  );
  for (let index = 0; index < orderedIds.length; index += 1) {
    await database.runAsync(
      'UPDATE performed_sets SET set_index = ? WHERE id = ? AND session_exercise_id = ?',
      index, orderedIds[index], sessionExerciseId,
    );
  }
}

export function createSessionExecutionRepository(database: Database) {
  const confirmSetWithStatus = async (input: ConfirmSetInput): Promise<{ set: PerformedSet; created: boolean }> => {
    let result: PerformedSet | null = null;
    let created = false;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const context = await getContext(transaction, input.sessionExerciseId);
      const existing = await transaction.getFirstAsync<SetRow>(
        'SELECT * FROM performed_sets WHERE id = ?', input.attemptId,
      );
      if (existing) {
        if (existing.session_exercise_id !== input.sessionExerciseId) {
          throw new Error('El intento de confirmación pertenece a otro ejercicio.');
        }
        result = mapSet(existing);
        return;
      }
      const values = validateSetValues(context, input);
      const order = await transaction.getFirstAsync<{ next_index: number }>(
        'SELECT COALESCE(MAX(set_index) + 1, 0) AS next_index FROM performed_sets WHERE session_exercise_id = ?',
        input.sessionExerciseId,
      );
      const now = input.now ?? new Date().toISOString();
      await transaction.runAsync(
        `INSERT INTO performed_sets
          (id, session_exercise_id, set_index, dose_unit, dose_value, per_side, load_mode,
           load_value, load_label, rir, confirmed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.attemptId, input.sessionExerciseId, Number(order?.next_index ?? 0), context.dose_unit,
        values.doseValue, values.perSide ? 1 : 0, context.load_mode, values.loadValue,
        values.loadLabel, values.rir, now, now, now,
      );
      result = mapSet((await transaction.getFirstAsync<SetRow>(
        'SELECT * FROM performed_sets WHERE id = ?', input.attemptId,
      ))!);
      created = true;
    });
    if (!result) throw new Error('No se pudo confirmar la serie.');
    return { set: result, created };
  };

  return {
    async getExecutionContext(sessionExerciseId: string) {
      return getContext(database, sessionExerciseId);
    },

    async listSets(sessionExerciseId: string): Promise<PerformedSet[]> {
      return listSets(database, sessionExerciseId);
    },

    async getReusableSetDefaults(sessionExerciseId: string): Promise<ReusableSetDefaults | null> {
      const context = await getContext(database, sessionExerciseId);
      const row = await database.getFirstAsync<SetRow>(
        `SELECT performed_sets.*
         FROM performed_sets
         JOIN session_exercises AS source ON source.id = performed_sets.session_exercise_id
         JOIN session_exercises AS current ON current.id = ?
         JOIN training_sessions ON training_sessions.id = source.session_id
         WHERE (
           source.id = current.id
           OR (
             training_sessions.status = 'completed'
             AND source.exercise_id = current.exercise_id
             AND source.configuration_id = current.configuration_id
             AND source.selected_equipment IS current.selected_equipment
             AND source.selected_laterality IS current.selected_laterality
             AND source.selected_grip IS current.selected_grip
             AND source.selected_grip_width IS current.selected_grip_width
           )
         )
         ORDER BY (source.id = current.id) DESC,
           CASE WHEN source.id = current.id THEN performed_sets.set_index END DESC,
           training_sessions.completed_at DESC, performed_sets.confirmed_at DESC,
           performed_sets.set_index DESC
         LIMIT 1`,
        sessionExerciseId,
      );
      if (!row || row.dose_unit !== context.dose_unit || row.load_mode !== context.load_mode) return null;
      return {
        doseUnit: row.dose_unit, doseValue: row.dose_value, perSide: row.per_side === 1,
        loadMode: row.load_mode, loadValue: row.load_value, loadLabel: row.load_label, rir: row.rir,
      };
    },

    confirmSetWithStatus,

    async confirmSet(input: ConfirmSetInput): Promise<PerformedSet> {
      return (await confirmSetWithStatus(input)).set;
    },

    async editSet(input: EditSetInput): Promise<PerformedSet> {
      let result: PerformedSet | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const context = await getContext(transaction, input.sessionExerciseId);
        const existing = await transaction.getFirstAsync<SetRow>(
          'SELECT * FROM performed_sets WHERE id = ?', input.setId,
        );
        if (!existing || existing.session_exercise_id !== input.sessionExerciseId) {
          throw new Error('La serie no pertenece a este ejercicio de sesión.');
        }
        const values = validateSetValues({
          selected_laterality: context.selected_laterality,
          dose_unit: existing.dose_unit,
          load_mode: existing.load_mode,
        }, input);
        const now = input.now ?? new Date().toISOString();
        await transaction.runAsync(
          `UPDATE performed_sets SET dose_value = ?, per_side = ?, load_value = ?, load_label = ?,
            rir = ?, updated_at = ? WHERE id = ? AND session_exercise_id = ?`,
          values.doseValue, values.perSide ? 1 : 0, values.loadValue, values.loadLabel,
          values.rir, now, input.setId, input.sessionExerciseId,
        );
        result = mapSet((await transaction.getFirstAsync<SetRow>(
          'SELECT * FROM performed_sets WHERE id = ?', input.setId,
        ))!);
      });
      if (!result) throw new Error('No se pudo editar la serie.');
      return result;
    },

    async deleteSet(sessionExerciseId: string, setId: string): Promise<void> {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await getContext(transaction, sessionExerciseId);
        const existing = await listSets(transaction, sessionExerciseId);
        if (!existing.some((item) => item.id === setId)) {
          throw new Error('La serie no pertenece a este ejercicio de sesión.');
        }
        await transaction.runAsync(
          'DELETE FROM performed_sets WHERE id = ? AND session_exercise_id = ?', setId, sessionExerciseId,
        );
        await compactSetOrder(
          transaction, sessionExerciseId, existing.filter((item) => item.id !== setId).map((item) => item.id),
        );
      });
    },

    async updateExerciseNote(sessionExerciseId: string, note: string | null, now = new Date().toISOString()) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await getContext(transaction, sessionExerciseId);
        await transaction.runAsync(
          'UPDATE session_exercises SET note = ?, updated_at = ? WHERE id = ?',
          note?.trim() || null, now, sessionExerciseId,
        );
      });
    },
  };
}
