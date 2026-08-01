import type { FastifyError, FastifyInstance } from 'fastify';

import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import type { ApplicationConfiguration } from '../configuration/configuration-schema.js';
import { AuthenticationProblem } from '../../modules/auth/authentication-errors.js';
import { AvailabilityProblem } from '../../modules/availability/availability-errors.js';
import { CatalogProblem } from '../../modules/catalog/catalog-errors.js';
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

export interface CorePluginOptions {
  readonly configuration: Pick<
    ApplicationConfiguration,
    'APP_VERSION' | 'CORS_ORIGIN' | 'NODE_ENV'
  >;
}

export async function registerCorePlugins(
  app: FastifyInstance,
  options: Readonly<CorePluginOptions>,
): Promise<void> {
  await app.register(fastifyCors, {
    origin: options.configuration.CORS_ORIGIN,
  });

  await app.register(fastifyHelmet, {
    global: true,
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Barber Core API',
        version: options.configuration.APP_VERSION,
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
        {
          name: 'Auth',
          description: 'Authentication and authorization technical endpoints',
        },
        {
          name: 'Availability',
          description: 'Weekly availability, date overrides, and resolved availability endpoints',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
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
  app.decorateRequest('identity', null);

  app.addHook('onRequest', async (request, reply) => {
    request.receivedAtNs = process.hrtime.bigint();
    reply.header('x-request-id', request.id);
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        route: request.url,
        appVersion: options.configuration.APP_VERSION,
        environment: options.configuration.NODE_ENV,
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
        appVersion: options.configuration.APP_VERSION,
        environment: options.configuration.NODE_ENV,
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
    if (error instanceof AuthenticationProblem) {
      request.log.warn(
        {
          requestId: request.id,
          route: request.url,
          statusCode: error.statusCode,
          authenticationFailureCategory: error.failureCategory,
        },
        'authentication_failed',
      );

      if (error.headers) {
        for (const [name, value] of Object.entries(error.headers)) {
          reply.header(name, value);
        }
      }

      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(
          createProblemDetails(request, {
            type: error.type,
            title:
              error.statusCode === 403
                ? 'Forbidden'
                : error.statusCode === 503
                  ? 'Service Unavailable'
                  : 'Unauthorized',
            status: error.statusCode,
            detail: error.detail,
            code: error.code,
          }),
        );
    }

    if (error instanceof CatalogProblem) {
      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(
          createProblemDetails(request, {
            type: error.type,
            title: error.statusCode === 404 ? 'Not Found' : 'Invalid Request',
            status: error.statusCode,
            detail: error.detail,
            code: error.code,
            ...(error.errors ? { errors: [...error.errors] } : {}),
          }),
        );
    }

    if (error instanceof AvailabilityProblem) {
      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(
          createProblemDetails(request, {
            type: error.type,
            title: error.statusCode === 404 ? 'Not Found' : 'Invalid Request',
            status: error.statusCode,
            detail: error.detail,
            code: error.code,
            ...(error.errors ? { errors: [...error.errors] } : {}),
          }),
        );
    }

    request.log.error(
      {
        requestId: request.id,
        ...(error instanceof Error
          ? {
              errorName: error.name,
              errorMessage: error.message,
            }
          : {}),
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
