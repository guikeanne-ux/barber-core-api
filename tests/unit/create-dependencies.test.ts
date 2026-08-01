import { afterEach, describe, expect, it, vi } from 'vitest';

const createVerifyAccessTokenMock = vi.fn();
const createDatabaseConnectionMock = vi.fn();
const createPostgresCatalogRepositoryMock = vi.fn();
const createCatalogServiceMock = vi.fn();
const createFindProfessionalAvailabilityReferenceMock = vi.fn();
const createPostgresAvailabilityRepositoryMock = vi.fn();
const createAvailabilityServiceMock = vi.fn();
const checkDatabaseReadinessMock = vi.fn();

vi.mock('../../src/modules/auth/verify-access-token.js', () => ({
  createVerifyAccessToken: createVerifyAccessTokenMock,
}));

vi.mock('../../src/shared/database/database.js', () => ({
  createDatabaseConnection: createDatabaseConnectionMock,
  checkDatabaseReadiness: checkDatabaseReadinessMock,
}));

vi.mock('../../src/modules/catalog/postgres-catalog-repository.js', () => ({
  createPostgresCatalogRepository: createPostgresCatalogRepositoryMock,
}));

vi.mock('../../src/modules/catalog/catalog-service.js', () => ({
  createCatalogService: createCatalogServiceMock,
  createFindProfessionalAvailabilityReference: createFindProfessionalAvailabilityReferenceMock,
}));

vi.mock('../../src/modules/availability/postgres-availability-repository.js', () => ({
  createPostgresAvailabilityRepository: createPostgresAvailabilityRepositoryMock,
}));

vi.mock('../../src/modules/availability/availability-service.js', () => ({
  createAvailabilityService: createAvailabilityServiceMock,
}));

describe('createDependencies', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates the access token verifier with cooldown disabled', async () => {
    const verifyAccessToken = vi.fn();
    const database = { tag: 'database' };
    const catalogRepository = { tag: 'catalog-repository' };
    const catalogService = { tag: 'catalog-service' };
    const findProfessionalAvailabilityReference = vi.fn();
    const availabilityRepository = { tag: 'availability-repository' };
    const availabilityService = { tag: 'availability-service' };

    createVerifyAccessTokenMock.mockReturnValue(verifyAccessToken);
    createDatabaseConnectionMock.mockReturnValue(database);
    createPostgresCatalogRepositoryMock.mockReturnValue(catalogRepository);
    createCatalogServiceMock.mockReturnValue(catalogService);
    createFindProfessionalAvailabilityReferenceMock.mockReturnValue(
      findProfessionalAvailabilityReference,
    );
    createPostgresAvailabilityRepositoryMock.mockReturnValue(availabilityRepository);
    createAvailabilityServiceMock.mockReturnValue(availabilityService);
    checkDatabaseReadinessMock.mockResolvedValue({ ready: true });

    const { createDependencies } = await import('../../src/app/create-dependencies.js');

    const configuration = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://barber:barber@localhost:5432/barber_core_api',
      CORS_ORIGIN: 'http://localhost:5173',
      APP_VERSION: '0.1.0',
      SHUTDOWN_TIMEOUT_MS: 10_000,
      BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
      OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
      OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
      OIDC_AUDIENCE: 'barber-core-api',
      OIDC_CLOCK_TOLERANCE_SECONDS: 5,
      OIDC_JWKS_TIMEOUT_MS: 3000,
    } as const;

    const dependencies = createDependencies(configuration);

    expect(createDatabaseConnectionMock).toHaveBeenCalledWith(configuration.DATABASE_URL);
    expect(createVerifyAccessTokenMock).toHaveBeenCalledWith(configuration, {
      cooldownDurationMs: 0,
    });
    expect(dependencies.verifyAccessToken).toBe(verifyAccessToken);
    expect(dependencies.catalogService).toBe(catalogService);
    expect(dependencies.availabilityService).toBe(availabilityService);
    expect(createPostgresCatalogRepositoryMock).toHaveBeenCalledWith(database);
    expect(createCatalogServiceMock).toHaveBeenCalledWith(catalogRepository);
    expect(createFindProfessionalAvailabilityReferenceMock).toHaveBeenCalledWith(catalogRepository);
    expect(createPostgresAvailabilityRepositoryMock).toHaveBeenCalledWith(database);
    expect(createAvailabilityServiceMock).toHaveBeenCalledWith({
      repository: availabilityRepository,
      findProfessionalAvailabilityReference,
      businessTimeZone: configuration.BUSINESS_TIME_ZONE,
    });
  });
});
