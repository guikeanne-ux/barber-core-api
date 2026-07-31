import type { ApplicationConfiguration } from './configuration/configuration-schema.js';
import type { ApplicationDependencies } from './application-types.js';
import { checkDatabaseReadiness, createDatabaseConnection } from '../shared/database/database.js';
import { createVerifyAccessToken } from '../modules/auth/verify-access-token.js';

export function createDependencies(
  configuration: Readonly<ApplicationConfiguration>,
): ApplicationDependencies {
  const database = createDatabaseConnection(configuration.DATABASE_URL);
  const verifyAccessToken = createVerifyAccessToken(configuration);

  return {
    configuration,
    database,
    readinessProbe: () => checkDatabaseReadiness(database, 1_000),
    verifyAccessToken,
  };
}
