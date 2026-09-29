import type { ExportDocument } from '../../domain/export.ts';

export const CSV_COLUMNS = [
  'session_id', 'fecha', 'session_exercise_id', 'performed_set_id', 'exercise_order',
  'grupo', 'ejercicio', 'configuracion', 'equipamiento', 'lateralidad', 'agarre',
  'anchura_agarre', 'set_index', 'dose_unit', 'dose_value', 'per_side', 'load_mode',
  'load_value', 'load_label', 'rir', 'exercise_note', 'session_note', 'started_at',
  'completed_at', 'confirmed_at',
] as const;

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeExportCsv(document: ExportDocument): string {
  const rows: (string | number | boolean | null)[][] = [Array.from(CSV_COLUMNS)];
  for (const session of document.sessions) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        rows.push([
          session.id, session.completed_at, exercise.id, set.id, exercise.order_index,
          exercise.group, exercise.exercise_name_snapshot, exercise.configuration_name_snapshot,
          exercise.selected_equipment, exercise.selected_laterality, exercise.selected_grip,
          exercise.selected_grip_width, set.set_index, set.dose_unit, set.dose_value,
          set.per_side, set.load_mode, set.load_value, set.load_label, set.rir,
          exercise.note, session.note, session.started_at, session.completed_at, set.confirmed_at,
        ]);
      }
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function serializeExportJson(document: ExportDocument): string {
  return JSON.stringify(document, null, 2);
}
