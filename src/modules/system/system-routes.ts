import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { Type } from '@sinclair/typebox';

import { ProblemDetailsSchema } from '../../shared/errors/problem-details.js';

const HealthResponseSchema = Type.Object({
  service: Type.String(),
  version: Type.String(),
  environment: Type.String(),
  status: Type.String(),
  timestamp: Type.String({ format: 'date-time' }),
});

const LiveResponseSchema = Type.Object({
  status: Type.Literal('live'),
});

const ReadyResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('ready'), Type.Literal('not_ready')]),
});

export const systemRoutes: FastifyPluginCallbackTypebox = (app, _options, done) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Service information',
        querystring: Type.Object({}, { additionalProperties: false, maxProperties: 0 }),
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    () => ({
      service: 'barber-core-api',
      version: app.di.configuration.APP_VERSION,
      environment: app.di.configuration.NODE_ENV,
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    '/health/live',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness probe',
        querystring: Type.Object({}, { additionalProperties: false, maxProperties: 0 }),
        response: {
          200: LiveResponseSchema,
        },
      },
    },
    () =>
      ({
        status: 'live',
      }) as const,
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['System'],
        summary: 'Readiness probe',
        querystring: Type.Object({}, { additionalProperties: false, maxProperties: 0 }),
        response: {
          200: ReadyResponseSchema,
          503: ProblemDetailsSchema,
        },
      },
    },
    async (request, reply) => {
      const readiness = await app.di.readinessProbe();

      if (!readiness.ready) {
        return reply.code(503).type('application/problem+json').send({
          type: 'https://barber-platform.dev/problems/service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'The service is not ready to accept requests.',
          instance: request.url,
          code: 'SERVICE_UNAVAILABLE',
          requestId: request.id,
        });
      }

      return reply.code(200).send({
        status: 'ready',
      } as const);
    },
  );

  done();
};
