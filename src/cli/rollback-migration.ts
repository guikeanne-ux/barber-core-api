import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMigrationConfiguration } from '../app/configuration/load-config.js';
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  rollbackMigration,
} from '../shared/database/database.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function resolveMigrationsPath(): Promise<string> {
  const candidates = [
    path.resolve(currentDir, '../../migrations'),
    path.resolve(currentDir, '../../../migrations'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('Unable to resolve migrations directory.');
}

const configuration = loadMigrationConfiguration();
const database = createDatabaseConnection(configuration.DATABASE_URL);

try {
  const migrationsPath = await resolveMigrationsPath();
  const summary = await rollbackMigration({
    connection: database,
    migrationsPath,
  });

  if (summary.error) {
    throw summary.error;
  }

  console.log(`Rollback completed. Affected entries: ${String(summary.results.length)}`);
} finally {
  await closeDatabaseConnection(database);
}
