/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import { professionalNotFound, serviceNotFound } from '../../src/modules/catalog/catalog-errors.js';
import type { CatalogRepository } from '../../src/modules/catalog/catalog-repository.js';
import { createCatalogService } from '../../src/modules/catalog/catalog-service.js';
import type {
  BarberService,
  PaginatedResult,
  Professional,
} from '../../src/modules/catalog/catalog-types.js';

function createProfessionalFixture(overrides: Partial<Professional> = {}): Professional {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    name: 'Ana Martins',
    status: 'active',
    createdAt: '2026-07-31T18:00:00.000Z',
    updatedAt: '2026-07-31T18:00:00.000Z',
    ...overrides,
  };
}

function createServiceFixture(overrides: Partial<BarberService> = {}): BarberService {
  return {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'Corte',
    status: 'active',
    durationMinutes: 30,
    priceCents: 4500,
    currency: 'BRL',
    createdAt: '2026-07-31T18:00:00.000Z',
    updatedAt: '2026-07-31T18:00:00.000Z',
    ...overrides,
  };
}

function createRepositoryStub(): CatalogRepository {
  return {
    createProfessional: vi.fn(),
    getProfessionalById: vi.fn(),
    listProfessionals: vi.fn(),
    updateProfessional: vi.fn(),
    setProfessionalStatus: vi.fn(),
    createService: vi.fn(),
    getServiceById: vi.fn(),
    listServices: vi.fn(),
    updateService: vi.fn(),
    setServiceStatus: vi.fn(),
    ensureProfessionalExists: vi.fn(),
    ensureServiceExists: vi.fn(),
    upsertProfessionalService: vi.fn(),
    removeProfessionalService: vi.fn(),
    listServicesByProfessional: vi.fn(),
    getAppointmentCatalogReference: vi.fn(),
  };
}

