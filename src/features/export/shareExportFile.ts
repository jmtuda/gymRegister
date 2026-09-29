import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { ExportFormat } from '../../domain/export.ts';
import { exportFileMetadata } from './exportFileMetadata.ts';

export async function shareExportFile(
  format: ExportFormat,
  content: string,
  now = new Date(),
): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('No está disponible la caché de archivos.');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir archivos no está disponible en este dispositivo.');
  }
  const metadata = exportFileMetadata(format, now);
  const uri = `${FileSystem.cacheDirectory}${metadata.filename}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: metadata.mimeType,
    dialogTitle: metadata.dialogTitle,
    UTI: metadata.UTI,
  });
  return uri;
}
