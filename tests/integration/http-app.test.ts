import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApplication } from '../../src/app/build-application.js';
import { createDependencies } from '../../src/app/create-dependencies.js';
import { stopApplication } from '../../src/app/stop-application.js';
import { startPostgresTestContainer } from './helpers/postgres-test-container.js';

interface ProblemDetailsResponse {
  code: string;
}

interface OpenApiDocument {
  openapi: string;
}

describe('http application integration', () => {
  let application: Awaited<ReturnType<typeof buildApplication>> | undefined;
  let stopContainer: (() => Promise<void>) | undefined;

  function getApplication(): Awaited<ReturnType<typeof buildApplication>> {
    if (!application) {
      throw new Error('Application test fixture is not initialized.');
    }

    return application;
  }

  beforeAll(async () => {
    const started = await startPostgresTestContainer();
    stopContainer = async () => {
      await started.container.stop();
    };
    application = await buildApplication(
      createDependencies({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'silent',
        DATABASE_URL: started.databaseUrl,
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
      }),
    );
  });

  afterAll(async () => {
    if (application) {
      await stopApplication(application);
    }
    await stopContainer?.();
  });

  it('builds the application without opening a TCP port', () => {
    expect(getApplication().app.server.listening).toBe(false);
  });

  it('returns service health information', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'barber-core-api',
      status: 'ok',
    });
  });

  it('returns liveness independently from the database', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'live' });
  });

  it('returns readiness when PostgreSQL is available', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('returns problem details when readiness dependency is unavailable', async () => {
    const failingApp = await buildApplication({
      ...getApplication().dependencies,
      readinessProbe: vi.fn().mockResolvedValue({
        ready: false,
        reason: 'database down',
      }),
    });

    try {
      const response = await failingApp.app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json<ProblemDetailsResponse>().code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await failingApp.app.close();
    }
  });

  it('returns request id header when missing', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('preserves a valid external request id', async () => {
    const requestId = '7fef1a5d-7f30-4b77-a59c-7ed57546f18c';
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-request-id': requestId,
      },
    });

    expect(response.headers['x-request-id']).toBe(requestId);
  });

  it('replaces an invalid external request id', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-request-id': 'invalid',
      },
    });

    expect(response.headers['x-request-id']).not.toBe('invalid');
  });

  it('returns standardized 404 problem details', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/api/v1/unknown',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json<ProblemDetailsResponse>().code).toBe('RESOURCE_NOT_FOUND');
  });

  it('returns validation problem details', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/live?invalid=x',
    });

    expect(response.statusCode).toBe(400);
  });

  it('exposes CORS headers for the configured origin', async () => {
    const response = await getApplication().app.inject({
      method: 'OPTIONS',
      url: '/health/live',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('returns security headers', async () => {
    const response = await getApplication().app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.headers['x-content-type-options']).toBeDefined();
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('exposes OpenAPI JSON and Swagger UI endpoints', async () => {
    const jsonResponse = await getApplication().app.inject({
      method: 'GET',
      url: '/docs/json',
    });
    const docsResponse = await getApplication().app.inject({
      method: 'GET',
      url: '/docs',
    });

    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.json<OpenApiDocument>().openapi).toBe('3.1.0');
    expect(docsResponse.statusCode).toBe(200);
  });

  it('closes resources during shutdown', async () => {
    const app = await buildApplication(
      createDependencies({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3001,
        LOG_LEVEL: 'silent',
        DATABASE_URL: getApplication().dependencies.configuration.DATABASE_URL,
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
      }),
    );
    const destroySpy = vi.spyOn(app.dependencies.database.db, 'destroy');

    await stopApplication(app);

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