describe('createCatalogService', () => {
  it('normalizes and creates a professional', async () => {
    const repository = createRepositoryStub();
    const created = createProfessionalFixture({ bio: 'Especialista em cortes.' });
    vi.mocked(repository.createProfessional).mockResolvedValue(created);
    const service = createCatalogService(repository);

    const result = await service.createProfessional({
      name: '  Ana Martins  ',
      bio: '  Especialista em cortes.  ',
    });

    expect(result).toEqual(created);
    expect(repository.createProfessional).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Ana Martins',
      bio: 'Especialista em cortes.',
    });
  });

  it('rejects a professional name made only of spaces', async () => {
    const repository = createRepositoryStub();
    const service = createCatalogService(repository);

    await expect(
      service.createProfessional({
        name: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('treats an empty professional bio as absence on create', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.createProfessional).mockResolvedValue(createProfessionalFixture());
    const service = createCatalogService(repository);

    await service.createProfessional({
      name: 'Ana Martins',
      bio: '   ',
    });

    expect(repository.createProfessional).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Ana Martins',
    });
  });

  it('returns the current professional on a no-op patch', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ bio: 'Bio atual' });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    const service = createCatalogService(repository);

    const result = await service.updateProfessional(current.id, {
      name: '  Ana Martins  ',
      bio: '  Bio atual  ',
    });

    expect(result).toEqual(current);
    expect(repository.updateProfessional).not.toHaveBeenCalled();
  });

  it('updates a professional when the normalized patch changes the state', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ bio: 'Bio atual' });
    const updated = createProfessionalFixture({
      name: 'Ana Clara',
      bio: 'Nova bio',
      updatedAt: '2026-07-31T18:05:00.000Z',
    });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    vi.mocked(repository.updateProfessional).mockResolvedValue(updated);
    const service = createCatalogService(repository);

    const result = await service.updateProfessional(current.id, {
      name: '  Ana Clara  ',
      bio: '  Nova bio  ',
    });

    expect(result).toEqual(updated);
    expect(repository.updateProfessional).toHaveBeenCalledWith({
      id: current.id,
      name: 'Ana Clara',
      bio: 'Nova bio',
    });
  });

  it('keeps the existing bio when patch receives an empty optional string', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ bio: 'Bio atual' });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    const service = createCatalogService(repository);

    const result = await service.updateProfessional(current.id, {
      bio: '   ',
    });

    expect(result).toEqual(current);
    expect(repository.updateProfessional).not.toHaveBeenCalled();
  });

  it('clears the professional bio when patch receives null', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ bio: 'Bio atual' });
    const updated = createProfessionalFixture({
      updatedAt: '2026-07-31T18:05:00.000Z',
    });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    vi.mocked(repository.updateProfessional).mockResolvedValue(updated);
    const service = createCatalogService(repository);

    await service.updateProfessional(current.id, {
      bio: null,
    });

    expect(repository.updateProfessional).toHaveBeenCalledWith({
      id: current.id,
      name: current.name,
      bio: null,
    });
  });

  it('rejects an empty patch for professionals', async () => {
    const repository = createRepositoryStub();
    const service = createCatalogService(repository);

    await expect(service.updateProfessional('id', {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('activates a professional only when status really changes', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ status: 'inactive' });
    const updated = createProfessionalFixture({
      status: 'active',
      updatedAt: '2026-07-31T18:05:00.000Z',
    });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    vi.mocked(repository.setProfessionalStatus).mockResolvedValue(updated);
    const service = createCatalogService(repository);

    const result = await service.activateProfessional(current.id);

    expect(result).toEqual(updated);
    expect(repository.setProfessionalStatus).toHaveBeenCalledWith(current.id, 'active');
  });

  it('returns the current professional on idempotent activation', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ status: 'active' });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    const service = createCatalogService(repository);

    const result = await service.activateProfessional(current.id);

    expect(result).toEqual(current);
    expect(repository.setProfessionalStatus).not.toHaveBeenCalled();
  });

  it('deactivates a professional only when status really changes', async () => {
    const repository = createRepositoryStub();
    const current = createProfessionalFixture({ status: 'active' });
    const updated = createProfessionalFixture({
      status: 'inactive',
      updatedAt: '2026-07-31T18:05:00.000Z',
    });
    vi.mocked(repository.getProfessionalById).mockResolvedValue(current);
    vi.mocked(repository.setProfessionalStatus).mockResolvedValue(updated);
    const service = createCatalogService(repository);

    const result = await service.deactivateProfessional(current.id);

    expect(result).toEqual(updated);
    expect(repository.setProfessionalStatus).toHaveBeenCalledWith(current.id, 'inactive');
  });

  it('normalizes and creates a service', async () => {
    const repository = createRepositoryStub();
    const created = createServiceFixture({ description: 'Corte tradicional' });
    vi.mocked(repository.createService).mockResolvedValue(created);
    const service = createCatalogService(repository);

    const result = await service.createService({
      name: '  Corte  ',
      description: '  Corte tradicional  ',
      durationMinutes: 30,
      priceCents: 4500,
    });

    expect(result).toEqual(created);
    expect(repository.createService).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Corte',
      description: 'Corte tradicional',
      durationMinutes: 30,
      priceCents: 4500,
    });
  });

  it('rejects invalid service duration and price values', async () => {
    const repository = createRepositoryStub();
    const service = createCatalogService(repository);

    await expect(
      service.createService({
        name: 'Corte',
        durationMinutes: 4,
        priceCents: 4500,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      service.createService({
        name: 'Corte',
        durationMinutes: 30,
        priceCents: -1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns the current service on a no-op patch', async () => {
    const repository = createRepositoryStub();
    const current = createServiceFixture({ description: 'Descrição' });
    vi.mocked(repository.getServiceById).mockResolvedValue(current);
    const service = createCatalogService(repository);

    const result = await service.updateService(current.id, {
      name: '  Corte  ',
      description: '  Descrição  ',
      durationMinutes: 30,
      priceCents: 4500,
    });

    expect(result).toEqual(current);
    expect(repository.updateService).not.toHaveBeenCalled();
  });

  it('updates a service when the normalized patch changes the state', async () => {
    const repository = createRepositoryStub();
    const current = createServiceFixture({ description: 'Descrição' });
    const updated = createServiceFixture({
      name: 'Barba',
      description: 'Nova descrição',
      durationMinutes: 45,
      priceCents: 5000,
      updatedAt: '2026-07-31T18:05:00.000Z',
    });
    vi.mocked(repository.getServiceById).mockResolvedValue(current);
    vi.mocked(repository.updateService).mockResolvedValue(updated);
    const service = createCatalogService(repository);

    const result = await service.updateService(current.id, {
      name: '  Barba  ',
      description: '  Nova descrição  ',
      durationMinutes: 45,
      priceCents: 5000,
    });

    expect(result).toEqual(updated);
    expect(repository.updateService).toHaveBeenCalledWith({
      id: current.id,
      name: 'Barba',
      description: 'Nova descrição',
      durationMinutes: 45,
      priceCents: 5000,
    });
  });

  it('clears the service description when patch receives null', async () => {
    const repository = createRepositoryStub();
    const current = createServiceFixture({ description: 'Descrição' });
    const updated = createServiceFixture({
      updatedAt: '2026-07-31T18:05:00.000Z',
    });
    vi.mocked(repository.getServiceById).mockResolvedValue(current);
    vi.mocked(repository.updateService).mockResolvedValue(updated);
    const service = createCatalogService(repository);

    await service.updateService(current.id, {
      description: null,
    });

    expect(repository.updateService).toHaveBeenCalledWith({
      id: current.id,
      name: current.name,
      description: null,
      durationMinutes: current.durationMinutes,
      priceCents: current.priceCents,
    });
  });

  it('treats an empty service description as absence on create', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.createService).mockResolvedValue(createServiceFixture());
    const service = createCatalogService(repository);

    await service.createService({
      name: 'Corte',
      description: '   ',
      durationMinutes: 30,
      priceCents: 4500,
    });

    expect(repository.createService).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Corte',
      durationMinutes: 30,
      priceCents: 4500,
    });
  });

  it('normalizes list inputs for pagination and q', async () => {
    const repository = createRepositoryStub();
    const paginated: PaginatedResult<Professional> = {
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
    };
    vi.mocked(repository.listProfessionals).mockResolvedValue(paginated);
    const service = createCatalogService(repository);

    const result = await service.listProfessionals({
      q: '   ',
    });

    expect(result).toEqual(paginated);
    expect(repository.listProfessionals).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'active',
    });
  });

  it('rejects a search query longer than 100 characters after trim', async () => {
    const repository = createRepositoryStub();
    const service = createCatalogService(repository);

    await expect(
      service.listServices({
        q: ` ${'a'.repeat(101)} `,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('adds and removes professional-service capabilities idempotently after existence checks', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.ensureProfessionalExists).mockResolvedValue(true);
    vi.mocked(repository.ensureServiceExists).mockResolvedValue(true);
    const service = createCatalogService(repository);

    await service.addServiceToProfessional('pro-id', 'srv-id');
    await service.removeServiceFromProfessional('pro-id', 'srv-id');

    expect(repository.upsertProfessionalService).toHaveBeenCalledWith('pro-id', 'srv-id');
    expect(repository.removeProfessionalService).toHaveBeenCalledWith('pro-id', 'srv-id');
  });

  it('fails capability operations when the professional or service does not exist', async () => {
    const repository = createRepositoryStub();
    const service = createCatalogService(repository);

    vi.mocked(repository.ensureProfessionalExists).mockResolvedValue(false);
    await expect(service.addServiceToProfessional('missing-pro', 'srv-id')).rejects.toEqual(
      professionalNotFound(),
    );

    vi.mocked(repository.ensureProfessionalExists).mockResolvedValue(true);
    vi.mocked(repository.ensureServiceExists).mockResolvedValue(false);
    await expect(service.removeServiceFromProfessional('pro-id', 'missing-srv')).rejects.toEqual(
      serviceNotFound(),
    );
  });

  it('fails nested service listing when the professional does not exist', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.ensureProfessionalExists).mockResolvedValue(false);
    const service = createCatalogService(repository);

    await expect(
      service.listServicesByProfessional('missing-pro', {
        page: 1,
      }),
    ).rejects.toEqual(professionalNotFound());
  });
});
