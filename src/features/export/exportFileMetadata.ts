import type { ExportFormat } from '../../domain/export.ts';

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
};

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function exportFileMetadata(format: ExportFormat, now: Date) {
  const stamp = [
    now.getUTCFullYear(),
    twoDigits(now.getUTCMonth() + 1),
    twoDigits(now.getUTCDate()),
    '-',
    twoDigits(now.getUTCHours()),
    twoDigits(now.getUTCMinutes()),
    twoDigits(now.getUTCSeconds()),
  ].join('');
  return {
    filename: `gymregister-history-${stamp}.${format}`,
    mimeType: MIME_TYPES[format],
    dialogTitle: format === 'csv' ? 'Exportar CSV' : 'Exportar JSON',
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
  };
}
