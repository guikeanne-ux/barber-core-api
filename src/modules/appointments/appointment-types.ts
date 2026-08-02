import type { Generated, Kysely, Selectable } from 'kysely';

export type AppointmentStatus = 'scheduled' | 'cancelled';
export type AppointmentListStatus = AppointmentStatus | 'all';

export interface Appointment {
  readonly id: string;
  readonly professionalId: string;
  readonly professionalName: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly currency: 'BRL';
  readonly customerName: string;
  readonly customerPhone?: string;
  readonly notes?: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: AppointmentStatus;
  readonly cancelledAt?: string;
  readonly cancellationReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PaginatedResult<TItem> {
  readonly items: TItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

export interface AppointmentListInput {
  readonly from: string;
  readonly to: string;
  readonly page: number;
  readonly pageSize: number;
  readonly status: AppointmentListStatus;
  readonly professionalId?: string;
}

export interface AppointmentCatalogReference {
  readonly professional?: {
    readonly id: string;
    readonly name: string;
    readonly status: 'active' | 'inactive';
  };
  readonly service?: {
    readonly id: string;
    readonly name: string;
    readonly status: 'active' | 'inactive';
    readonly durationMinutes: number;
    readonly priceCents: number;
    readonly currency: 'BRL';
  };
  readonly professionalCanPerformService: boolean;
}

export type FindAppointmentCatalogReference = (
  professionalId: string,
  serviceId: string,
) => Promise<AppointmentCatalogReference>;

export interface ResolvedAvailabilityForAppointment {
  readonly professionalId: string;
  readonly date: string;
  readonly timeZone: string;
  readonly periods: {
    readonly start: string;
    readonly end: string;
  }[];
}

export type ResolveAvailabilityForAppointment = (
  professionalId: string,
  date: string,
) => Promise<ResolvedAvailabilityForAppointment>;

export interface AppointmentsTable {
  readonly id: string;
  readonly professional_id: string;
  readonly service_id: string;
  readonly professional_name: string;
  readonly service_name: string;
  readonly duration_minutes: number;
  readonly price_cents: number;
  readonly currency: 'BRL';
  readonly customer_name: string;
  readonly customer_phone: string | null;
  readonly notes: string | null;
  readonly time_zone: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly status: AppointmentStatus;
  readonly cancelled_at: Date | null;
  readonly cancellation_reason: string | null;
  readonly created_at: Generated<Date>;
  readonly updated_at: Generated<Date>;
}

export interface AppointmentDatabaseSchema {
  readonly appointments: AppointmentsTable;
}

export type AppointmentDatabase = Kysely<AppointmentDatabaseSchema>;
export type AppointmentRow = Selectable<AppointmentsTable>;
