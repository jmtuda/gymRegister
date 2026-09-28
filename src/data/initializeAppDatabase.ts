import { initializeDatabase } from './database.ts';
import { APPROVED_CATALOG } from './catalogData.ts';
import { seedSystemCatalog } from './catalogSeed.ts';
import type { Database } from './types.ts';

export async function initializeAppDatabase(database: Database): Promise<void> {
  await initializeDatabase(database);
  await seedSystemCatalog(database, APPROVED_CATALOG);
}
