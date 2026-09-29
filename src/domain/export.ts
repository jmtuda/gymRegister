import type { CompletedSessionDetail } from './history.ts';

export type ExportFormat = 'csv' | 'json';

export type ExportSourceExercise = CompletedSessionDetail['exercises'][number] & {
  groupId: string | null;
  groupName: string | null;
};

export interface ExportSourceSession {
  session: CompletedSessionDetail['session'];
  exercises: ExportSourceExercise[];
}

export interface ExportSet {
  id: string;
  session_exercise_id: string;
  set_index: number;
  dose_unit: string;
  dose_value: number;
  per_side: boolean;
  load_mode: string;
  load_value: number | null;
  load_label: string | null;
  rir: number | null;
  confirmed_at: string;
  created_at: string;
  updated_at: string;
}

export interface ExportExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  configuration_id: string;
  group_id: string | null;
  group_name: string | null;
  exercise_name_snapshot: string | null;
  configuration_name_snapshot: string | null;
  order_index: number;
  selected_equipment: string | null;
  selected_laterality: string | null;
  selected_grip: string | null;
  selected_grip_width: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  sets: ExportSet[];
}

export interface ExportSession {
  id: string;
  status: 'completed';
  note: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string;
  updated_at: string;
}

export interface ExportSessionEntry {
  session: ExportSession;
  exercises: ExportExercise[];
}

export interface ExportDocument {
  exportVersion: 1;
  generatedAt: string;
  sessions: ExportSessionEntry[];
}
