import fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import type { BuiltApplication, ApplicationDependencies } from './application-types.js';
import { registerCorePlugins } from './plugins/register-plugins.js';
import { authRoutes } from '../modules/auth/routes.js';
import { resolveRequestId } from '../shared/http/request-id.js';
import { systemRoutes } from '../modules/system/system-routes.js';

function buildLoggerOptions(configuration: ApplicationDependencies['configuration']) {
  return {
    level: configuration.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        'password',
        'token',
        'secret',
        'clientSecret',
      ],
      remove: true,
    },
  };
}

export async function buildApplication(
  dependencies: ApplicationDependencies,
): Promise<BuiltApplication> {
  const app = fastify({
    logger: buildLoggerOptions(dependencies.configuration),
    bodyLimit: 1_048_576,
    disableRequestLogging: true,
    requestIdHeader: false,
    genReqId: (request) => {
      const headerValue = request.headers['x-request-id'];
      return typeof headerValue === 'string'
        ? resolveRequestId(headerValue)
        : resolveRequestId(undefined);
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await registerCorePlugins(app, {
    configuration: dependencies.configuration,
  });
  await app.register(authRoutes, {
    verifyAccessToken: dependencies.verifyAccessToken,
  });
  await app.register(systemRoutes, {
    configuration: dependencies.configuration,
    readinessProbe: dependencies.readinessProbe,
  });
  await app.ready();

  return {
    app,
    dependencies,
  };
}
