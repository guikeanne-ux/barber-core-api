import { randomUUID } from 'node:crypto';

import fastify, { type FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDependencies } from '../../src/app/create-dependencies.js';
import { registerCorePlugins } from '../../src/app/plugins/register-plugins.js';
import { authenticateRequest } from '../../src/modules/auth/authenticate-request.js';
import { requireAnyRole } from '../../src/modules/auth/require-any-role.js';
import type { VerifyAccessToken } from '../../src/modules/auth/verify-access-token.js';
import { registerCatalogModule } from '../../src/modules/catalog/register-catalog-module.js';
import { createVerifyAccessToken } from '../../src/modules/auth/verify-access-token.js';
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

interface ProblemDetailsResponse {
  code: string;
  requestId?: string;
}

async function buildCatalogTestApplication(input: {
  databaseUrl: string;
  jwksUrl: string;
  jwksTimeoutMs?: number;
  logLines?: string[];
  verifyAccessToken?: VerifyAccessToken;
}): Promise<FastifyInstance> {
  const dependencies = createDependencies({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: input.databaseUrl,
    CORS_ORIGIN: 'http://localhost:5173',
    APP_VERSION: '0.1.0',
    SHUTDOWN_TIMEOUT_MS: 10_000,
    OIDC_ISSUER_URL: TEST_ISSUER,
    OIDC_JWKS_URL: input.jwksUrl,
    OIDC_AUDIENCE: TEST_AUDIENCE,
    OIDC_CLOCK_TOLERANCE_SECONDS: 5,
    OIDC_JWKS_TIMEOUT_MS: input.jwksTimeoutMs ?? 300,
  });

  const app = fastify({
    logger: input.logLines
      ? {
          level: 'info',
          stream: {
            write: (line: string) => {
              input.logLines?.push(line);
            },
          },
        }
      : false,
    ajv: {
      customOptions: {
        coerceTypes: false,
      },
    },
    disableRequestLogging: true,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  await registerCorePlugins(app, {
    configuration: dependencies.configuration,
  });
  app.addHook('onClose', async () => {
    await closeDatabaseConnection(dependencies.database);
  });

  await app.register(registerCatalogModule, {
    verifyAccessToken:
      input.verifyAccessToken ??
      createVerifyAccessToken(
        {
          OIDC_ISSUER_URL: TEST_ISSUER,
          OIDC_JWKS_URL: input.jwksUrl,
          OIDC_AUDIENCE: TEST_AUDIENCE,
          OIDC_CLOCK_TOLERANCE_SECONDS: 5,
          OIDC_JWKS_TIMEOUT_MS: input.jwksTimeoutMs ?? 300,
        },
        {
          cooldownDurationMs: 0,
        },
      ),
    catalogService: dependencies.catalogService,
  });

  app.get(
    '/protected/catalog-manager',
    {
      preHandler: [authenticateRequest(dependencies.verifyAccessToken), requireAnyRole('manager')],
    },
    () => ({ ok: true as const }),
  );

  await app.ready();
  return app;
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}

describe('catalog HTTP integration', () => {
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

  beforeEach(() => {
    jwksServer.setMode('jwks');
    jwksServer.setKeys([adminKey.publicJwk, readerKey.publicJwk]);
  });

  afterAll(async () => {
    await jwksServer.stop();
    await stopContainer?.();
  });

  it('creates, lists, reads, updates, activates, and deactivates professionals', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: '  Ana Martins  ',
          bio: '  Especialista em cortes.  ',
        },
      });

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.headers.location).toMatch(/^\/api\/v1\/professionals\//);
      const created = createResponse.json<{
        id: string;
        name: string;
        bio?: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>();
      expect(created).toMatchObject({
        name: 'Ana Martins',
        bio: 'Especialista em cortes.',
        status: 'active',
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals?page=1&pageSize=20',
        headers: authHeaders(barberToken),
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toMatchObject({
        page: 1,
        pageSize: 20,
        totalItems: 1,
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${created.id}`,
        headers: authHeaders(receptionistToken),
      });
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json()).toMatchObject({
        id: created.id,
      });

      const noOpPatch = await app.inject({
        method: 'PATCH',
        url: `/api/v1/professionals/${created.id}`,
        headers: authHeaders(managerToken),
        payload: {
          name: ' Ana Martins ',
          bio: ' Especialista em cortes. ',
        },
      });
      expect(noOpPatch.statusCode).toBe(200);
      expect(noOpPatch.json()).toMatchObject({
        updatedAt: created.updatedAt,
      });

      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/professionals/${created.id}`,
        headers: authHeaders(managerToken),
        payload: {
          name: 'Ana Clara',
          bio: null,
        },
      });
      expect(updateResponse.statusCode).toBe(200);
      const updated = updateResponse.json<Record<string, unknown>>();
      expect(updated.name).toBe('Ana Clara');
      expect(updated).not.toHaveProperty('bio');
      expect(updated.updatedAt).not.toBe(created.updatedAt);

      const deactivateResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/professionals/${created.id}/deactivate`,
        headers: authHeaders(adminToken),
      });
      expect(deactivateResponse.statusCode).toBe(200);
      const deactivated = deactivateResponse.json<Record<string, string>>();
      expect(deactivated.status).toBe('inactive');

      const deactivateAgain = await app.inject({
        method: 'POST',
        url: `/api/v1/professionals/${created.id}/deactivate`,
        headers: authHeaders(adminToken),
      });
      expect(deactivateAgain.statusCode).toBe(200);
      expect(deactivateAgain.json()).toMatchObject({
        status: 'inactive',
        updatedAt: deactivated.updatedAt,
      });

      const activateResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/professionals/${created.id}/activate`,
        headers: authHeaders(adminToken),
      });
      expect(activateResponse.statusCode).toBe(200);
      expect(activateResponse.json()).toMatchObject({
        status: 'active',
      });
    } finally {
      await app.close();
    }
  });

  it('creates, lists, reads, updates, activates, and deactivates services', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: '  Corte  ',
          description: '  Corte tradicional.  ',
          durationMinutes: 30,
          priceCents: 4500,
        },
      });

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.headers.location).toMatch(/^\/api\/v1\/services\//);
      const created = createResponse.json<Record<string, unknown>>();
      expect(created).toMatchObject({
        name: 'Corte',
        description: 'Corte tradicional.',
        durationMinutes: 30,
        priceCents: 4500,
        currency: 'BRL',
        status: 'active',
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/services?page=1&pageSize=20',
        headers: authHeaders(barberToken),
      });
      expect(listResponse.statusCode).toBe(200);
      const listedServices = listResponse.json<{
        page: number;
        pageSize: number;
        totalItems: number;
      }>();
      expect(listedServices.page).toBe(1);
      expect(listedServices.pageSize).toBe(20);
      expect(typeof listedServices.totalItems).toBe('number');

      const noOpPatch = await app.inject({
        method: 'PATCH',
        url: `/api/v1/services/${created.id as string}`,
        headers: authHeaders(managerToken),
        payload: {
          name: ' Corte ',
          description: ' Corte tradicional. ',
          durationMinutes: 30,
          priceCents: 4500,
        },
      });
      expect(noOpPatch.statusCode).toBe(200);
      expect(noOpPatch.json()).toMatchObject({
        updatedAt: created.updatedAt,
      });

      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/services/${created.id as string}`,
        headers: authHeaders(managerToken),
        payload: {
          name: 'Barba',
          description: null,
          durationMinutes: 45,
          priceCents: 5000,
        },
      });
      expect(updateResponse.statusCode).toBe(200);
      const updated = updateResponse.json<Record<string, unknown>>();
      expect(updated).toMatchObject({
        name: 'Barba',
        durationMinutes: 45,
        priceCents: 5000,
      });
      expect(updated).not.toHaveProperty('description');

      const deactivateResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/services/${created.id as string}/deactivate`,
        headers: authHeaders(adminToken),
      });
      expect(deactivateResponse.statusCode).toBe(200);
      const deactivated = deactivateResponse.json<Record<string, string>>();
      expect(deactivated.status).toBe('inactive');

      const activateResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/services/${created.id as string}/activate`,
        headers: authHeaders(adminToken),
      });
      expect(activateResponse.statusCode).toBe(200);
      expect(activateResponse.json()).toMatchObject({
        status: 'active',
      });
    } finally {
      await app.close();
    }
  });

  it('filters, searches, paginates, and sorts catalog lists deterministically', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const alphaOne = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Alfa',
        },
      });
      const alphaTwo = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Alfa',
        },
      });
      const beta = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Beta',
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/professionals/${beta.json<{ id: string }>().id}/deactivate`,
        headers: authHeaders(adminToken),
      });

      const activeProfessionals = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals?page=1&pageSize=10',
        headers: authHeaders(barberToken),
      });
      expect(activeProfessionals.statusCode).toBe(200);
      const activeProfessionalList = activeProfessionals.json<{
        items: { id: string; name: string; status: string }[];
        totalItems: number;
      }>();
      const activeAlphaIds = [alphaOne, alphaTwo]
        .map((response) => response.json<{ id: string }>().id)
        .sort((left, right) => left.localeCompare(right));
      expect(activeProfessionalList.totalItems).toBeGreaterThanOrEqual(2);
      expect(activeProfessionalList.items.slice(0, 2)).toMatchObject([
        {
          id: activeAlphaIds[0],
          name: 'Alfa',
          status: 'active',
        },
        {
          id: activeAlphaIds[1],
          name: 'Alfa',
          status: 'active',
        },
      ]);

      const inactiveProfessionals = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals?status=inactive&q=beta',
        headers: authHeaders(receptionistToken),
      });
      expect(inactiveProfessionals.statusCode).toBe(200);
      expect(inactiveProfessionals.json()).toMatchObject({
        totalItems: 1,
        items: [{ name: 'Beta', status: 'inactive' }],
      });

      const allProfessionalsTrimmedSearch = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals?status=all&q=%20ALF%20',
        headers: authHeaders(managerToken),
      });
      expect(allProfessionalsTrimmedSearch.statusCode).toBe(200);
      expect(allProfessionalsTrimmedSearch.json()).toMatchObject({
        totalItems: 2,
      });

      const firstService = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Acabamento',
          durationMinutes: 20,
          priceCents: 2500,
        },
      });
      const secondService = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Acabamento',
          durationMinutes: 25,
          priceCents: 2600,
        },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Corte_100%',
          durationMinutes: 30,
          priceCents: 4000,
        },
      });
      const inactiveService = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Barba',
          durationMinutes: 35,
          priceCents: 5000,
        },
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/services/${inactiveService.json<{ id: string }>().id}/deactivate`,
        headers: authHeaders(adminToken),
      });

      const activeServices = await app.inject({
        method: 'GET',
        url: '/api/v1/services?page=1&pageSize=2',
        headers: authHeaders(barberToken),
      });
      expect(activeServices.statusCode).toBe(200);
      const activeServiceList = activeServices.json<{
        items: { id: string; name: string }[];
        page: number;
        pageSize: number;
        totalItems: number;
      }>();
      const activeAcabamentoIds = [firstService, secondService]
        .map((response) => response.json<{ id: string }>().id)
        .sort((left, right) => left.localeCompare(right));
      expect(activeServiceList).toMatchObject({
        page: 1,
        pageSize: 2,
      });
      expect(activeServiceList.totalItems).toBeGreaterThanOrEqual(3);
      expect(activeServiceList.items).toMatchObject([
        { id: activeAcabamentoIds[0], name: 'Acabamento' },
        { id: activeAcabamentoIds[1], name: 'Acabamento' },
      ]);

      const wildcardSearch = await app.inject({
        method: 'GET',
        url: '/api/v1/services?status=all&q=%20_100%25%20',
        headers: authHeaders(receptionistToken),
      });
      expect(wildcardSearch.statusCode).toBe(200);
      expect(wildcardSearch.json()).toMatchObject({
        totalItems: 1,
        items: [{ name: 'Corte_100%' }],
      });

      const inactiveServices = await app.inject({
        method: 'GET',
        url: '/api/v1/services?status=inactive&q=bar',
        headers: authHeaders(managerToken),
      });
      expect(inactiveServices.statusCode).toBe(200);
      expect(inactiveServices.json()).toMatchObject({
        totalItems: 1,
        items: [{ name: 'Barba', status: 'inactive' }],
      });
    } finally {
      await app.close();
    }
  });

  it('manages professional-service capabilities and nested service listing with filters', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const professional = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Marcelo',
        },
      });
      const professionalId = professional.json<{ id: string }>().id;

      const activeService = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Corte e barba',
          durationMinutes: 60,
          priceCents: 8000,
        },
      });
      const activeServiceId = activeService.json<{ id: string }>().id;

      const inactiveService = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Barba premium',
          durationMinutes: 40,
          priceCents: 7000,
        },
      });
      const inactiveServiceId = inactiveService.json<{ id: string }>().id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/services/${inactiveServiceId}/deactivate`,
        headers: authHeaders(adminToken),
      });

      const associateOne = await app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/services/${activeServiceId}`,
        headers: authHeaders(adminToken),
      });
      expect(associateOne.statusCode).toBe(204);

      const associateTwo = await app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/services/${inactiveServiceId}`,
        headers: authHeaders(adminToken),
      });
      expect(associateTwo.statusCode).toBe(204);

      const associateAgain = await app.inject({
        method: 'PUT',
        url: `/api/v1/professionals/${professionalId}/services/${activeServiceId}`,
        headers: authHeaders(adminToken),
      });
      expect(associateAgain.statusCode).toBe(204);

      const defaultNestedList = await app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/services?page=1&pageSize=20`,
        headers: authHeaders(barberToken),
      });
      expect(defaultNestedList.statusCode).toBe(200);
      expect(defaultNestedList.json()).toMatchObject({
        totalItems: 1,
      });

      const allNestedList = await app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/services?status=all&q=%20`,
        headers: authHeaders(barberToken),
      });
      expect(allNestedList.statusCode).toBe(200);
      expect(allNestedList.json()).toMatchObject({
        totalItems: 2,
      });

      const likeLiteralSearch = await app.inject({
        method: 'GET',
        url: `/api/v1/professionals/${professionalId}/services?status=all&q=%25`,
        headers: authHeaders(barberToken),
      });
      expect(likeLiteralSearch.statusCode).toBe(200);
      expect(likeLiteralSearch.json()).toMatchObject({
        totalItems: 0,
      });

      const removeResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/professionals/${professionalId}/services/${activeServiceId}`,
        headers: authHeaders(adminToken),
      });
      expect(removeResponse.statusCode).toBe(204);

      const removeAgain = await app.inject({
        method: 'DELETE',
        url: `/api/v1/professionals/${professionalId}/services/${activeServiceId}`,
        headers: authHeaders(adminToken),
      });
      expect(removeAgain.statusCode).toBe(204);
    } finally {
      await app.close();
    }
  });

  it('allows duplicate names and enforces not-found contracts for missing resources', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const firstCreate = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Profissional Duplicado',
        },
      });
      const secondCreate = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Profissional Duplicado',
        },
      });

      expect(firstCreate.statusCode).toBe(201);
      expect(secondCreate.statusCode).toBe(201);

      const missingProfessional = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals/11111111-2222-4333-8444-555555555999',
        headers: authHeaders(adminToken),
      });
      expect(missingProfessional.statusCode).toBe(404);
      expect(missingProfessional.json<ProblemDetailsResponse>().code).toBe(
        'PROFESSIONAL_NOT_FOUND',
      );

      const missingService = await app.inject({
        method: 'GET',
        url: '/api/v1/services/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee99',
        headers: authHeaders(adminToken),
      });
      expect(missingService.statusCode).toBe(404);
      expect(missingService.json<ProblemDetailsResponse>().code).toBe('SERVICE_NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it('returns validation errors for invalid requests', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const invalidProfessional = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: ' ',
          unknown: true,
        },
      });
      expect(invalidProfessional.statusCode).toBe(400);
      expect(invalidProfessional.json<ProblemDetailsResponse>().code).toBe('VALIDATION_ERROR');

      const invalidService = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Serviço',
          durationMinutes: 30.5,
          priceCents: 4500,
        },
      });
      expect(invalidService.statusCode).toBe(400);

      const invalidQuery = await app.inject({
        method: 'GET',
        url: '/api/v1/services?page=0&pageSize=101&status=unknown',
        headers: authHeaders(adminToken),
      });
      expect(invalidQuery.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('applies authentication and authorization policies to catalog routes', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const noAuth = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals',
      });
      expect(noAuth.statusCode).toBe(401);

      const forbiddenWriter = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(barberToken),
        payload: {
          name: 'Leitor',
        },
      });
      expect(forbiddenWriter.statusCode).toBe(403);

      const forbiddenReceptionistWriter = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(receptionistToken),
        payload: {
          name: 'Recepcao',
          durationMinutes: 30,
          priceCents: 3500,
        },
      });
      expect(forbiddenReceptionistWriter.statusCode).toBe(403);

      const readerAllowed = await app.inject({
        method: 'GET',
        url: '/api/v1/services',
        headers: authHeaders(receptionistToken),
      });
      expect(readerAllowed.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('returns 503 for protected catalog routes when JWKS is unavailable', async () => {
    jwksServer.setMode('hang');
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
      jwksTimeoutMs: 50,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
      });

      expect(response.statusCode).toBe(503);
      expect(response.json<ProblemDetailsResponse>().code).toBe('IDENTITY_PROVIDER_UNAVAILABLE');
    } finally {
      await app.close();
    }
  });

  it('returns sanitized 500 responses for unexpected catalog-service failures', async () => {
    const logLines: string[] = [];
    const baseDependencies = createDependencies({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'silent',
      DATABASE_URL: databaseUrl,
      CORS_ORIGIN: 'http://localhost:5173',
      APP_VERSION: '0.1.0',
      SHUTDOWN_TIMEOUT_MS: 10_000,
      OIDC_ISSUER_URL: TEST_ISSUER,
      OIDC_JWKS_URL: jwksServer.url,
      OIDC_AUDIENCE: TEST_AUDIENCE,
      OIDC_CLOCK_TOLERANCE_SECONDS: 5,
      OIDC_JWKS_TIMEOUT_MS: 300,
    });
    const app = fastify({
      logger: {
        level: 'info',
        stream: {
          write: (line: string) => {
            logLines.push(line);
          },
        },
      },
      ajv: {
        customOptions: {
          coerceTypes: false,
        },
      },
      disableRequestLogging: true,
      requestIdHeader: false,
      genReqId: () => randomUUID(),
    }).withTypeProvider<TypeBoxTypeProvider>();

    try {
      await registerCorePlugins(app, {
        configuration: baseDependencies.configuration,
      });
      app.addHook('onClose', async () => {
        await closeDatabaseConnection(baseDependencies.database);
      });
      await app.register(registerCatalogModule, {
        verifyAccessToken: baseDependencies.verifyAccessToken,
        catalogService: {
          ...baseDependencies.catalogService,
          createProfessional: () =>
            Promise.reject(new Error('simulated catalog persistence defect')),
        },
      });
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Erro inesperado',
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json<ProblemDetailsResponse>().code).toBe('INTERNAL_ERROR');
      expect(response.body).not.toContain('simulated catalog persistence defect');
      expect(logLines.join('\n')).toContain('request_failed');
      expect(logLines.join('\n')).toContain('simulated catalog persistence defect');
    } finally {
      await app.close();
    }
  });

  it('prevents duplicate capability rows under concurrent insertion', async () => {
    const app = await buildCatalogTestApplication({
      databaseUrl,
      jwksUrl: jwksServer.url,
    });

    try {
      const professional = await app.inject({
        method: 'POST',
        url: '/api/v1/professionals',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Concurrencia',
        },
      });
      const service = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: authHeaders(adminToken),
        payload: {
          name: 'Servico concorrente',
          durationMinutes: 30,
          priceCents: 4000,
        },
      });

      const professionalId = professional.json<{ id: string }>().id;
      const serviceId = service.json<{ id: string }>().id;

      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          app.inject({
            method: 'PUT',
            url: `/api/v1/professionals/${professionalId}/services/${serviceId}`,
            headers: authHeaders(adminToken),
          }),
        ),
      );

      for (const response of responses) {
        expect(response.statusCode).toBe(204);
      }

      const connection = createDatabaseConnection(databaseUrl);
      try {
        const rows = await sql<{ count: string }>`
          select count(*)::text as count
          from professional_services
          where professional_id = ${professionalId}
            and service_id = ${serviceId}
        `.execute(connection.db);

        expect(Number(rows.rows[0]?.count ?? '0')).toBe(1);
      } finally {
        await closeDatabaseConnection(connection);
      }
    } finally {
      await app.close();
    }
  });
});
