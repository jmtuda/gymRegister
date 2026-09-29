import type { ExportSourceSession } from '../domain/export.ts';
import { createHistoryRepository } from './historyRepository.ts';
import type { Database } from './types.ts';

export function createExportRepository(database: Database) {
  const history = createHistoryRepository(database);

  return {
    async readCompletedSessions(): Promise<ExportSourceSession[]> {
      const summaries = await history.listCompletedSessions();
      return Promise.all(summaries.map(async ({ id }) => {
        const detail = await history.getCompletedSessionDetail(id);
        if (!detail) throw new Error('No se pudo reconstruir una sesión completada.');
        const exercises = await Promise.all(detail.exercises.map(async (exercise) => {
          const group = await database.getFirstAsync<{ name_es: string }>(
            `SELECT exercise_groups.name_es
             FROM exercises
             JOIN exercise_groups ON exercise_groups.id = exercises.group_id
             WHERE exercises.id = ?`,
            exercise.exerciseId,
          );
          return { ...exercise, groupName: group?.name_es ?? null };
        }));
        return { session: detail.session, exercises };
      }));
    },
  };
}
