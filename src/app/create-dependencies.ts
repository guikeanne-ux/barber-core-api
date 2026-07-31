import type { ApplicationConfiguration } from './configuration/configuration-schema.js';
import type { ApplicationDependencies } from './application-types.js';
import { checkDatabaseReadiness, createDatabaseConnection } from '../shared/database/database.js';

export function createDependencies(
  configuration: Readonly<ApplicationConfiguration>,
): ApplicationDependencies {
  const database = createDatabaseConnection(configuration.DATABASE_URL);

  return {
    configuration,
    database,
    readinessTimeoutMs: 1_000,
    readinessProbe: () => checkDatabaseReadiness(database, 1_000),
  };
}
