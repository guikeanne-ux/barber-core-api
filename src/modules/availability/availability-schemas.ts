import { Type } from '@sinclair/typebox';

import { ProblemDetailsSchema } from '../../shared/errors/problem-details.js';

export const TimeStringSchema = Type.String({
  pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
});

export const TimeEndStringSchema = Type.String({
  pattern: '^(?:(?:[01]\\d|2[0-3]):[0-5]\\d|24:00)$',
});

export const LocalDateSchema = Type.String({
  pattern: '^\\d{4}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])$',
});

export const AvailabilityPeriodSchema = Type.Object(
  {
    start: TimeStringSchema,
    end: TimeEndStringSchema,
  },
  {
    additionalProperties: false,
  },
);

export const WeeklyAvailabilityWeekSchema = Type.Object(
  {
    monday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
    tuesday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
    wednesday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
    thursday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
    friday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
    saturday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
    sunday: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
  },
  {
    additionalProperties: false,
  },
);

export const WeeklyAvailabilityResponseSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    timeZone: Type.String({ minLength: 1 }),
    week: WeeklyAvailabilityWeekSchema,
    updatedAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  {
    additionalProperties: false,
  },
);

export const WeeklyAvailabilityPutBodySchema = Type.Object(
  {
    week: WeeklyAvailabilityWeekSchema,
  },
  {
    additionalProperties: false,
  },
);

export const ProfessionalIdParamsSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
  },
  {
    additionalProperties: false,
  },
);

export const OverrideParamsSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    date: LocalDateSchema,
  },
  {
    additionalProperties: false,
  },
);

export const DateRangeQuerySchema = Type.Object(
  {
    from: LocalDateSchema,
    to: LocalDateSchema,
  },
  {
    additionalProperties: false,
    required: ['from', 'to'],
  },
);

export const ClosedOverrideBodySchema = Type.Object(
  {
    mode: Type.Literal('closed'),
  },
  {
    additionalProperties: false,
  },
);

export const CustomOverrideBodySchema = Type.Object(
  {
    mode: Type.Literal('custom'),
    periods: Type.Array(AvailabilityPeriodSchema, {
      minItems: 1,
      maxItems: 8,
    }),
  },
  {
    additionalProperties: false,
  },
);

export const OverrideBodySchema = Type.Object(
  {
    mode: Type.Union([Type.Literal('closed'), Type.Literal('custom')]),
    periods: Type.Optional(
      Type.Array(AvailabilityPeriodSchema, {
        minItems: 1,
        maxItems: 8,
      }),
    ),
  },
  {
    additionalProperties: false,
  },
);

export const ClosedOverrideResponseSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    date: LocalDateSchema,
    mode: Type.Literal('closed'),
    periods: Type.Array(AvailabilityPeriodSchema, { maxItems: 0 }),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  {
    additionalProperties: false,
  },
);

export const CustomOverrideResponseSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    date: LocalDateSchema,
    mode: Type.Literal('custom'),
    periods: Type.Array(AvailabilityPeriodSchema, { minItems: 1, maxItems: 8 }),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  {
    additionalProperties: false,
  },
);

export const AvailabilityOverrideResponseSchema = Type.Union([
  ClosedOverrideResponseSchema,
  CustomOverrideResponseSchema,
]);

export const AvailabilityOverrideListSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    timeZone: Type.String({ minLength: 1 }),
    from: LocalDateSchema,
    to: LocalDateSchema,
    items: Type.Array(AvailabilityOverrideResponseSchema),
  },
  {
    additionalProperties: false,
  },
);

export const ResolvedWeeklyDaySchema = Type.Object(
  {
    date: LocalDateSchema,
    weekday: Type.Union([
      Type.Literal('monday'),
      Type.Literal('tuesday'),
      Type.Literal('wednesday'),
      Type.Literal('thursday'),
      Type.Literal('friday'),
      Type.Literal('saturday'),
      Type.Literal('sunday'),
    ]),
    source: Type.Literal('weekly'),
    periods: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
  },
  {
    additionalProperties: false,
  },
);

export const ResolvedOverrideDaySchema = Type.Object(
  {
    date: LocalDateSchema,
    weekday: Type.Union([
      Type.Literal('monday'),
      Type.Literal('tuesday'),
      Type.Literal('wednesday'),
      Type.Literal('thursday'),
      Type.Literal('friday'),
      Type.Literal('saturday'),
      Type.Literal('sunday'),
    ]),
    source: Type.Literal('override'),
    overrideMode: Type.Union([Type.Literal('closed'), Type.Literal('custom')]),
    periods: Type.Array(AvailabilityPeriodSchema, { maxItems: 8 }),
  },
  {
    additionalProperties: false,
  },
);

export const ResolvedAvailabilityResponseSchema = Type.Object(
  {
    professionalId: Type.String({ format: 'uuid' }),
    timeZone: Type.String({ minLength: 1 }),
    from: LocalDateSchema,
    to: LocalDateSchema,
    days: Type.Array(Type.Union([ResolvedWeeklyDaySchema, ResolvedOverrideDaySchema])),
  },
  {
    additionalProperties: false,
  },
);

export const EmptySuccessSchema = Type.Null({});
export { ProblemDetailsSchema };
