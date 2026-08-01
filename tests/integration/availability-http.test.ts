import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { buildApplication } from '../../src/app/build-application.js';
import { createDependencies } from '../../src/app/create-dependencies.js';
import { stopApplication } from '../../src/app/stop-application.js';
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  runMigrations,
} from '../../src/shared/database/database.js';
import {
  generateSigningKeyPair,
  JwksTestServer,
  signAccessToken,
  TEST_AUDIENCE,
  TEST_ISSUER,
} from './helpers/jwks-test-server.js';
import { startPostgresTestContainer } from './helpers/postgres-test-container.js';
import { productionMigrationsPath } from './helpers/production-migrations.js';

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}

describe('availability HTTP integration', () => {
  const jwksServer = new JwksTestServer();
  let databaseUrl: string;
  let stopContainer: (() => Promise<void>) | undefined;
  let adminKey: Awaited<ReturnType<typeof generateSigningKeyPair>>;
  let readerKey: Awaited<ReturnType<typeof generateSigningKeyPair>>;
  let adminToken: string;
  let managerToken: string;
  let barberToken: string;
  let receptionistToken: string;

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

    adminKey = await generateSigningKeyPair('kid-admin');
    readerKey = await generateSigningKeyPair('kid-reader');
    await jwksServer.start();

    adminToken = await signAccessToken(adminKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['admin'],
        },
      },
    });
    managerToken = await signAccessToken(adminKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['manager'],
        },
      },
    });
    barberToken = await signAccessToken(readerKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['barber'],
        },
      },
    });
    receptionistToken = await signAccessToken(readerKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['receptionist'],
        },
      },
    });
  });

  beforeEach(async () => {
    jwksServer.setMode('jwks');
    jwksServer.setKeys([adminKey.publicJwk, readerKey.publicJwk]);

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

  afterAll(async () => {
    await jwksServer.stop();
    await stopContainer?.();
  });

  async function buildTestApplication(jwksTimeoutMs = 300) {
    return buildApplication(
      createDependencies({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'silent',
        DATABASE_URL: databaseUrl,
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
        SHUTDOWN_TIMEOUT_MS: 10_000,
        BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
        OIDC_ISSUER_URL: TEST_ISSUER,
        OIDC_JWKS_URL: jwksServer.url,
        OIDC_AUDIENCE: TEST_AUDIENCE,
        OIDC_CLOCK_TOLERANCE_SECONDS: 5,
        OIDC_JWKS_TIMEOUT_MS: jwksTimeoutMs,
      }),
    );
  }

  async function insertProfessional(status: 'active' | 'inactive' = 'active'): Promise<string> {
    const connection = createDatabaseConnection(databaseUrl);
    const professionalId = randomUUID();

    try {
      await sql`
        insert into professionals (id, name, status)
        values (${professionalId}, 'Availability HTTP Barber', ${status})
      `.execute(connection.db);
    } finally {
      await closeDatabaseConnection(connection);
    }

    return professionalId;
  }

  it('returns empty weekly, empty override list, empty resolved data without profile, and keeps delete idempotent', async () => {
    const professionalId = await insertProfessional();
    const application = await buildTestApplication();
    const verificationConnection = createDatabaseConnection(databaseUrl);

    try {
      const weekly = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: authHeaders(barberToken),
      });
      expect(weekly.statusCode).toBe(200);
      expect(weekly.json()).toEqual({
        professionalId,
        timeZone: 'America/Sao_Paulo',
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

      const overrides = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/overrides?from=2026-08-03&to=2026-08-05`,
        headers: authHeaders(receptionistToken),
      });
      expect(overrides.statusCode).toBe(200);
      expect(overrides.json()).toEqual({
        professionalId,
        timeZone: 'America/Sao_Paulo',
        from: '2026-08-03',
        to: '2026-08-05',
        items: [],
      });

      const resolved = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/resolved?from=2026-08-03&to=2026-08-04`,
        headers: authHeaders(barberToken),
      });
      expect(resolved.statusCode).toBe(200);
      expect(resolved.json()).toEqual({
        professionalId,
        timeZone: 'America/Sao_Paulo',
        from: '2026-08-03',
        to: '2026-08-04',
        days: [
          {
            date: '2026-08-03',
            weekday: 'monday',
            source: 'weekly',
            periods: [],
          },
          {
            date: '2026-08-04',
            weekday: 'tuesday',
            source: 'weekly',
            periods: [],
          },
        ],
      });

      const deleted = await application.app.inject({
        method: 'DELETE',
        url: `/api/v1/professionals/${professionalId}/availability/overrides/2026-08-04`,
        headers: authHeaders(adminToken),
      });
      expect(deleted.statusCode).toBe(204);

      const profileCount = await sql<{ count: string }>`
        select count(*)::text as count
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(verificationConnection.db);
      expect(profileCount.rows[0]?.count).toBe('0');
    } finally {
      await closeDatabaseConnection(verificationConnection);
      await stopApplication(application);
    }
  });

  it('creates an explicit empty weekly configuration and preserves timestamps on repeated no-op PUT', async () => {
    const professionalId = await insertProfessional('inactive');
    const application = await buildTestApplication();
    const verificationConnection = createDatabaseConnection(databaseUrl);

    try {
      const payload = {
        week: {
          monday: [],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      };

      const first = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: {
          ...authHeaders(managerToken),
          'content-type': 'application/json',
        },
        payload,
      });
      expect(first.statusCode).toBe(200);
      const firstBody = first.json<{ updatedAt: string }>();
      expect(firstBody.updatedAt).toMatch(/Z$/);

      const profileAfterFirst = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(verificationConnection.db);

      const second = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: {
          ...authHeaders(managerToken),
          'content-type': 'application/json',
        },
        payload,
      });
      expect(second.statusCode).toBe(200);
      expect(second.json<{ updatedAt: string }>().updatedAt).toBe(firstBody.updatedAt);

      const profileAfterSecond = await sql<{
        updated_at: Date;
        weekly_updated_at: Date | null;
      }>`
        select updated_at, weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(verificationConnection.db);

      expect(profileAfterSecond.rows[0]?.updated_at.toISOString()).toBe(
        profileAfterFirst.rows[0]?.updated_at.toISOString(),
      );
      expect(profileAfterSecond.rows[0]?.weekly_updated_at?.toISOString()).toBe(
        profileAfterFirst.rows[0]?.weekly_updated_at?.toISOString(),
      );
    } finally {
      await closeDatabaseConnection(verificationConnection);
      await stopApplication(application);
    }
  });

  it('supports weekly availability, closed and custom overrides, listing, resolution, and weekly_updated_at isolation', async () => {
    const professionalId = await insertProfessional();
    const application = await buildTestApplication();
    const verificationConnection = createDatabaseConnection(databaseUrl);

    try {
      const weeklyPut = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          week: {
            monday: [{ start: '09:00', end: '12:00' }],
            tuesday: [{ start: '14:00', end: '18:00' }],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
          },
        },
      });
      expect(weeklyPut.statusCode).toBe(200);
      const weeklyUpdatedAt = weeklyPut.json<{ updatedAt: string }>().updatedAt;

      const closedOverride = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/overrides/2026-08-04`,
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          mode: 'closed',
        },
      });
      expect(closedOverride.statusCode).toBe(200);

      const customOverride = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/overrides/2026-08-05`,
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          mode: 'custom',
          periods: [{ start: '10:00', end: '14:00' }],
        },
      });
      expect(customOverride.statusCode).toBe(200);

      const weeklyGet = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: authHeaders(barberToken),
      });
      expect(weeklyGet.statusCode).toBe(200);
      expect(weeklyGet.json<{ updatedAt?: string }>().updatedAt).toBe(weeklyUpdatedAt);

      const profile = await sql<{
        weekly_updated_at: Date | null;
      }>`
        select weekly_updated_at
        from professional_availability_profiles
        where professional_id = ${professionalId}
      `.execute(verificationConnection.db);
      expect(profile.rows[0]?.weekly_updated_at?.toISOString()).toBe(weeklyUpdatedAt);

      const list = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/overrides?from=2026-08-03&to=2026-08-05`,
        headers: authHeaders(receptionistToken),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        items: [
          {
            date: '2026-08-04',
            mode: 'closed',
            periods: [],
          },
          {
            date: '2026-08-05',
            mode: 'custom',
            periods: [{ start: '10:00', end: '14:00' }],
          },
        ],
      });

      const resolved = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/resolved?from=2026-08-03&to=2026-08-05`,
        headers: authHeaders(barberToken),
      });
      expect(resolved.statusCode).toBe(200);
      expect(resolved.json()).toEqual({
        professionalId,
        timeZone: 'America/Sao_Paulo',
        from: '2026-08-03',
        to: '2026-08-05',
        days: [
          {
            date: '2026-08-03',
            weekday: 'monday',
            source: 'weekly',
            periods: [{ start: '09:00', end: '12:00' }],
          },
          {
            date: '2026-08-04',
            weekday: 'tuesday',
            source: 'override',
            overrideMode: 'closed',
            periods: [],
          },
          {
            date: '2026-08-05',
            weekday: 'wednesday',
            source: 'override',
            overrideMode: 'custom',
            periods: [{ start: '10:00', end: '14:00' }],
          },
        ],
      });
    } finally {
      await closeDatabaseConnection(verificationConnection);
      await stopApplication(application);
    }
  });

  it('applies validation, 403 write denial for barber, and 404 for missing professionals', async () => {
    const professionalId = await insertProfessional();
    const missingProfessionalId = randomUUID();
    const application = await buildTestApplication();

    try {
      const forbidden = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: {
          ...authHeaders(barberToken),
          'content-type': 'application/json',
        },
        payload: {
          week: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
          },
        },
      });
      expect(forbidden.statusCode).toBe(403);

      const invalid = await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          week: {
            monday: [{ start: '24:00', end: '12:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
          },
        },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.headers['content-type']).toContain('application/problem+json');
      expect(invalid.json<{ code: string }>().code).toBe('VALIDATION_ERROR');

      const missing = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${missingProfessionalId}/availability/weekly`,
        headers: authHeaders(adminToken),
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json<{ code: string }>().code).toBe('PROFESSIONAL_NOT_FOUND');
    } finally {
      await stopApplication(application);
    }
  });

  it('returns 503 for protected availability routes when JWKS is unavailable', async () => {
    const professionalId = await insertProfessional();
    jwksServer.setMode('hang');
    const application = await buildTestApplication(50);

    try {
      const response = await application.app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: authHeaders(adminToken),
      });

      expect(response.statusCode).toBe(503);
      expect(response.json<{ code: string }>().code).toBe('IDENTITY_PROVIDER_UNAVAILABLE');
    } finally {
      await stopApplication(application);
    }
  });
});
