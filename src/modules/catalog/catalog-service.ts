import { randomUUID } from 'node:crypto';

import type { ProblemFieldError } from '../../shared/errors/problem-details.js';
import { catalogValidationError, professionalNotFound, serviceNotFound } from './catalog-errors.js';
import type { CatalogRepository } from './catalog-repository.js';
import type {
  BarberService,
  CatalogListInput,
  ListStatus,
  PaginatedResult,
  Professional,
} from './catalog-types.js';

export interface CatalogService {
  createProfessional(input: { name: string; bio?: string | null }): Promise<Professional>;
  listProfessionals(input: {
    page?: number;
    pageSize?: number;
    status?: ListStatus;
    q?: string;
  }): Promise<PaginatedResult<Professional>>;
  getProfessionalById(id: string): Promise<Professional>;
  updateProfessional(
    id: string,
    input: { name?: string; bio?: string | null },
  ): Promise<Professional>;
  activateProfessional(id: string): Promise<Professional>;
  deactivateProfessional(id: string): Promise<Professional>;
  createService(input: {
    name: string;
    description?: string | null;
    durationMinutes: number;
    priceCents: number;
  }): Promise<BarberService>;
  listServices(input: {
    page?: number;
    pageSize?: number;
    status?: ListStatus;
    q?: string;
  }): Promise<PaginatedResult<BarberService>>;
  getServiceById(id: string): Promise<BarberService>;
  updateService(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      durationMinutes?: number;
      priceCents?: number;
    },
  ): Promise<BarberService>;
  activateService(id: string): Promise<BarberService>;
  deactivateService(id: string): Promise<BarberService>;
  addServiceToProfessional(professionalId: string, serviceId: string): Promise<void>;
  removeServiceFromProfessional(professionalId: string, serviceId: string): Promise<void>;
  listServicesByProfessional(
    professionalId: string,
    input: {
      page?: number;
      pageSize?: number;
      status?: ListStatus;
      q?: string;
    },
  ): Promise<PaginatedResult<BarberService>>;
}

export interface ProfessionalAvailabilityReference {
  readonly id: string;
}

export type FindProfessionalAvailabilityReference = (
  professionalId: string,
) => Promise<ProfessionalAvailabilityReference | null>;

function toFieldError(field: string, message: string, code = 'invalid'): ProblemFieldError {
  return { field, message, code };
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredName(field: string, value: string): string {
  const trimmed = value.trim();

  if (trimmed.length < 2 || trimmed.length > 120) {
    throw catalogValidationError('One or more request fields are invalid.', [
      toFieldError(`/${field}`, `${field} must contain between 2 and 120 characters after trim.`),
    ]);
  }

  return trimmed;
}

function normalizeOptionalDescription(
  field: 'bio' | 'description',
  value: string | null | undefined,
): string | undefined {
  const normalized = normalizeOptionalText(value);
  if (normalized !== undefined && normalized.length > 1000) {
    throw catalogValidationError('One or more request fields are invalid.', [
      toFieldError(`/${field}`, `${field} must contain at most 1000 characters after trim.`),
    ]);
  }

  return normalized;
}

function validateIntegerField(
  field: 'durationMinutes' | 'priceCents',
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw catalogValidationError('One or more request fields are invalid.', [
      toFieldError(
        `/${field}`,
        `${field} must be an integer between ${String(min)} and ${String(max)}.`,
      ),
    ]);
  }

  return value;
}

function normalizeListInput(input: {
  page?: number;
  pageSize?: number;
  status?: ListStatus;
  q?: string;
}): CatalogListInput {
  const q = normalizeOptionalText(input.q);
  if (q !== undefined && q.length > 100) {
    throw catalogValidationError('One or more request fields are invalid.', [
      toFieldError('/q', 'q must contain at most 100 characters after trim.'),
    ]);
  }

  return {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20,
    status: input.status ?? 'active',
    ...(q !== undefined ? { q } : {}),
  };
}

function ensurePatchHasChanges(input: Record<string, unknown>): void {
  if (Object.keys(input).length === 0) {
    throw catalogValidationError('The patch request must include at least one mutable field.', [
      toFieldError('/', 'At least one mutable field must be provided.', 'minProperties'),
    ]);
  }
}

