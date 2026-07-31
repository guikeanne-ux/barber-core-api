import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfiguration } from '../app/configuration/load-config.js';
import { createDependencies } from '../app/create-dependencies.js';
import { closeDatabaseConnection, rollbackMigration } from '../shared/database/database.js';

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

const configuration = loadConfiguration();
const dependencies = createDependencies(configuration);

try {
  const migrationsPath = await resolveMigrationsPath();
  const summary = await rollbackMigration({
    connection: dependencies.database,
    migrationsPath,
  });

  if (summary.error) {
    throw summary.error;
  }

  console.log(`Rollback completed. Affected entries: ${String(summary.results.length)}`);
} finally {
  await closeDatabaseConnection(dependencies.database);
}
