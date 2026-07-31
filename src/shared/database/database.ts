import * as path from 'node:path';
import { readdir } from 'node:fs/promises';

import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';

export type DatabaseSchema = Record<string, never>;

export interface DatabaseConnection {
  db: Kysely<DatabaseSchema>;
  pool: Pool;
}

export interface MigrationResultSummary {
  error?: Error;
  results: readonly {
    migrationName: string;
    status: 'Success' | 'Error' | 'NotExecuted';
  }[];
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });

  return { db, pool };
}

export async function closeDatabaseConnection(connection: DatabaseConnection): Promise<void> {
  await connection.db.destroy();
}

export async function checkDatabaseReadiness(
  connection: DatabaseConnection,
  timeoutMs = 1_000,
): Promise<{ ready: true } | { ready: false; reason: string }> {
  const timeout = new Promise<{ ready: false; reason: string }>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ready: false, reason: 'Database readiness timed out.' });
    }, timeoutMs);
    timer.unref();
  });

  const probe = (async () => {
    await sql`select 1`.execute(connection.db);
    return { ready: true } as const;
  })().catch((error: unknown) => ({
    ready: false as const,
    reason: error instanceof Error ? error.message : 'Unknown database error.',
  }));

  return Promise.race([probe, timeout]);
}

export async function runMigrations(params: {
  connection: DatabaseConnection;
  migrationsPath: string;
}): Promise<MigrationResultSummary> {
  const migrator = new Migrator({
    db: params.connection.db,
    provider: new FileMigrationProvider({
      fs: {
        readdir,
      },
      path,
      migrationFolder: params.migrationsPath,
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  const summarizedResults =
    results?.map((result) => ({
      migrationName: result.migrationName,
      status: result.status,
    })) ?? [];

  const normalizedError =
    error instanceof Error ? error : error ? new Error('Migration execution failed.') : undefined;

  return normalizedError
    ? { error: normalizedError, results: summarizedResults }
    : { results: summarizedResults };
}

export async function rollbackMigration(params: {
  connection: DatabaseConnection;
  migrationsPath: string;
}): Promise<MigrationResultSummary> {
  const migrator = new Migrator({
    db: params.connection.db,
    provider: new FileMigrationProvider({
      fs: {
        readdir,
      },
      path,
      migrationFolder: params.migrationsPath,
    }),
  });

  const { error, results } = await migrator.migrateDown();

  const summarizedResults =
    results?.map((result) => ({
      migrationName: result.migrationName,
      status: result.status,
    })) ?? [];

  const normalizedError =
    error instanceof Error ? error : error ? new Error('Migration rollback failed.') : undefined;

  return normalizedError
    ? { error: normalizedError, results: summarizedResults }
    : { results: summarizedResults };
}
