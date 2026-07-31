import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  closeDatabaseConnection,
  createDatabaseConnection,
  rollbackMigration,
  runMigrations,
} from '../../src/shared/database/database.js';
import { startPostgresTestContainer } from './helpers/postgres-test-container.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsPath = path.resolve(currentDir, 'fixtures/migrations');

describe('database migrations', () => {
  let databaseUrl: string;
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const started = await startPostgresTestContainer();
    databaseUrl = started.databaseUrl;
    stopContainer = async () => {
      await started.container.stop();
    };
  });

  afterAll(async () => {
    await stopContainer?.();
  });

  it('migrates up, persists metadata, and rolls back', async () => {
    const connection = createDatabaseConnection(databaseUrl);

    try {
      const migrated = await runMigrations({
        connection,
        migrationsPath,
      });

      expect(migrated.error).toBeUndefined();
      expect(migrated.results.map((result) => result.migrationName)).toEqual([
        '0001_create_probe_table',
        '0002_add_probe_marker',
      ]);

      const probeTable = await sql<{ table_name: string }>`
        select table_name
        from information_schema.tables
        where table_name = 'integration_probe'
      `.execute(connection.db);
      expect(probeTable.rows).toHaveLength(1);

      const migrationMetadata = await sql<{ name: string }>`
        select name from kysely_migration order by name asc
      `.execute(connection.db);
      expect(migrationMetadata.rows.map((row) => row.name)).toEqual([
        '0001_create_probe_table',
        '0002_add_probe_marker',
      ]);

      const rolledBack = await rollbackMigration({
        connection,
        migrationsPath,
      });
      expect(rolledBack.error).toBeUndefined();

      const afterRollback = await sql<{ column_name: string }>`
        select column_name
        from information_schema.columns
        where table_name = 'integration_probe'
      `.execute(connection.db);
      expect(afterRollback.rows.map((row) => row.column_name)).not.toContain('marker');
    } finally {
      await closeDatabaseConnection(connection);
    }
  });
});
