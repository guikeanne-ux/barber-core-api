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

describe('appointments HTTP integration', () => {
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
      await sql`delete from appointments`.execute(connection.db);
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

  async function buildTestApplication() {
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
        OIDC_JWKS_TIMEOUT_MS: 300,
      }),
    );
  }

  async function prepareBookableContext(
    application: Awaited<ReturnType<typeof buildTestApplication>>,
  ) {
    const professionalResponse = await application.app.inject({
      method: 'POST',
      url: '/api/v1/professionals',
      headers: {
        ...authHeaders(adminToken),
        'content-type': 'application/json',
      },
      payload: {
        name: 'Ana Martins',
      },
    });
    const professionalId = professionalResponse.json<{ id: string }>().id;

    const serviceResponse = await application.app.inject({
      method: 'POST',
      url: '/api/v1/services',
      headers: {
        ...authHeaders(adminToken),
        'content-type': 'application/json',
      },
      payload: {
        name: 'Corte',
        durationMinutes: 30,
        priceCents: 4500,
      },
    });
    const serviceId = serviceResponse.json<{ id: string }>().id;

    await application.app.inject({
      method: 'PUT',
      url: `/api/v1/professionals/${professionalId}/services/${serviceId}`,
      headers: authHeaders(adminToken),
    });

    await application.app.inject({
      method: 'PUT',
      url: `/api/v1/professionals/${professionalId}/availability/weekly`,
      headers: {
        ...authHeaders(adminToken),
        'content-type': 'application/json',
      },
      payload: {
        week: {
          monday: [
            { start: '09:00', end: '12:00' },
            { start: '12:00', end: '18:00' },
          ],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      },
    });

    return {
      professionalId,
      serviceId,
    };
  }

  it('creates, reads, lists, cancels, and rebooks appointments through the public API', async () => {
    const application = await buildTestApplication();

    try {
      const { professionalId, serviceId } = await prepareBookableContext(application);

      const create = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '11:30',
          customerName: '  João da Silva  ',
          customerPhone: '  +5548999999999  ',
          notes: '  Primeira visita  ',
        },
      });

      expect(create.statusCode).toBe(201);
      expect(create.headers.location).toMatch(/^\/api\/v1\/appointments\//);
      const created = create.json<{
        id: string;
        status: string;
        end: string;
        professionalName: string;
        serviceName: string;
      }>();
      expect(created).toMatchObject({
        status: 'scheduled',
        end: '12:00',
        professionalName: 'Ana Martins',
        serviceName: 'Corte',
      });

      const get = await application.app.inject({
        method: 'GET',
        url: `/api/v1/appointments/${created.id}`,
        headers: authHeaders(barberToken),
      });
      expect(get.statusCode).toBe(200);
      expect(get.json()).toMatchObject({
        id: created.id,
        customerName: 'João da Silva',
      });

      const list = await application.app.inject({
        method: 'GET',
        url: `/api/v1/appointments?from=2026-08-03&to=2026-08-03&status=scheduled&page=1&pageSize=20`,
        headers: authHeaders(managerToken),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject({
        page: 1,
        pageSize: 20,
        totalItems: 1,
      });

      const overlap = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '11:45',
          customerName: 'Maria Oliveira',
        },
      });
      expect(overlap.statusCode).toBe(409);
      expect(overlap.json()).toMatchObject({
        code: 'APPOINTMENT_TIME_CONFLICT',
      });

      const cancel = await application.app.inject({
        method: 'POST',
        url: `/api/v1/appointments/${created.id}/cancel`,
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          reason: '  Cliente solicitou cancelamento.  ',
        },
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json()).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'Cliente solicitou cancelamento.',
      });

      const repeatedCancel = await application.app.inject({
        method: 'POST',
        url: `/api/v1/appointments/${created.id}/cancel`,
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          reason: 'Outra razão',
        },
      });
      expect(repeatedCancel.statusCode).toBe(200);
      expect(repeatedCancel.json()).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'Cliente solicitou cancelamento.',
      });

      const recreated = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '11:30',
          customerName: 'Carlos Souza',
        },
      });
      expect(recreated.statusCode).toBe(201);
    } finally {
      await stopApplication(application);
    }
  });

  it('supports end=24:00 and rejects intervals beyond the next local day boundary', async () => {
    const application = await buildTestApplication();

    try {
      const { professionalId, serviceId } = await prepareBookableContext(application);

      await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/availability/weekly`,
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          week: {
            monday: [{ start: '22:00', end: '24:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
          },
        },
      });

      const valid = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '23:30',
          customerName: 'João da Silva',
        },
      });

      expect(valid.statusCode).toBe(201);
      expect(valid.json()).toMatchObject({
        date: '2026-08-03',
        start: '23:30',
        end: '24:00',
      });

      const connection = createDatabaseConnection(databaseUrl);
      try {
        await sql`
          update services
          set duration_minutes = 31, updated_at = now()
          where id = ${serviceId}
        `.execute(connection.db);
      } finally {
        await closeDatabaseConnection(connection);
      }

      const invalid = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '23:30',
          customerName: 'Maria Oliveira',
        },
      });
      expect(invalid.statusCode).toBe(409);
      expect(invalid.json()).toMatchObject({
        code: 'APPOINTMENT_OUTSIDE_AVAILABILITY',
      });
    } finally {
      await stopApplication(application);
    }
  });

  it('keeps historical snapshots after catalog changes and renders using the row timezone snapshot', async () => {
    const application = await buildTestApplication();
    const verificationConnection = createDatabaseConnection(databaseUrl);

    try {
      const { professionalId, serviceId } = await prepareBookableContext(application);
      const create = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '09:00',
          customerName: 'João da Silva',
        },
      });
      const created = create.json<{ id: string }>();

      await sql`
        update professionals
        set name = 'Nome Novo', updated_at = now()
        where id = ${professionalId}
      `.execute(verificationConnection.db);
      await sql`
        update services
        set name = 'Serviço Novo', duration_minutes = 45, price_cents = 9999, updated_at = now()
        where id = ${serviceId}
      `.execute(verificationConnection.db);

      const get = await application.app.inject({
        method: 'GET',
        url: `/api/v1/appointments/${created.id}`,
        headers: authHeaders(barberToken),
      });

      expect(get.statusCode).toBe(200);
      expect(get.json()).toMatchObject({
        professionalName: 'Ana Martins',
        serviceName: 'Corte',
        durationMinutes: 30,
        priceCents: 4500,
        timeZone: 'America/Sao_Paulo',
        date: '2026-08-03',
        start: '09:00',
        end: '09:30',
      });
    } finally {
      await closeDatabaseConnection(verificationConnection);
      await stopApplication(application);
    }
  });

  it('enforces create and cancel authorization and validates list filters', async () => {
    const application = await buildTestApplication();

    try {
      const { professionalId, serviceId } = await prepareBookableContext(application);

      const forbiddenCreate = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(barberToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '09:00',
          customerName: 'João da Silva',
        },
      });
      expect(forbiddenCreate.statusCode).toBe(403);

      const create = await application.app.inject({
        method: 'POST',
        url: '/api/v1/appointments',
        headers: {
          ...authHeaders(receptionistToken),
          'content-type': 'application/json',
        },
        payload: {
          professionalId,
          serviceId,
          date: '2026-08-03',
          start: '09:00',
          customerName: 'João da Silva',
        },
      });
      const appointmentId = create.json<{ id: string }>().id;

      const forbiddenCancel = await application.app.inject({
        method: 'POST',
        url: `/api/v1/appointments/${appointmentId}/cancel`,
        headers: {
          ...authHeaders(barberToken),
          'content-type': 'application/json',
        },
        payload: {},
      });
      expect(forbiddenCancel.statusCode).toBe(403);

      const invalidRange = await application.app.inject({
        method: 'GET',
        url: '/api/v1/appointments?from=2026-08-01&to=2026-09-01',
        headers: authHeaders(barberToken),
      });
      expect(invalidRange.statusCode).toBe(400);
      expect(invalidRange.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    } finally {
      await stopApplication(application);
    }
  });

  it('prevents double booking under concurrent create requests and allows adjacent bookings', async () => {
    const application = await buildTestApplication();
    const verificationConnection = createDatabaseConnection(databaseUrl);

    try {
      const { professionalId, serviceId } = await prepareBookableContext(application);

      const [first, second] = await Promise.all([
        application.app.inject({
          method: 'POST',
          url: '/api/v1/appointments',
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            professionalId,
            serviceId,
            date: '2026-08-03',
            start: '10:00',
            customerName: 'Cliente A',
          },
        }),
        application.app.inject({
          method: 'POST',
          url: '/api/v1/appointments',
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            professionalId,
            serviceId,
            date: '2026-08-03',
            start: '10:00',
            customerName: 'Cliente B',
          },
        }),
      ]);

      const statuses = [first.statusCode, second.statusCode].sort();
      expect(statuses).toEqual([201, 409]);
      expect(
        [first.json<{ code?: string }>().code, second.json<{ code?: string }>().code].filter(
          (value) => value === 'APPOINTMENT_TIME_CONFLICT',
        ),
      ).toHaveLength(1);

      const scheduledRows = await sql<{ count: string }>`
        select count(*)::text as count
        from appointments
        where professional_id = ${professionalId}
          and status = 'scheduled'
      `.execute(verificationConnection.db);
      expect(scheduledRows.rows[0]?.count).toBe('1');

      const adjacent = await Promise.all([
        application.app.inject({
          method: 'POST',
          url: '/api/v1/appointments',
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            professionalId,
            serviceId,
            date: '2026-08-03',
            start: '12:00',
            customerName: 'Cliente C',
          },
        }),
        application.app.inject({
          method: 'POST',
          url: '/api/v1/appointments',
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            professionalId,
            serviceId,
            date: '2026-08-03',
            start: '12:30',
            customerName: 'Cliente D',
          },
        }),
      ]);

      expect(adjacent.map((response) => response.statusCode)).toEqual([201, 201]);
    } finally {
      await closeDatabaseConnection(verificationConnection);
      await stopApplication(application);
    }
  });

  it('allows overlapping bookings for different professionals and keeps concurrent cancellation idempotent', async () => {
    const application = await buildTestApplication();
    const verificationConnection = createDatabaseConnection(databaseUrl);

    try {
      const firstContext = await prepareBookableContext(application);
      const secondProfessional = await application.app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          name: 'Beatriz Silva',
        },
      });
      const secondProfessionalId = secondProfessional.json<{ id: string }>().id;
      await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${secondProfessionalId}/services/${firstContext.serviceId}`,
        headers: authHeaders(adminToken),
      });
      await application.app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${secondProfessionalId}/availability/weekly`,
        headers: {
          ...authHeaders(adminToken),
          'content-type': 'application/json',
        },
        payload: {
          week: {
            monday: [{ start: '09:00', end: '18:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
          },
        },
      });

      const parallel = await Promise.all([
        application.app.inject({
          method: 'POST',
          url: '/api/v1/appointments',
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            professionalId: firstContext.professionalId,
            serviceId: firstContext.serviceId,
            date: '2026-08-03',
            start: '15:00',
            customerName: 'Cliente A',
          },
        }),
        application.app.inject({
          method: 'POST',
          url: '/api/v1/appointments',
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            professionalId: secondProfessionalId,
            serviceId: firstContext.serviceId,
            date: '2026-08-03',
            start: '15:00',
            customerName: 'Cliente B',
          },
        }),
      ]);
      expect(parallel.map((response) => response.statusCode)).toEqual([201, 201]);

      const appointmentId = parallel[0].json<{ id: string }>().id;
      if (!appointmentId) {
        throw new Error('Expected created appointment id.');
      }

      const [firstCancel, secondCancel] = await Promise.all([
        application.app.inject({
          method: 'POST',
          url: `/api/v1/appointments/${appointmentId}/cancel`,
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            reason: 'Razão A',
          },
        }),
        application.app.inject({
          method: 'POST',
          url: `/api/v1/appointments/${appointmentId}/cancel`,
          headers: {
            ...authHeaders(receptionistToken),
            'content-type': 'application/json',
          },
          payload: {
            reason: 'Razão B',
          },
        }),
      ]);

      expect(firstCancel.statusCode).toBe(200);
      expect(secondCancel.statusCode).toBe(200);

      const persisted = await sql<{
        status: string;
        cancellation_reason: string | null;
        cancelled_at: Date | null;
      }>`
        select status, cancellation_reason, cancelled_at
        from appointments
        where id = ${appointmentId}
      `.execute(verificationConnection.db);
      expect(persisted.rows[0]?.status).toBe('cancelled');
      expect(['Razão A', 'Razão B']).toContain(persisted.rows[0]?.cancellation_reason ?? '');
      expect(persisted.rows[0]?.cancelled_at).not.toBeNull();
    } finally {
      await closeDatabaseConnection(verificationConnection);
      await stopApplication(application);
    }
  });
});
