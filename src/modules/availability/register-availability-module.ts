import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import type { VerifyAccessToken } from '../auth/verify-access-token.js';
import type { AvailabilityService } from './availability-service.js';
import { availabilityRoutes } from './availability-routes.js';

export interface AvailabilityModuleOptions {
  readonly verifyAccessToken: VerifyAccessToken;
  readonly availabilityService: AvailabilityService;
}

export const registerAvailabilityModule: FastifyPluginCallbackTypebox<AvailabilityModuleOptions> = (
  app,
  options,
  done,
) => {
  app.register(availabilityRoutes, options);
  done();
};
