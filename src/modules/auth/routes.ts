import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';

import { ProblemDetailsSchema } from '../../shared/errors/problem-details.js';
import { authenticationRequired } from './authentication-errors.js';
import type { VerifyAccessToken } from './verify-access-token.js';
import { authenticateRequest } from './authenticate-request.js';
import { AuthenticatedPrincipalSchema } from './schemas.js';

export interface AuthRoutesOptions {
  readonly verifyAccessToken: VerifyAccessToken;
}

export const authRoutes: FastifyPluginCallbackTypebox<AuthRoutesOptions> = (app, options, done) => {
  app.get(
    '/api/v1/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Returns the authenticated principal.',
        security: [{ bearerAuth: [] }],
        querystring: Type.Object({}, { additionalProperties: false, maxProperties: 0 }),
        response: {
          200: AuthenticatedPrincipalSchema,
          401: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: [authenticateRequest(options.verifyAccessToken)],
    },
    (request) => {
      const identity = request.identity;
      if (!identity) {
        throw authenticationRequired();
      }

      return {
        ...identity,
        roles: [...identity.roles],
      };
    },
  );

  done();
};
