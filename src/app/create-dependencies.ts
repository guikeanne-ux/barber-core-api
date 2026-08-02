import type { ApplicationConfiguration } from './configuration/configuration-schema.js';
import type { ApplicationDependencies } from './application-types.js';
import { checkDatabaseReadiness, createDatabaseConnection } from '../shared/database/database.js';
import { createVerifyAccessToken } from '../modules/auth/verify-access-token.js';
import {
  createCatalogService,
  createFindAppointmentCatalogReference,
  createFindProfessionalAvailabilityReference,
} from '../modules/catalog/catalog-service.js';
import { createPostgresCatalogRepository } from '../modules/catalog/postgres-catalog-repository.js';
import { createPostgresAvailabilityRepository } from '../modules/availability/postgres-availability-repository.js';
import {
  createAvailabilityService,
  createResolveAvailabilityForAppointment,
} from '../modules/availability/availability-service.js';
import { createPostgresAppointmentRepository } from '../modules/appointments/postgres-appointment-repository.js';
import { createAppointmentService } from '../modules/appointments/appointment-service.js';

export function createDependencies(
  configuration: Readonly<ApplicationConfiguration>,
): ApplicationDependencies {
  const database = createDatabaseConnection(configuration.DATABASE_URL);
  const verifyAccessToken = createVerifyAccessToken(configuration, {
    cooldownDurationMs: 0,
  });
  const catalogRepository = createPostgresCatalogRepository(database);
  const catalogService = createCatalogService(catalogRepository);
  const findProfessionalAvailabilityReference =
    createFindProfessionalAvailabilityReference(catalogRepository);
  const availabilityRepository = createPostgresAvailabilityRepository(database);
  const availabilityService = createAvailabilityService({
    repository: availabilityRepository,
    findProfessionalAvailabilityReference,
    businessTimeZone: configuration.BUSINESS_TIME_ZONE,
  });
  const findAppointmentCatalogReference = createFindAppointmentCatalogReference(catalogRepository);
  const resolveAvailabilityForAppointment =
    createResolveAvailabilityForAppointment(availabilityService);
  const appointmentRepository = createPostgresAppointmentRepository(database);
  const appointmentService = createAppointmentService({
    repository: appointmentRepository,
    findAppointmentCatalogReference,
    resolveAvailabilityForAppointment,
    businessTimeZone: configuration.BUSINESS_TIME_ZONE,
  });

  return {
    configuration,
    database,
    readinessProbe: () => checkDatabaseReadiness(database, 1_000),
    verifyAccessToken,
    catalogService,
    availabilityService,
    appointmentService,
  };
}
