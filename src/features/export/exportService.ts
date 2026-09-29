import { createExportRepository } from '../../data/exportRepository.ts';
import type { Database } from '../../data/types.ts';
import type { ExportFormat } from '../../domain/export.ts';
import { buildExportDocument } from './exportModel.ts';
import { serializeExportCsv, serializeExportJson } from './exportSerializers.ts';
import { shareExportFile } from './shareExportFile.ts';

type ShareFile = typeof shareExportFile;

export function createExportService(database: Database, shareFile: ShareFile = shareExportFile) {
  const repository = createExportRepository(database);
  return {
    async export(format: ExportFormat, generatedAt = new Date().toISOString()) {
      const source = await repository.readCompletedSessions();
      if (source.length === 0) {
        throw new Error('No hay sesiones completadas para exportar.');
      }
      const document = buildExportDocument(source, generatedAt);
      const content = format === 'csv'
        ? serializeExportCsv(document)
        : serializeExportJson(document);
      const uri = await shareFile(format, content, new Date(generatedAt));
      return { content, document, uri };
    },
  };
}
