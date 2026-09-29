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
    async export(format: ExportFormat, exportedAt = new Date().toISOString()) {
      const source = await repository.readCompletedSessions();
      const document = buildExportDocument(source, exportedAt);
      const content = format === 'csv'
        ? serializeExportCsv(document)
        : serializeExportJson(document);
      const uri = await shareFile(format, content, new Date(exportedAt));
      return { content, document, uri };
    },
  };
}
