import type { ExportDocument } from '../../domain/export.ts';

export const CSV_COLUMNS = [
  'session_id', 'session_started_at', 'session_completed_at', 'session_note',
  'session_created_at', 'session_updated_at', 'exercise_order', 'session_exercise_id',
  'exercise_id', 'exercise_name', 'configuration_id', 'configuration_name', 'group_id',
  'group_name', 'equipment', 'laterality', 'grip', 'grip_width', 'exercise_note',
  'exercise_created_at', 'exercise_updated_at', 'set_id', 'set_index', 'dose_unit',
  'dose_value', 'per_side', 'load_mode', 'load_value', 'load_label', 'rir',
  'confirmed_at', 'set_created_at', 'set_updated_at',
] as const;

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeExportCsv(document: ExportDocument): string {
  const rows: (string | number | boolean | null)[][] = [Array.from(CSV_COLUMNS)];
  for (const entry of document.sessions) {
    const { session } = entry;
    for (const exercise of entry.exercises) {
      for (const set of exercise.sets) {
        rows.push([
          session.id, session.started_at, session.completed_at, session.note,
          session.created_at, session.updated_at, exercise.order_index, exercise.id,
          exercise.exercise_id, exercise.exercise_name_snapshot, exercise.configuration_id,
          exercise.configuration_name_snapshot, exercise.group_id, exercise.group_name,
          exercise.selected_equipment, exercise.selected_laterality, exercise.selected_grip,
          exercise.selected_grip_width, exercise.note, exercise.created_at, exercise.updated_at,
          set.id, set.set_index, set.dose_unit, set.dose_value, set.per_side, set.load_mode,
          set.load_value, set.load_label, set.rir, set.confirmed_at, set.created_at, set.updated_at,
        ]);
      }
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function serializeExportJson(document: ExportDocument): string {
  return JSON.stringify(document, null, 2);
}
