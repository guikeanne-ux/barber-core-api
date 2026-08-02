import type {
  AppointmentListStatus,
  AppointmentRow,
  PaginatedResult,
} from './appointment-types.js';

export interface CreateAppointmentRecord {
  readonly id: string;
  readonly professionalId: string;
  readonly serviceId: string;
  readonly professionalName: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly currency: 'BRL';
  readonly customerName: string;
  readonly customerPhone?: string;
  readonly notes?: string;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface AppointmentListQuery {
  readonly rangeStart: string;
  readonly rangeEndExclusive: string;
  readonly status: AppointmentListStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly professionalId?: string;
}

export interface AppointmentRepository {
  create(input: CreateAppointmentRecord): Promise<AppointmentRow>;
  findById(id: string): Promise<AppointmentRow | undefined>;
  list(input: AppointmentListQuery): Promise<PaginatedResult<AppointmentRow>>;
  cancel(input: { id: string; cancellationReason?: string }): Promise<AppointmentRow | undefined>;
}
