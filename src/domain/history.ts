import type { PerformedSet, SessionExercise, TrainingSession } from './training.ts';

export interface CompletedSessionSummary {
  id: string;
  note: string | null;
  startedAt: string | null;
  completedAt: string;
  durationMs: number | null;
  exerciseCount: number;
  setCount: number;
}

export interface HistoricalExercise extends SessionExercise {
  sets: PerformedSet[];
}

export interface CompletedSessionDetail {
  session: TrainingSession & { status: 'completed'; completedAt: string };
  durationMs: number | null;
  exercises: HistoricalExercise[];
}
