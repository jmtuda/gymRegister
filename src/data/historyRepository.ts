import type {
  CompletedSessionDetail, CompletedSessionSummary, HistoricalExercise,
} from '../domain/history.ts';
import type {
  DoseUnit, LoadMode, PerformedSet, SessionExercise, SessionStatus, TrainingSession,
} from '../domain/training.ts';
import type { Database, DatabaseConnection } from './types.ts';

type SessionRow = {
  id: string; status: SessionStatus; note: string | null; created_at: string;
  started_at: string | null; completed_at: string | null; updated_at: string;
};
type SummaryRow = SessionRow & { exercise_count: number; set_count: number };
type ExerciseRow = {
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

const mapSession = (row: SessionRow): TrainingSession => ({
  id: row.id, status: row.status, note: row.note, createdAt: row.created_at,
  startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
});
const mapExercise = (row: ExerciseRow): SessionExercise => ({
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

function durationMs(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const value = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function getSession(database: DatabaseConnection, id: string): Promise<TrainingSession | null> {
  const row = await database.getFirstAsync<SessionRow>(
    'SELECT * FROM training_sessions WHERE id = ?', id,
  );
  return row ? mapSession(row) : null;
}

async function listExercises(database: DatabaseConnection, sessionId: string): Promise<SessionExercise[]> {
  const rows = await database.getAllAsync<ExerciseRow>(
    `SELECT * FROM session_exercises WHERE session_id = ? ORDER BY order_index, id`, sessionId,
  );
  return rows.map(mapExercise);
}

async function listSets(database: DatabaseConnection, sessionExerciseId: string): Promise<PerformedSet[]> {
  const rows = await database.getAllAsync<SetRow>(
    `SELECT * FROM performed_sets WHERE session_exercise_id = ? ORDER BY set_index, id`,
    sessionExerciseId,
  );
  return rows.map(mapSet);
}

export function createHistoryRepository(database: Database) {
  return {
    async completeSession(
      sessionId: string,
      note: string | null = null,
      now = new Date().toISOString(),
    ): Promise<TrainingSession> {
      let result: TrainingSession | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const current = await getSession(transaction, sessionId);
        if (!current) throw new Error('Sesión no encontrada.');
        if (current.status === 'completed') {
          result = current;
          return;
        }
        if (current.status !== 'in_progress') {
          throw new Error('Solo se puede finalizar una sesión en curso.');
        }
        await transaction.runAsync(
          `UPDATE training_sessions
           SET status = 'completed', note = ?, completed_at = ?, updated_at = ?
           WHERE id = ? AND status = 'in_progress'`,
          note?.trim() || null, now, now, sessionId,
        );
        result = await getSession(transaction, sessionId);
      });
      if (!result) throw new Error('No se pudo finalizar la sesión.');
      return result;
    },

    async getCompletedSessionById(id: string): Promise<TrainingSession | null> {
      const session = await getSession(database, id);
      return session?.status === 'completed' ? session : null;
    },

    async listCompletedSessions(): Promise<CompletedSessionSummary[]> {
      const rows = await database.getAllAsync<SummaryRow>(
        `SELECT sessions.*,
          COUNT(DISTINCT session_exercises.id) AS exercise_count,
          COUNT(performed_sets.id) AS set_count
         FROM training_sessions AS sessions
         LEFT JOIN session_exercises ON session_exercises.session_id = sessions.id
         LEFT JOIN performed_sets ON performed_sets.session_exercise_id = session_exercises.id
         WHERE sessions.status = 'completed'
         GROUP BY sessions.id
         ORDER BY sessions.completed_at DESC, sessions.id DESC`,
      );
      return rows.map((row) => ({
        id: row.id, note: row.note, startedAt: row.started_at,
        completedAt: row.completed_at!, durationMs: durationMs(row.started_at, row.completed_at),
        exerciseCount: Number(row.exercise_count), setCount: Number(row.set_count),
      }));
    },

    async listCompletedSessionExercises(sessionId: string): Promise<HistoricalExercise[]> {
      const session = await this.getCompletedSessionById(sessionId);
      if (!session) throw new Error('Sesión completada no encontrada.');
      const exercises = await listExercises(database, sessionId);
      return Promise.all(exercises.map(async (exercise) => ({
        ...exercise,
        sets: await listSets(database, exercise.id),
      })));
    },

    async getCompletedSessionDetail(sessionId: string): Promise<CompletedSessionDetail | null> {
      const session = await this.getCompletedSessionById(sessionId);
      if (!session || !session.completedAt) return null;
      const exercises = await this.listCompletedSessionExercises(sessionId);
      return {
        session: { ...session, status: 'completed', completedAt: session.completedAt },
        durationMs: durationMs(session.startedAt, session.completedAt),
        exercises,
      };
    },
  };
}
