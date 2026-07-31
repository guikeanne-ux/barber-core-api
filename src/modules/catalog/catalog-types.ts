import type { Generated, Kysely, Selectable } from 'kysely';

export const PROFESSIONAL_STATUSES = ['active', 'inactive'] as const;
export const SERVICE_STATUSES = ['active', 'inactive'] as const;
export const LIST_STATUSES = ['active', 'inactive', 'all'] as const;

export type ProfessionalStatus = (typeof PROFESSIONAL_STATUSES)[number];
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export type ListStatus = (typeof LIST_STATUSES)[number];

export interface Professional {
  readonly id: string;
  readonly name: string;
  readonly bio?: string;
  readonly status: ProfessionalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BarberService {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly currency: 'BRL';
  readonly status: ServiceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaginatedResult<TItem> {
  readonly items: TItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

export interface CatalogListInput {
  readonly page: number;
  readonly pageSize: number;
  readonly status: ListStatus;
  readonly q?: string;
}

export interface CreateProfessionalInput {
  readonly id: string;
  readonly name: string;
  readonly bio?: string;
}

export interface UpdateProfessionalInput {
  readonly id: string;
  readonly name: string;
  readonly bio?: string | null;
}

export interface CreateBarberServiceInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
}

export interface UpdateBarberServiceInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly durationMinutes: number;
  readonly priceCents: number;
}

export interface ProfessionalsTable {
  readonly id: string;
  readonly name: string;
  readonly bio: string | null;
  readonly status: ProfessionalStatus;
  readonly created_at: Generated<Date>;
  readonly updated_at: Generated<Date>;
}

export interface ServicesTable {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly duration_minutes: number;
  readonly price_cents: number;
  readonly status: ServiceStatus;
  readonly created_at: Generated<Date>;
  readonly updated_at: Generated<Date>;
}

export interface ProfessionalServicesTable {
  readonly professional_id: string;
  readonly service_id: string;
  readonly created_at: Generated<Date>;
}

export interface CatalogDatabaseSchema {
  readonly professionals: ProfessionalsTable;
  readonly services: ServicesTable;
  readonly professional_services: ProfessionalServicesTable;
}

export type CatalogDatabase = Kysely<CatalogDatabaseSchema>;
export type ProfessionalRow = Selectable<ProfessionalsTable>;
export type ServiceRow = Selectable<ServicesTable>;
