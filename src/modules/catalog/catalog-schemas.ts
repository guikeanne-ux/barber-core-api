import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';

const UuidParamSchema = Type.String({ format: 'uuid' });

export const ProfessionalStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('inactive'),
]);

export const ServiceStatusSchema = Type.Union([Type.Literal('active'), Type.Literal('inactive')]);

export const ListStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('inactive'),
  Type.Literal('all'),
]);

export const PaginationQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    status: Type.Optional(ListStatusSchema),
    q: Type.Optional(Type.String({ maxLength: 100 })),
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

export const ProfessionalSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    name: Type.String({ minLength: 2, maxLength: 120 }),
    bio: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    status: ProfessionalStatusSchema,
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  {
    additionalProperties: false,
  },
);

export const BarberServiceSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    name: Type.String({ minLength: 2, maxLength: 120 }),
    description: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    durationMinutes: Type.Integer({ minimum: 5, maximum: 480 }),
    priceCents: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
    currency: Type.Literal('BRL'),
    status: ServiceStatusSchema,
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  {
    additionalProperties: false,
  },
);

export const ProfessionalIdParamsSchema = Type.Object(
  {
    professionalId: UuidParamSchema,
  },
  {
    additionalProperties: false,
  },
);

export const ServiceIdParamsSchema = Type.Object(
  {
    serviceId: UuidParamSchema,
  },
  {
    additionalProperties: false,
  },
);

export const ProfessionalServiceCapabilityParamsSchema = Type.Object(
  {
    professionalId: UuidParamSchema,
    serviceId: UuidParamSchema,
  },
  {
    additionalProperties: false,
  },
);

export const CreateProfessionalBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 120 }),
    bio: Type.Optional(Type.String({ maxLength: 1000 })),
  },
  {
    additionalProperties: false,
    required: ['name'],
  },
);

export const UpdateProfessionalBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
    bio: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  },
  {
    additionalProperties: false,
    minProperties: 1,
  },
);

export const CreateServiceBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 120 }),
    description: Type.Optional(Type.String({ maxLength: 1000 })),
    durationMinutes: Type.Integer({ minimum: 5, maximum: 480 }),
    priceCents: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
  },
  {
    additionalProperties: false,
    required: ['name', 'durationMinutes', 'priceCents'],
  },
);

export const UpdateServiceBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
    description: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
    durationMinutes: Type.Optional(Type.Integer({ minimum: 5, maximum: 480 })),
    priceCents: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000_000 })),
  },
  {
    additionalProperties: false,
    minProperties: 1,
  },
);
