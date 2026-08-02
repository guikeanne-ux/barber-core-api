import { sql, type Kysely } from 'kysely';

import type { DatabaseConnection } from '../../shared/database/database.js';
import type { CatalogDatabaseSchema } from '../catalog/catalog-types.js';
import { appointmentInternalError, appointmentTimeConflict } from './appointment-errors.js';
import type { AppointmentDatabase, AppointmentDatabaseSchema } from './appointment-types.js';
import type { AppointmentListQuery, AppointmentRepository } from './appointment-repository.js';

const APPOINTMENT_TIME_CONFLICT_CONSTRAINT = 'appointments_professional_scheduled_time_excl';

type AppointmentStorageDatabase = AppointmentDatabase &
  Kysely<CatalogDatabaseSchema & AppointmentDatabaseSchema>;

function parseCount(raw: unknown): number {
  const normalized =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'bigint'
        ? Number(raw)
        : typeof raw === 'string'
          ? Number.parseInt(raw, 10)
          : Number.NaN;

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error('Unable to parse count(*) result as a non-negative integer.');
  }

  return normalized;
}

export function mapAppointmentRepositoryError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown }).code === '23P01' &&
    (error as { constraint?: unknown }).constraint === APPOINTMENT_TIME_CONFLICT_CONSTRAINT
  ) {
    throw appointmentTimeConflict(error);
  }

  throw appointmentInternalError(undefined, error);
}

export function createPostgresAppointmentRepository(
  connection: DatabaseConnection,
): AppointmentRepository {
  const db = connection.db as unknown as AppointmentStorageDatabase;

  return {
    async create(input) {
      try {
        const inserted = await db
          .insertInto('appointments')
          .values({
            id: input.id,
            professional_id: input.professionalId,
            service_id: input.serviceId,
            professional_name: input.professionalName,
            service_name: input.serviceName,
            duration_minutes: input.durationMinutes,
            price_cents: input.priceCents,
            currency: input.currency,
            customer_name: input.customerName,
            customer_phone: input.customerPhone ?? null,
            notes: input.notes ?? null,
            time_zone: input.timeZone,
            starts_at: new Date(input.startsAt),
            ends_at: new Date(input.endsAt),
            status: 'scheduled',
            cancelled_at: null,
            cancellation_reason: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return inserted;
      } catch (error) {
        mapAppointmentRepositoryError(error);
      }
    },

    async findById(id) {
      return db.selectFrom('appointments').selectAll().where('id', '=', id).executeTakeFirst();
    },

    async list(input: AppointmentListQuery) {
      let query = db
        .selectFrom('appointments')
        .selectAll()
        .where('starts_at', '>=', new Date(input.rangeStart))
        .where('starts_at', '<', new Date(input.rangeEndExclusive));

      if (input.professionalId !== undefined) {
        query = query.where('professional_id', '=', input.professionalId);
      }

      if (input.status !== 'all') {
        query = query.where('status', '=', input.status);
      }

      const totalRow = await query
        .clearSelect()
        .clearLimit()
        .clearOffset()
        .clearOrderBy()
        .select(sql<string>`count(*)::text`.as('count'))
        .executeTakeFirstOrThrow();

      const items = await query
        .orderBy('starts_at', 'asc')
        .orderBy('id', 'asc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .execute();

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        totalItems: parseCount(totalRow.count),
      };
    },

    async cancel(input) {
      return db
        .updateTable('appointments')
        .set({
          status: 'cancelled',
          cancelled_at: sql<Date>`now()`,
          cancellation_reason: input.cancellationReason ?? null,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', input.id)
        .where('status', '=', 'scheduled')
        .returningAll()
        .executeTakeFirst();
    },
  };
}
