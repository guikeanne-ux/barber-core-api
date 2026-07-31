import type {
  BarberService,
  CatalogListInput,
  CreateBarberServiceInput,
  CreateProfessionalInput,
  PaginatedResult,
  Professional,
  ProfessionalStatus,
  ServiceStatus,
  UpdateBarberServiceInput,
  UpdateProfessionalInput,
} from './catalog-types.js';

export interface CatalogRepository {
  createProfessional(input: CreateProfessionalInput): Promise<Professional>;
  getProfessionalById(id: string): Promise<Professional | undefined>;
  listProfessionals(input: CatalogListInput): Promise<PaginatedResult<Professional>>;
  updateProfessional(input: UpdateProfessionalInput): Promise<Professional>;
  setProfessionalStatus(id: string, status: ProfessionalStatus): Promise<Professional | undefined>;
  createService(input: CreateBarberServiceInput): Promise<BarberService>;
  getServiceById(id: string): Promise<BarberService | undefined>;
  listServices(input: CatalogListInput): Promise<PaginatedResult<BarberService>>;
  updateService(input: UpdateBarberServiceInput): Promise<BarberService>;
  setServiceStatus(id: string, status: ServiceStatus): Promise<BarberService | undefined>;
  ensureProfessionalExists(id: string): Promise<boolean>;
  ensureServiceExists(id: string): Promise<boolean>;
  upsertProfessionalService(professionalId: string, serviceId: string): Promise<void>;
  removeProfessionalService(professionalId: string, serviceId: string): Promise<void>;
  listServicesByProfessional(
    professionalId: string,
    input: CatalogListInput,
  ): Promise<PaginatedResult<BarberService>>;
}
