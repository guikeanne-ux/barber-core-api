import type { ApplicationConfiguration } from './configuration/configuration-schema.js';
import type { ApplicationDependencies } from './application-types.js';
import { checkDatabaseReadiness, createDatabaseConnection } from '../shared/database/database.js';
import { createVerifyAccessToken } from '../modules/auth/verify-access-token.js';
import { createCatalogService } from '../modules/catalog/catalog-service.js';
import { createPostgresCatalogRepository } from '../modules/catalog/postgres-catalog-repository.js';

export function createDependencies(
  configuration: Readonly<ApplicationConfiguration>,
): ApplicationDependencies {
  const database = createDatabaseConnection(configuration.DATABASE_URL);
  const verifyAccessToken = createVerifyAccessToken(configuration);
  const catalogRepository = createPostgresCatalogRepository(database);
  const catalogService = createCatalogService(catalogRepository);

  return {
    configuration,
    database,
    readinessProbe: () => checkDatabaseReadiness(database, 1_000),
    verifyAccessToken,
    catalogService,
  };
}
