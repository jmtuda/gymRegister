export type SessionStatus = 'draft' | 'in_progress' | 'completed';
export type DoseUnit = 'reps' | 'seconds' | 'meters';
export type LoadMode =
  | 'TOTAL_KG'
  | 'IMPLEMENT_KG'
  | 'DISPLAYED_KG'
  | 'ASSISTANCE_KG'
  | 'BAND_LABEL'
  | 'BODYWEIGHT'
  | 'NONE';

export interface TrainingSession {
  id: string;
  status: SessionStatus;
  note: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  exerciseId: string;
  configurationId: string;
  exerciseNameSnapshot: string | null;
  configurationNameSnapshot: string | null;
  orderIndex: number;
  selectedEquipment: string | null;
  selectedLaterality: string | null;
  selectedGrip: string | null;
  selectedGripWidth: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformedSet {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  doseUnit: DoseUnit;
  doseValue: number;
  perSide: boolean;
  loadMode: LoadMode;
  loadValue: number | null;
  loadLabel: string | null;
  rir: number | null;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
}
