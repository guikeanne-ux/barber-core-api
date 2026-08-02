import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';

import { ProblemDetailsSchema } from '../../shared/errors/problem-details.js';

export const AppointmentDateSchema = Type.String({
  pattern: '^\\d{4}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])$',
});

export const AppointmentStartSchema = Type.String({
  pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
});

export const AppointmentEndSchema = Type.String({
  pattern: '^(?:(?:[01]\\d|2[0-3]):[0-5]\\d|24:00)$',
});

export const AppointmentStatusSchema = Type.Union([
  Type.Literal('scheduled'),
  Type.Literal('cancelled'),
]);

export const AppointmentListStatusSchema = Type.Union([
  Type.Literal('scheduled'),
  Type.Literal('cancelled'),
  Type.Literal('all'),
]);

export const AppointmentIdParamsSchema = Type.Object(
  {
    appointmentId: Type.String({ format: 'uuid' }),
  },
  {
    additionalProperties: false,
  },
);

export const CreateAppointmentBodySchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    serviceId: Type.String({ format: 'uuid' }),
    date: AppointmentDateSchema,
    start: AppointmentStartSchema,
    customerName: Type.String({ minLength: 2, maxLength: 120 }),
    customerPhone: Type.Optional(Type.String({ maxLength: 32 })),
    notes: Type.Optional(Type.String({ maxLength: 1000 })),
  },
  {
    additionalProperties: false,
    required: ['professionalId', 'serviceId', 'date', 'start', 'customerName'],
  },
);

export const CancelAppointmentBodySchema = Type.Object(
  {
    reason: Type.Optional(Type.String({ maxLength: 500 })),
  },
  {
    additionalProperties: false,
  },
);

export const AppointmentQuerySchema = Type.Object(
  {
    from: AppointmentDateSchema,
    to: AppointmentDateSchema,
    professionalId: Type.Optional(Type.String({ format: 'uuid' })),
    status: Type.Optional(AppointmentListStatusSchema),
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  {
    additionalProperties: false,
    required: ['from', 'to'],
  },
);

export const AppointmentSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    professionalId: Type.String({ format: 'uuid' }),
    professionalName: Type.String({ minLength: 2, maxLength: 120 }),
    serviceId: Type.String({ format: 'uuid' }),
    serviceName: Type.String({ minLength: 2, maxLength: 120 }),
    durationMinutes: Type.Integer({ minimum: 5, maximum: 480 }),
    priceCents: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
    currency: Type.Literal('BRL'),
    customerName: Type.String({ minLength: 2, maxLength: 120 }),
    customerPhone: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
    notes: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    date: AppointmentDateSchema,
    start: AppointmentStartSchema,
    end: AppointmentEndSchema,
    timeZone: Type.String({ minLength: 1 }),
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    status: AppointmentStatusSchema,
    cancelledAt: Type.Optional(Type.String({ format: 'date-time' })),
    cancellationReason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  {
    additionalProperties: false,
  },
);

export function createPaginatedResponseSchema<TItem extends TSchema>(itemSchema: TItem) {
  return Type.Object(
    {
      items: Type.Array(itemSchema),
      page: Type.Integer({ minimum: 1 }),
      pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
      totalItems: Type.Integer({ minimum: 0 }),
    },
    {
      additionalProperties: false,
    },
  );
}

export const AppointmentListResponseSchema = createPaginatedResponseSchema(AppointmentSchema);
export { ProblemDetailsSchema };
