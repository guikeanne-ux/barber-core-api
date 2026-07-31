import { randomUUID } from 'node:crypto';

import fastify, { type FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ApplicationDependencies } from '../../src/app/application-types.js';
import '../../src/app/build-application.js';
import { registerCorePlugins } from '../../src/app/plugins/register-plugins.js';

interface ProblemDetailsResponse {
  code: string;
  errors?: {
    field: string;
    message: string;
    code?: string;
  }[];
}

describe('http error handling integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const dependencies: ApplicationDependencies = {
      configuration: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'silent',
        DATABASE_URL: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
      },
      database: {
        db: {} as never,
        pool: {} as never,
      },
      readinessTimeoutMs: 1_000,
      readinessProbe: () => Promise.resolve({ ready: true as const }),
    };

    const instance = fastify({
      logger: false,
      bodyLimit: 32,
      disableRequestLogging: true,
      requestIdHeader: false,
      genReqId: () => randomUUID(),
    }).withTypeProvider<TypeBoxTypeProvider>();

    instance.decorate('di', dependencies);

    await registerCorePlugins(instance);

    instance.post<{ Body: { name: string }; Reply: { name: string } }>(
      '/echo',
      {
        schema: {
          body: Type.Object({
            name: Type.String({ minLength: 1 }),
          }),
          response: {
            200: Type.Object({
              name: Type.String(),
            }),
          },
        },
      },
      (request) => request.body,
    );

    instance.get('/boom', () => {
      throw new Error('boom');
    });

    await instance.ready();
    app = instance;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns standardized validation problem details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: {},
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json<ProblemDetailsResponse>().code).toBe('VALIDATION_ERROR');
    expect(response.json<ProblemDetailsResponse>().errors).toBeDefined();
  });

  it('returns standardized unsupported media type problem details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: 'name=barber',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    expect(response.statusCode).toBe(415);
    expect(response.json<ProblemDetailsResponse>().code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('returns standardized payload too large problem details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: {
        name: 'x'.repeat(1_024),
      },
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json<ProblemDetailsResponse>().code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns standardized internal error problem details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/boom',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json<ProblemDetailsResponse>().code).toBe('INTERNAL_ERROR');
  });
});