export function createCatalogService(repository: CatalogRepository): CatalogService {
  return {
    async createProfessional(input) {
      const name = normalizeRequiredName('name', input.name);
      const bio = normalizeOptionalDescription('bio', input.bio);

      return repository.createProfessional({
        id: randomUUID(),
        name,
        ...(bio !== undefined ? { bio } : {}),
      });
    },

    async listProfessionals(input) {
      return repository.listProfessionals(normalizeListInput(input));
    },

    async getProfessionalById(id) {
      const professional = await repository.getProfessionalById(id);
      if (!professional) {
        throw professionalNotFound();
      }

      return professional;
    },

    async updateProfessional(id, input) {
      ensurePatchHasChanges(input);
      const current = await repository.getProfessionalById(id);
      if (!current) {
        throw professionalNotFound();
      }

      const nextName =
        input.name !== undefined ? normalizeRequiredName('name', input.name) : current.name;
      const nextBio =
        input.bio === undefined
          ? current.bio
          : input.bio === null
            ? undefined
            : (normalizeOptionalDescription('bio', input.bio) ?? current.bio);

      if (current.name === nextName && current.bio === nextBio) {
        return current;
      }

      return repository.updateProfessional({
        id,
        name: nextName,
        ...(input.bio === null ? { bio: null } : nextBio !== undefined ? { bio: nextBio } : {}),
      });
    },

    async activateProfessional(id) {
      const current = await repository.getProfessionalById(id);
      if (!current) {
        throw professionalNotFound();
      }

      if (current.status === 'active') {
        return current;
      }

      return (await repository.setProfessionalStatus(id, 'active')) ?? current;
    },

    async deactivateProfessional(id) {
      const current = await repository.getProfessionalById(id);
      if (!current) {
        throw professionalNotFound();
      }

      if (current.status === 'inactive') {
        return current;
      }

      return (await repository.setProfessionalStatus(id, 'inactive')) ?? current;
    },

    async createService(input) {
      const name = normalizeRequiredName('name', input.name);
      const description = normalizeOptionalDescription('description', input.description);
      const durationMinutes = validateIntegerField(
        'durationMinutes',
        input.durationMinutes,
        5,
        480,
      );
      const priceCents = validateIntegerField('priceCents', input.priceCents, 0, 10_000_000);

      return repository.createService({
        id: randomUUID(),
        name,
        durationMinutes,
        priceCents,
        ...(description !== undefined ? { description } : {}),
      });
    },

    async listServices(input) {
      return repository.listServices(normalizeListInput(input));
    },

    async getServiceById(id) {
      const service = await repository.getServiceById(id);
      if (!service) {
        throw serviceNotFound();
      }

      return service;
    },

    async updateService(id, input) {
      ensurePatchHasChanges(input);
      const current = await repository.getServiceById(id);
      if (!current) {
        throw serviceNotFound();
      }

      const nextName =
        input.name !== undefined ? normalizeRequiredName('name', input.name) : current.name;
      const nextDescription =
        input.description === undefined
          ? current.description
          : input.description === null
            ? undefined
            : (normalizeOptionalDescription('description', input.description) ??
              current.description);
      const nextDurationMinutes =
        input.durationMinutes !== undefined
          ? validateIntegerField('durationMinutes', input.durationMinutes, 5, 480)
          : current.durationMinutes;
      const nextPriceCents =
        input.priceCents !== undefined
          ? validateIntegerField('priceCents', input.priceCents, 0, 10_000_000)
          : current.priceCents;

      if (
        current.name === nextName &&
        current.description === nextDescription &&
        current.durationMinutes === nextDurationMinutes &&
        current.priceCents === nextPriceCents
      ) {
        return current;
      }

      return repository.updateService({
        id,
        name: nextName,
        durationMinutes: nextDurationMinutes,
        priceCents: nextPriceCents,
        ...(input.description === null
          ? { description: null }
          : nextDescription !== undefined
            ? { description: nextDescription }
            : {}),
      });
    },

    async activateService(id) {
      const current = await repository.getServiceById(id);
      if (!current) {
        throw serviceNotFound();
      }

      if (current.status === 'active') {
        return current;
      }

      return (await repository.setServiceStatus(id, 'active')) ?? current;
    },

    async deactivateService(id) {
      const current = await repository.getServiceById(id);
      if (!current) {
        throw serviceNotFound();
      }

      if (current.status === 'inactive') {
        return current;
      }

      return (await repository.setServiceStatus(id, 'inactive')) ?? current;
    },

    async addServiceToProfessional(professionalId, serviceId) {
      if (!(await repository.ensureProfessionalExists(professionalId))) {
        throw professionalNotFound();
      }

      if (!(await repository.ensureServiceExists(serviceId))) {
        throw serviceNotFound();
      }

      await repository.upsertProfessionalService(professionalId, serviceId);
    },

    async removeServiceFromProfessional(professionalId, serviceId) {
      if (!(await repository.ensureProfessionalExists(professionalId))) {
        throw professionalNotFound();
      }

      if (!(await repository.ensureServiceExists(serviceId))) {
        throw serviceNotFound();
      }

      await repository.removeProfessionalService(professionalId, serviceId);
    },

    async listServicesByProfessional(professionalId, input) {
      if (!(await repository.ensureProfessionalExists(professionalId))) {
        throw professionalNotFound();
      }

      return repository.listServicesByProfessional(professionalId, normalizeListInput(input));
    },
  };
}

export function createFindProfessionalAvailabilityReference(
  repository: Pick<CatalogRepository, 'ensureProfessionalExists'>,
): FindProfessionalAvailabilityReference {
  return async (professionalId) =>
    (await repository.ensureProfessionalExists(professionalId)) ? { id: professionalId } : null;
}
