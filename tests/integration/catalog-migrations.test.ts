import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  closeDatabaseConnection,
  createDatabaseConnection,
  rollbackMigration,
  runMigrations,
} from '../../src/shared/database/database.js';
import { startPostgresTestContainer } from './helpers/postgres-test-container.js';
import { productionMigrationsPath } from './helpers/production-migrations.js';

describe('production migrations', () => {
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

  it('creates catalog and availability tables, defaults, constraints, indexes, and rolls back cleanly', async () => {
    const connection = createDatabaseConnection(databaseUrl);

    try {
      const migrated = await runMigrations({
        connection,
        migrationsPath: productionMigrationsPath,
      });

      expect(migrated.error).toBeUndefined();
      expect(migrated.results.at(-1)?.migrationName).toBe(
        '20260801003000_create_professional_availability_tables',
      );

      const tables = await sql<{ table_name: string }>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'professionals',
            'services',
            'professional_services',
            'professional_availability_profiles',
            'professional_weekly_periods',
            'professional_availability_overrides',
            'professional_availability_override_periods'
          )
        order by table_name asc
      `.execute(connection.db);
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'professional_availability_override_periods',
        'professional_availability_overrides',
        'professional_availability_profiles',
        'professional_services',
        'professional_weekly_periods',
        'professionals',
        'services',
      ]);

      const timestampDefaults = await sql<{
        table_name: string;
        column_name: string;
        column_default: string | null;
      }>`
        select table_name, column_name, column_default
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'professionals',
            'services',
            'professional_services',
            'professional_availability_profiles',
            'professional_availability_overrides'
          )
          and column_name in ('created_at', 'updated_at', 'weekly_updated_at')
        order by table_name asc, column_name asc
      `.execute(connection.db);
      expect(
        timestampDefaults.rows
          .filter((row) => row.column_name !== 'weekly_updated_at')
          .every((row) => row.column_default?.includes('now()')),
      ).toBe(true);
      expect(
        timestampDefaults.rows.find(
          (row) =>
            row.table_name === 'professional_availability_profiles' &&
            row.column_name === 'weekly_updated_at',
        )?.column_default ?? null,
      ).toBeNull();

      const restrictiveForeignKeys = await sql<{
        conname: string;
        confdeltype: string;
      }>`
        select c.conname, c.confdeltype
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname in ('professional_services', 'professional_availability_profiles')
          and c.contype = 'f'
        order by c.conname asc
      `.execute(connection.db);
      expect(restrictiveForeignKeys.rows).toEqual([
        {
          conname: 'professional_availability_profiles_professional_id_fkey',
          confdeltype: 'a',
        },
        {
          conname: 'professional_services_professional_id_fkey',
          confdeltype: 'a',
        },
        {
          conname: 'professional_services_service_id_fkey',
          confdeltype: 'a',
        },
      ]);

      const internalCascadeForeignKeys = await sql<{
        conname: string;
        confdeltype: string;
      }>`
        select c.conname, c.confdeltype
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname in (
          'professional_weekly_periods',
          'professional_availability_overrides',
          'professional_availability_override_periods'
        )
          and c.contype = 'f'
        order by c.conname asc
      `.execute(connection.db);
      expect(internalCascadeForeignKeys.rows).toEqual([
        {
          conname: 'professional_availability_override_periods_override_fkey',
          confdeltype: 'c',
        },
        {
          conname: 'professional_availability_overrides_professional_id_fkey',
          confdeltype: 'c',
        },
        {
          conname: 'professional_weekly_periods_professional_id_fkey',
          confdeltype: 'c',
        },
      ]);

      const indexes = await sql<{ indexname: string }>`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and tablename in (
            'professionals',
            'services',
            'professional_services',
            'professional_availability_profiles',
            'professional_weekly_periods',
            'professional_availability_overrides',
            'professional_availability_override_periods'
          )
        order by indexname asc
      `.execute(connection.db);
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'professional_availability_override_periods_pkey',
          'professional_availability_override_periods_professional_date_st',
          'professional_availability_overrides_pkey',
          'professional_availability_profiles_pkey',
          'professional_services_pkey',
          'professional_services_service_id_professional_id_idx',
          'professional_weekly_periods_pkey',
          'professional_weekly_periods_professional_weekday_start_idx',
          'professionals_name_id_idx',
          'professionals_pkey',
          'professionals_status_name_id_idx',
          'services_name_id_idx',
          'services_pkey',
          'services_status_name_id_idx',
        ]),
      );

      await expect(
        sql`
          insert into professionals (id, name, status)
          values ('11111111-2222-4333-8444-555555555555', ' ', 'active')
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professionals (id, name, status)
          values ('11111111-2222-4333-8444-555555555556', 'A', 'active')
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professionals (id, name, status)
          values ('11111111-2222-4333-8444-555555555557', 'Ana Martins', 'archived')
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into services (id, name, duration_minutes, price_cents, status)
          values ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1', 'Corte', 4, 4500, 'active')
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into services (id, name, duration_minutes, price_cents, status)
          values ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2', 'Corte', 30, -1, 'active')
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into services (id, name, duration_minutes, price_cents, status)
          values ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3', '  ', 30, 4500, 'active')
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_availability_profiles (professional_id)
          values ('11111111-2222-4333-8444-555555555999')
        `.execute(connection.db),
      ).rejects.toThrow();

      await sql`
        insert into professionals (id, name, status)
        values ('11111111-2222-4333-8444-555555555998', 'Availability Barber', 'active')
      `.execute(connection.db);

      await sql`
        insert into professional_availability_profiles (professional_id)
        values ('11111111-2222-4333-8444-555555555998')
      `.execute(connection.db);

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 0, 540, 720)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 8, 540, 720)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 1, -1, 720)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 1, 1440, 1440)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 1, 540, 0)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 1, 540, 1441)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 1, 540, 540)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_weekly_periods (professional_id, weekday, start_minute, end_minute)
          values ('11111111-2222-4333-8444-555555555998', 1, 540, 544)
        `.execute(connection.db),
      ).rejects.toThrow();

      await expect(
        sql`
          insert into professional_availability_overrides (professional_id, local_date, mode)
          values ('11111111-2222-4333-8444-555555555998', date '2026-08-04', 'invalid')
        `.execute(connection.db),
      ).rejects.toThrow();

      const rolledBack = await rollbackMigration({
        connection,
        migrationsPath: productionMigrationsPath,
      });

      expect(rolledBack.error).toBeUndefined();

      const afterRollback = await sql<{ table_name: string }>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'professional_availability_profiles',
            'professional_weekly_periods',
            'professional_availability_overrides',
            'professional_availability_override_periods'
          )
      `.execute(connection.db);
      expect(afterRollback.rows).toHaveLength(0);

      const reapplied = await runMigrations({
        connection,
        migrationsPath: productionMigrationsPath,
      });
      expect(reapplied.error).toBeUndefined();
    } finally {
      await closeDatabaseConnection(connection);
    }
  });
});
