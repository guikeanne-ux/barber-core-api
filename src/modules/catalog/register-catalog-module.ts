import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import type { VerifyAccessToken } from '../auth/verify-access-token.js';
import type { CatalogService } from './catalog-service.js';
import { professionalRoutes } from './professional-routes.js';
import { serviceRoutes } from './service-routes.js';

export interface CatalogModuleOptions {
  readonly verifyAccessToken: VerifyAccessToken;
  readonly catalogService: CatalogService;
}

export const registerCatalogModule: FastifyPluginCallbackTypebox<CatalogModuleOptions> = (
  app,
  options,
  done,
) => {
  app.register(professionalRoutes, options);
  app.register(serviceRoutes, options);
  done();
};
