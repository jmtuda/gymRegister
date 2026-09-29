import type {
  ExportDocument, ExportExercise, ExportSession, ExportSet, ExportSourceSession,
} from '../../domain/export.ts';

function mapSet(value: ExportSourceSession['exercises'][number]['sets'][number]): ExportSet {
  return {
    id: value.id,
    session_exercise_id: value.sessionExerciseId,
    set_index: value.setIndex,
    dose_unit: value.doseUnit,
    dose_value: value.doseValue,
    per_side: value.perSide,
    load_mode: value.loadMode,
    load_value: value.loadValue,
    load_label: value.loadLabel,
    rir: value.rir,
    confirmed_at: value.confirmedAt,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

function mapExercise(value: ExportSourceSession['exercises'][number]): ExportExercise {
  return {
    id: value.id,
    session_id: value.sessionId,
    exercise_id: value.exerciseId,
    configuration_id: value.configurationId,
    group_id: value.groupId,
    group_name: value.groupName,
    exercise_name_snapshot: value.exerciseNameSnapshot,
    configuration_name_snapshot: value.configurationNameSnapshot,
    order_index: value.orderIndex,
    selected_equipment: value.selectedEquipment,
    selected_laterality: value.selectedLaterality,
    selected_grip: value.selectedGrip,
    selected_grip_width: value.selectedGripWidth,
    note: value.note,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
    sets: value.sets.map(mapSet),
  };
}

function mapSession(value: ExportSourceSession): ExportSession {
  const { session } = value;
  return {
    id: session.id,
    status: 'completed',
    note: session.note,
    created_at: session.createdAt,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    updated_at: session.updatedAt,
  };
}

export function buildExportDocument(
  sessions: ExportSourceSession[],
  generatedAt = new Date().toISOString(),
): ExportDocument {
  return {
    exportVersion: 1,
    generatedAt,
    sessions: sessions.map((value) => ({
      session: mapSession(value),
      exercises: value.exercises.map(mapExercise),
    })),
  };
}
