import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { ExportFormat } from '../../domain/export.ts';

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
};

function filename(format: ExportFormat, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `gymregister-${stamp}.${format}`;
}

export async function shareExportFile(
  format: ExportFormat,
  content: string,
  now = new Date(),
): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('No está disponible la caché de archivos.');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir archivos no está disponible en este dispositivo.');
  }
  const uri = `${FileSystem.cacheDirectory}${filename(format, now)}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: MIME_TYPES[format],
    dialogTitle: format === 'csv' ? 'Exportar CSV' : 'Exportar JSON',
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
  });
  return uri;
}
