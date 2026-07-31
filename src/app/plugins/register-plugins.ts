import type { FastifyError, FastifyInstance } from 'fastify';

import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import {
  createProblemDetails,
  type ProblemFieldError,
} from '../../shared/errors/problem-details.js';

function toValidationErrors(
  validationErrors: readonly { instancePath?: string; message?: string; keyword?: string }[],
): ProblemFieldError[] {
  return validationErrors.map((item) => ({
    field: item.instancePath && item.instancePath.length > 0 ? item.instancePath : '/',
    message: item.message ?? 'Invalid value.',
    ...(item.keyword ? { code: item.keyword } : {}),
  }));
}

export async function registerCorePlugins(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCors, {
    origin: app.di.configuration.CORS_ORIGIN,
  });

  await app.register(fastifyHelmet, {
    global: true,
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Barber Core API',
        version: app.di.configuration.APP_VERSION,
        description: 'Technical foundation of the Barber Platform core API.',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development server',
        },
      ],
      tags: [
        {
          name: 'System',
          description: 'Technical endpoints of the API foundation',
        },
      ],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
  });

  app.decorateRequest('receivedAtNs', 0n);

  app.addHook('onRequest', async (request, reply) => {
    request.receivedAtNs = process.hrtime.bigint();
    reply.header('x-request-id', request.id);
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        route: request.url,
        appVersion: app.di.configuration.APP_VERSION,
        environment: app.di.configuration.NODE_ENV,
      },
      'request_started',
    );
  });

  app.addHook('onResponse', async (request, reply) => {
    const durationMs = Number(process.hrtime.bigint() - request.receivedAtNs) / 1_000_000;
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        route: request.url,
        statusCode: reply.statusCode,
        durationMs,
        appVersion: app.di.configuration.APP_VERSION,
        environment: app.di.configuration.NODE_ENV,
      },
      'request_completed',
    );
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .code(404)
      .type('application/problem+json')
      .send(
        createProblemDetails(request, {
          type: 'https://barber-platform.dev/problems/resource-not-found',
          title: 'Not Found',
          status: 404,
          detail: 'The requested resource was not found.',
          code: 'RESOURCE_NOT_FOUND',
        }),
      );
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        requestId: request.id,
        error,
      },
      'request_failed',
    );

    const fastifyError = error as FastifyError & {
      validation?: readonly { instancePath?: string; message?: string; keyword?: string }[];
    };

    if (Array.isArray(fastifyError.validation)) {
      return reply
        .code(400)
        .type('application/problem+json')
        .send(
          createProblemDetails(request, {
            type: 'https://barber-platform.dev/problems/validation-error',
            title: 'Invalid Request',
            status: 400,
            detail: 'One or more request fields are invalid.',
            code: 'VALIDATION_ERROR',
            errors: toValidationErrors(fastifyError.validation),
          }),
        );
    }

    if (fastifyError.statusCode === 415 || fastifyError.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply
        .code(415)
        .type('application/problem+json')
        .send(
          createProblemDetails(request, {
            type: 'https://barber-platform.dev/problems/unsupported-media-type',
            title: 'Unsupported Media Type',
            status: 415,
            detail: 'The request media type is not supported.',
            code: 'UNSUPPORTED_MEDIA_TYPE',
          }),
        );
    }

    if (fastifyError.statusCode === 413) {
      return reply
        .code(413)
        .type('application/problem+json')
        .send(
          createProblemDetails(request, {
            type: 'https://barber-platform.dev/problems/payload-too-large',
            title: 'Payload Too Large',
            status: 413,
            detail: 'The request body exceeds the allowed limit.',
            code: 'PAYLOAD_TOO_LARGE',
          }),
        );
    }

    return reply
      .code(500)
      .type('application/problem+json')
      .send(
        createProblemDetails(request, {
          type: 'https://barber-platform.dev/problems/internal-error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'An unexpected error occurred.',
          code: 'INTERNAL_ERROR',
        }),
      );
  });
}
