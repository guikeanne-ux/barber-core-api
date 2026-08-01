import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  closeDatabaseConnection,
  createDatabaseConnection,
  runMigrations,
} from '../../src/shared/database/database.js';
import { createPostgresAvailabilityRepository } from '../../src/modules/availability/postgres-availability-repository.js';
import { startPostgresTestContainer } from './helpers/postgres-test-container.js';
import { productionMigrationsPath } from './helpers/production-migrations.js';

describe('availability repository integration', () => {
  let databaseUrl: string;
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const started = await startPostgresTestContainer();
    databaseUrl = started.databaseUrl;
    stopContainer = async () => {
      await started.container.stop();
    };

    const migrationConnection = createDatabaseConnection(databaseUrl);
    try {
      const migrated = await runMigrations({
        connection: migrationConnection,
        migrationsPath: productionMigrationsPath,
      });
      if (migrated.error) {
        throw migrated.error;
      }
    } finally {
      await closeDatabaseConnection(migrationConnection);
    }
  });

  afterAll(async () => {
    await stopContainer?.();
  });

  beforeEach(async () => {
    const connection = createDatabaseConnection(databaseUrl);

    try {
      await sql`delete from professional_availability_override_periods`.execute(connection.db);
      await sql`delete from professional_availability_overrides`.execute(connection.db);
      await sql`delete from professional_weekly_periods`.execute(connection.db);
      await sql`delete from professional_availability_profiles`.execute(connection.db);
      await sql`delete from professional_services`.execute(connection.db);
      await sql`delete from services`.execute(connection.db);
      await sql`delete from professionals`.execute(connection.db);
    } finally {
      await closeDatabaseConnection(connection);
    }
  });

  async function insertProfessional(status: 'active' | 'inactive' = 'active'): Promise<string> {
    const connection = createDatabaseConnection(databaseUrl);
    const professionalId = randomUUID();

    try {
      await sql`
        insert into professionals (id, name, status)
        values (${professionalId}, 'Availability Test Barber', ${status})
      `.execute(connection.db);
    } finally {
      await closeDatabaseConnection(connection);
    }

    return professionalId;
  }

  it('returns an empty weekly configuration without profile and persists the first explicit empty weekly write', async () => {
    const professionalId = await insertProfessional();
    const connection = createDatabaseConnection(databaseUrl);
    const repository = createPostgresAvailabilityRepository(connection);

    try {
      await expect(repository.getWeeklyAvailability(professionalId)).resolves.toEqual({
        week: {
          monday: [],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      });

      const first = await repository.replaceWeeklyAvailability(professionalId, {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      });
      expect(first.updatedAt).toBeDefined();

      const profileAfterFirst = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(connection.db);
      const firstProfileRow = profileAfterFirst.rows[0];
      expect(firstProfileRow?.weekly_updated_at).not.toBeNull();

      const second = await repository.replaceWeeklyAvailability(professionalId, {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      });
      expect(second.updatedAt).toBe(first.updatedAt);

      const profileAfterSecond = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(connection.db);

      expect(profileAfterSecond.rows[0]?.updated_at.toISOString()).toBe(
        firstProfileRow?.updated_at.toISOString(),
      );
      expect(profileAfterSecond.rows[0]?.weekly_updated_at?.toISOString()).toBe(
        firstProfileRow?.weekly_updated_at?.toISOString(),
      );
    } finally {
      await closeDatabaseConnection(connection);
    }
  });

  it('creates profile first by override, preserves weekly_updated_at as null, and keeps delete idempotent without profile', async () => {
    const professionalId = await insertProfessional('inactive');
    const noProfileId = await insertProfessional();
    const connection = createDatabaseConnection(databaseUrl);
    const repository = createPostgresAvailabilityRepository(connection);

    try {
      await repository.deleteOverride(noProfileId, '2026-08-04');

      const noProfileRows = await sql<{ count: string }>`
        select count(*)::text as count
        from professional_availability_profiles
        where professional_id = ${noProfileId}
      `.execute(connection.db);
      expect(noProfileRows.rows[0]?.count).toBe('0');

      await repository.upsertOverride(professionalId, {
        date: '2026-08-04',
        mode: 'closed',
      });

      const weekly = await repository.getWeeklyAvailability(professionalId);
      expect(weekly.updatedAt).toBeUndefined();

      const profile = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(connection.db);
      expect(profile.rows[0]?.weekly_updated_at).toBeNull();

      await repository.deleteOverride(professionalId, '2026-08-05');
      const profileAfterMissingDelete = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(connection.db);
      expect(profileAfterMissingDelete.rows[0]?.updated_at.toISOString()).toBe(
        profile.rows[0]?.updated_at.toISOString(),
      );
    } finally {
      await closeDatabaseConnection(connection);
    }
  });

  it('does not change weekly_updated_at on override changes and rolls back custom replace failures', async () => {
    const professionalId = await insertProfessional();
    const connection = createDatabaseConnection(databaseUrl);
    const repository = createPostgresAvailabilityRepository(connection);

    try {
      const weekly = await repository.replaceWeeklyAvailability(professionalId, {
        monday: [{ startMinute: 540, endMinute: 720 }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      });

      const closed = await repository.upsertOverride(professionalId, {
        date: '2026-08-04',
        mode: 'closed',
      });
      expect(closed.mode).toBe('closed');

      const afterClosed = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(connection.db);
      expect(afterClosed.rows[0]?.weekly_updated_at?.toISOString()).toBe(weekly.updatedAt);

      await expect(
        repository.upsertOverride(professionalId, {
          date: '2026-08-04',
          mode: 'custom',
          periods: [{ startMinute: 540, endMinute: 1441 }],
        }),
      ).rejects.toThrow();

      const overrides = await repository.listOverrides(professionalId, '2026-08-04', '2026-08-04');
      expect(overrides).toHaveLength(1);
      expect(overrides[0]).toMatchObject({
        date: '2026-08-04',
        mode: 'closed',
        periods: [],
      });

      const profileAfterFailure = await sql<{
        weekly_updated_at: Date | null;
      }>`
        select weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(connection.db);
      expect(profileAfterFailure.rows[0]?.weekly_updated_at?.toISOString()).toBe(weekly.updatedAt);
    } finally {
      await closeDatabaseConnection(connection);
    }
  });
});
