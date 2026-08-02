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

describe('appointments production migrations', () => {
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

  it('creates appointments, keeps btree_gist after rollback, and enforces the scheduling constraint', async () => {
    const connection = createDatabaseConnection(databaseUrl);

    try {
      const migrated = await runMigrations({
        connection,
        migrationsPath: productionMigrationsPath,
      });

      expect(migrated.error).toBeUndefined();
      expect(migrated.results.at(-1)?.migrationName).toBe(
        '20260802000000_create_appointments_table',
      );

      const extension = await sql<{ extname: string }>`
        select extname
        from pg_extension
        where extname = 'btree_gist'
      `.execute(connection.db);
      expect(extension.rows).toEqual([{ extname: 'btree_gist' }]);

      const appointmentsTable = await sql<{ table_name: string }>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'appointments'
      `.execute(connection.db);
      expect(appointmentsTable.rows).toEqual([{ table_name: 'appointments' }]);

      const restrictiveForeignKeys = await sql<{
        conname: string;
        confdeltype: string;
      }>`
        select c.conname, c.confdeltype
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname = 'appointments'
          and c.contype = 'f'
        order by c.conname asc
      `.execute(connection.db);
      expect(restrictiveForeignKeys.rows).toEqual([
        {
          conname: 'appointments_professional_id_fkey',
          confdeltype: 'a',
        },
        {
          conname: 'appointments_service_id_fkey',
          confdeltype: 'a',
        },
      ]);

      const indexes = await sql<{ indexname: string; indexdef: string }>`
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'appointments'
        order by indexname asc
      `.execute(connection.db);

      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'appointments_pkey',
          'appointments_professional_id_starts_at_id_idx',
          'appointments_professional_scheduled_time_excl',
          'appointments_starts_at_id_idx',
        ]),
      );
      expect(
        indexes.rows.filter(
          (row) =>
            row.indexdef.includes('USING gist') &&
            row.indexname !== 'appointments_professional_scheduled_time_excl',
        ),
      ).toEqual([]);

      await sql`
        insert into professionals (id, name, status)
        values ('11111111-2222-4333-8444-555555555555', 'Ana Martins', 'active')
      `.execute(connection.db);
      await sql`
        insert into professionals (id, name, status)
        values ('11111111-2222-4333-8444-555555555556', 'Beatriz Silva', 'active')
      `.execute(connection.db);
      await sql`
        insert into services (id, name, duration_minutes, price_cents, status)
        values ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Corte', 30, 4500, 'active')
      `.execute(connection.db);

      await expect(
        sql`
          insert into appointments (
            id,
            professional_id,
            service_id,
            professional_name,
            service_name,
            duration_minutes,
            price_cents,
            currency,
            customer_name,
            customer_phone,
            notes,
            time_zone,
            starts_at,
            ends_at,
            status,
            cancelled_at,
            cancellation_reason
          )
          values (
            'bbbbbbbb-1111-4333-8444-555555555555',
            '11111111-2222-4333-8444-555555555555',
            'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            ' ',
            'Corte',
            30,
            4500,
            'BRL',
            'João',
            null,
            null,
            'America/Sao_Paulo',
            '2026-08-10T12:00:00.000Z',
            '2026-08-10T12:30:00.000Z',
            'scheduled',
            null,
            null
          )
        `.execute(connection.db),
      ).rejects.toThrow();

      await sql`
        insert into appointments (
          id,
          professional_id,
          service_id,
          professional_name,
          service_name,
          duration_minutes,
          price_cents,
          currency,
          customer_name,
          customer_phone,
          notes,
          time_zone,
          starts_at,
          ends_at,
          status,
          cancelled_at,
          cancellation_reason
        )
        values (
          'bbbbbbbb-2222-4333-8444-555555555555',
          '11111111-2222-4333-8444-555555555555',
          'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          'Ana Martins',
          'Corte',
          30,
          4500,
          'BRL',
          'João da Silva',
          null,
          null,
          'America/Sao_Paulo',
          '2026-08-10T12:00:00.000Z',
          '2026-08-10T13:00:00.000Z',
          'scheduled',
          null,
          null
        )
      `.execute(connection.db);

      const overlappingInsert = sql`
        insert into appointments (
          id,
          professional_id,
          service_id,
          professional_name,
          service_name,
          duration_minutes,
          price_cents,
          currency,
          customer_name,
          customer_phone,
          notes,
          time_zone,
          starts_at,
          ends_at,
          status,
          cancelled_at,
          cancellation_reason
        )
        values (
          'bbbbbbbb-3333-4333-8444-555555555555',
          '11111111-2222-4333-8444-555555555555',
          'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          'Ana Martins',
          'Corte',
          30,
          4500,
          'BRL',
          'Maria Oliveira',
          null,
          null,
          'America/Sao_Paulo',
          '2026-08-10T12:30:00.000Z',
          '2026-08-10T13:30:00.000Z',
          'scheduled',
          null,
          null
        )
      `;

      await expect(overlappingInsert.execute(connection.db)).rejects.toMatchObject({
        code: '23P01',
        constraint: 'appointments_professional_scheduled_time_excl',
      });

      await expect(
        sql`
          insert into appointments (
            id,
            professional_id,
            service_id,
            professional_name,
            service_name,
            duration_minutes,
            price_cents,
            currency,
            customer_name,
            customer_phone,
            notes,
            time_zone,
            starts_at,
            ends_at,
            status,
            cancelled_at,
            cancellation_reason
          )
          values (
            'bbbbbbbb-4444-4333-8444-555555555555',
            '11111111-2222-4333-8444-555555555555',
            'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            'Ana Martins',
            'Corte',
            30,
            4500,
            'BRL',
            'Carlos Souza',
            null,
            null,
            'America/Sao_Paulo',
            '2026-08-10T13:00:00.000Z',
            '2026-08-10T14:00:00.000Z',
            'scheduled',
            null,
            null
          )
        `.execute(connection.db),
      ).resolves.toBeDefined();

      await expect(
        sql`
          insert into appointments (
            id,
            professional_id,
            service_id,
            professional_name,
            service_name,
            duration_minutes,
            price_cents,
            currency,
            customer_name,
            customer_phone,
            notes,
            time_zone,
            starts_at,
            ends_at,
            status,
            cancelled_at,
            cancellation_reason
          )
          values (
            'bbbbbbbb-5555-4333-8444-555555555555',
            '11111111-2222-4333-8444-555555555556',
            'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            'Beatriz Silva',
            'Corte',
            30,
            4500,
            'BRL',
            'Carla Lima',
            null,
            null,
            'America/Sao_Paulo',
            '2026-08-10T12:30:00.000Z',
            '2026-08-10T13:30:00.000Z',
            'scheduled',
            null,
            null
          )
        `.execute(connection.db),
      ).resolves.toBeDefined();

      await expect(
        sql`
          insert into appointments (
            id,
            professional_id,
            service_id,
            professional_name,
            service_name,
            duration_minutes,
            price_cents,
            currency,
            customer_name,
            customer_phone,
            notes,
            time_zone,
            starts_at,
            ends_at,
            status,
            cancelled_at,
            cancellation_reason
          )
          values (
            'bbbbbbbb-6666-4333-8444-555555555555',
            '11111111-2222-4333-8444-555555555555',
            'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            'Ana Martins',
            'Corte',
            30,
            4500,
            'BRL',
            'Pedro Rocha',
            null,
            null,
            'America/Sao_Paulo',
            '2026-08-10T12:15:00.000Z',
            '2026-08-10T12:45:00.000Z',
            'cancelled',
            now(),
            'Cliente solicitou cancelamento.'
          )
        `.execute(connection.db),
      ).resolves.toBeDefined();

      await sql`
        update appointments
        set
          status = 'cancelled',
          cancelled_at = now(),
          cancellation_reason = 'Cliente solicitou cancelamento.',
          updated_at = now()
        where id = 'bbbbbbbb-2222-4333-8444-555555555555'
      `.execute(connection.db);

      await expect(
        sql`
          insert into appointments (
            id,
            professional_id,
            service_id,
            professional_name,
            service_name,
            duration_minutes,
            price_cents,
            currency,
            customer_name,
            customer_phone,
            notes,
            time_zone,
            starts_at,
            ends_at,
            status,
            cancelled_at,
            cancellation_reason
          )
          values (
            'bbbbbbbb-7777-4333-8444-555555555555',
            '11111111-2222-4333-8444-555555555555',
            'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            'Ana Martins',
            'Corte',
            30,
            4500,
            'BRL',
            'Paula Gomes',
            null,
            null,
            'America/Sao_Paulo',
            '2026-08-10T12:00:00.000Z',
            '2026-08-10T13:00:00.000Z',
            'scheduled',
            null,
            null
          )
        `.execute(connection.db),
      ).resolves.toBeDefined();

      const rolledBack = await rollbackMigration({
        connection,
        migrationsPath: productionMigrationsPath,
      });
      expect(rolledBack.error).toBeUndefined();

      const extensionAfterRollback = await sql<{ extname: string }>`
        select extname
        from pg_extension
        where extname = 'btree_gist'
      `.execute(connection.db);
      expect(extensionAfterRollback.rows).toEqual([{ extname: 'btree_gist' }]);

      const appointmentsAfterRollback = await sql<{ table_name: string }>`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'appointments'
      `.execute(connection.db);
      expect(appointmentsAfterRollback.rows).toEqual([]);

      const reapplied = await runMigrations({
        connection,
        migrationsPath: productionMigrationsPath,
      });
      expect(reapplied.error).toBeUndefined();
      expect(reapplied.results.at(-1)?.migrationName).toBe(
        '20260802000000_create_appointments_table',
      );
    } finally {
      await closeDatabaseConnection(connection);
    }
  });
});
