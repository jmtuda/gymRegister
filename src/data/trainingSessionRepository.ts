import type { SessionStatus, TrainingSession } from '../domain/training.ts';
import { createUuid } from '../domain/id.ts';
import type { Database } from './types.ts';

type SessionRow = {
  id: string; status: SessionStatus; note: string | null; created_at: string;
  started_at: string | null; completed_at: string | null; updated_at: string;
};

export type CreateSessionInput = {
  id?: string;
  status?: SessionStatus;
  note?: string | null;
  now?: string;
};

function mapSession(row: SessionRow): TrainingSession {
  return {
    id: row.id, status: row.status, note: row.note, createdAt: row.created_at,
    startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
  };
}

export function createTrainingSessionRepository(database: Database) {
  return {
    async create(input: CreateSessionInput = {}): Promise<TrainingSession> {
      const id = input.id ?? createUuid();
      const status = input.status ?? 'draft';
      const now = input.now ?? new Date().toISOString();
      const startedAt = status === 'in_progress' ? now : null;
      const completedAt = status === 'completed' ? now : null;
      await database.runAsync(
        `INSERT INTO training_sessions
          (id, status, note, created_at, started_at, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, status, input.note ?? null, now, startedAt, completedAt, now,
      );
      const session = await this.getById(id);
      if (!session) throw new Error('No se pudo recuperar la sesión creada.');
      return session;
    },

    async getById(id: string): Promise<TrainingSession | null> {
      const row = await database.getFirstAsync<SessionRow>(
        `SELECT id, status, note, created_at, started_at, completed_at, updated_at
         FROM training_sessions WHERE id = ?`,
        id,
      );
      return row ? mapSession(row) : null;
    },
  };
}
