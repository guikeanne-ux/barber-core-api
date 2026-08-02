import { randomUUID } from 'node:crypto';

import {
  appointmentNotFound,
  appointmentOutsideAvailability,
  appointmentProfessionalNotFound,
  appointmentServiceNotFound,
  appointmentValidationError,
  professionalInactive,
  professionalServiceNotAvailable,
  serviceInactive,
} from './appointment-errors.js';
import {
  buildAppointmentInstants,
  buildListingRange,
  isAppointmentCoveredByAvailability,
  renderAppointmentLocalTime,
} from './appointment-time.js';
import type { AppointmentRepository } from './appointment-repository.js';
import type {
  Appointment,
  AppointmentCatalogReference,
  AppointmentListInput,
  AppointmentRow,
  FindAppointmentCatalogReference,
  PaginatedResult,
  ResolveAvailabilityForAppointment,
} from './appointment-types.js';

export interface AppointmentService {
  createAppointment(input: {
    professionalId: string;
    serviceId: string;
    date: string;
    start: string;
    customerName: string;
    customerPhone?: string;
    notes?: string;
  }): Promise<Appointment>;
  getAppointmentById(id: string): Promise<Appointment>;
  listAppointments(input: AppointmentListInput): Promise<PaginatedResult<Appointment>>;
  cancelAppointment(id: string, input: { reason?: string }): Promise<Appointment>;
}

function createFieldError(field: string, message: string, code = 'invalid') {
  return { field, message, code };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredName(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(field, 'Value must contain between 2 and 120 characters after trim.'),
    ]);
  }

  return trimmed;
}

function normalizeOptionalBoundedText(
  value: string | undefined,
  field: string,
  maximum: number,
): string | undefined {
  const normalized = normalizeOptionalText(value);
  if (normalized !== undefined && normalized.length > maximum) {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(
        field,
        `Value must contain at most ${String(maximum)} characters after trim.`,
      ),
    ]);
  }

  return normalized;
}

function assertCatalogReference(reference: AppointmentCatalogReference): {
  professional: NonNullable<AppointmentCatalogReference['professional']>;
  service: NonNullable<AppointmentCatalogReference['service']>;
} {
  if (!reference.professional) {
    throw appointmentProfessionalNotFound();
  }

  if (!reference.service) {
    throw appointmentServiceNotFound();
  }

  if (reference.professional.status !== 'active') {
    throw professionalInactive();
  }

  if (reference.service.status !== 'active') {
    throw serviceInactive();
  }

  if (!reference.professionalCanPerformService) {
    throw professionalServiceNotAvailable();
  }

  return {
    professional: reference.professional,
    service: reference.service,
  };
}

function mapAppointment(row: AppointmentRow): Appointment {
  const startsAt = row.starts_at.toISOString();
  const endsAt = row.ends_at.toISOString();
  const rendered = renderAppointmentLocalTime({
    startsAt,
    endsAt,
    timeZone: row.time_zone,
  });

  return {
    id: row.id,
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    currency: row.currency,
    customerName: row.customer_name,
    ...(row.customer_phone !== null ? { customerPhone: row.customer_phone } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    date: rendered.date,
    start: rendered.start,
    end: rendered.end,
    timeZone: row.time_zone,
    startsAt,
    endsAt,
    status: row.status,
    ...(row.cancelled_at !== null ? { cancelledAt: row.cancelled_at.toISOString() } : {}),
    ...(row.cancellation_reason !== null ? { cancellationReason: row.cancellation_reason } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createAppointmentService(input: {
  repository: AppointmentRepository;
  findAppointmentCatalogReference: FindAppointmentCatalogReference;
  resolveAvailabilityForAppointment: ResolveAvailabilityForAppointment;
  businessTimeZone: string;
}): AppointmentService {
  return {
    async createAppointment(payload) {
      const customerName = normalizeRequiredName(payload.customerName, '/customerName');
      const customerPhone = normalizeOptionalBoundedText(
        payload.customerPhone,
        '/customerPhone',
        32,
      );
      const notes = normalizeOptionalBoundedText(payload.notes, '/notes', 1000);

      const reference = assertCatalogReference(
        await input.findAppointmentCatalogReference(payload.professionalId, payload.serviceId),
      );

      const resolvedAvailability = await input.resolveAvailabilityForAppointment(
        payload.professionalId,
        payload.date,
      );

      if (resolvedAvailability.timeZone !== input.businessTimeZone) {
        throw new Error(
          'Resolved availability time zone does not match the configured business time zone.',
        );
      }

      const instants = buildAppointmentInstants({
        date: payload.date,
        start: payload.start,
        timeZone: input.businessTimeZone,
        durationMinutes: reference.service.durationMinutes,
      });

      if (
        instants.endMinute < 0 ||
        !isAppointmentCoveredByAvailability({
          startMinute: instants.startMinute,
          endMinute: instants.endMinute,
          periods: resolvedAvailability.periods,
        })
      ) {
        throw appointmentOutsideAvailability();
      }

      const created = await input.repository.create({
        id: randomUUID(),
        professionalId: reference.professional.id,
        serviceId: reference.service.id,
        professionalName: reference.professional.name,
        serviceName: reference.service.name,
        durationMinutes: reference.service.durationMinutes,
        priceCents: reference.service.priceCents,
        currency: reference.service.currency,
        customerName,
        ...(customerPhone !== undefined ? { customerPhone } : {}),
        ...(notes !== undefined ? { notes } : {}),
        timeZone: input.businessTimeZone,
        startsAt: instants.startsAt.toString(),
        endsAt: instants.endsAt.toString(),
      });

      return mapAppointment(created);
    },

    async getAppointmentById(id) {
      const appointment = await input.repository.findById(id);
      if (!appointment) {
        throw appointmentNotFound();
      }

      return mapAppointment(appointment);
    },

    async listAppointments(query) {
      const range = buildListingRange({
        from: query.from,
        to: query.to,
        timeZone: input.businessTimeZone,
      });

      const listed = await input.repository.list({
        rangeStart: range.rangeStart.toString(),
        rangeEndExclusive: range.rangeEndExclusive.toString(),
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        ...(query.professionalId !== undefined ? { professionalId: query.professionalId } : {}),
      });

      return {
        items: listed.items.map(mapAppointment),
        page: listed.page,
        pageSize: listed.pageSize,
        totalItems: listed.totalItems,
      };
    },

    async cancelAppointment(id, payload) {
      const reason = normalizeOptionalBoundedText(payload.reason, '/reason', 500);
      const cancelled = await input.repository.cancel({
        id,
        ...(reason !== undefined ? { cancellationReason: reason } : {}),
      });

      if (cancelled) {
        return mapAppointment(cancelled);
      }

      const current = await input.repository.findById(id);
      if (!current) {
        throw appointmentNotFound();
      }

      return mapAppointment(current);
    },
  };
}
