import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { authenticateRequest } from '../auth/authenticate-request.js';
import { requireAnyRole } from '../auth/require-any-role.js';
import type { AvailabilityModuleOptions } from './register-availability-module.js';
import {
  AvailabilityOverrideListSchema,
  AvailabilityOverrideResponseSchema,
  DateRangeQuerySchema,
  EmptySuccessSchema,
  OverrideBodySchema,
  OverrideParamsSchema,
  ProblemDetailsSchema,
  ProfessionalIdParamsSchema,
  ResolvedAvailabilityResponseSchema,
  WeeklyAvailabilityPutBodySchema,
  WeeklyAvailabilityResponseSchema,
} from './availability-schemas.js';

export const availabilityRoutes: FastifyPluginCallbackTypebox<AvailabilityModuleOptions> = (
  app,
  options,
  done,
) => {
  const readPolicy = [
    authenticateRequest(options.verifyAccessToken),
    requireAnyRole('admin', 'manager', 'barber', 'receptionist'),
  ];
  const writePolicy = [
    authenticateRequest(options.verifyAccessToken),
    requireAnyRole('admin', 'manager'),
  ];

  app.get(
    '/api/v1/professionals/:professionalId/availability/weekly',
    {
      schema: {
        tags: ['Availability'],
        operationId: 'getProfessionalWeeklyAvailability',
        summary: 'Returns the weekly availability configuration of one professional.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        response: {
          200: WeeklyAvailabilityResponseSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: readPolicy,
    },
    (request) => options.availabilityService.getWeeklyAvailability(request.params.professionalId),
  );

  app.put(
    '/api/v1/professionals/:professionalId/availability/weekly',
    {
      schema: {
        tags: ['Availability'],
        operationId: 'replaceProfessionalWeeklyAvailability',
        summary: 'Replaces the full weekly availability configuration of one professional.',
        description:
          'Allowed roles: admin, manager. Periods are local half-open intervals [start, end). End may be 24:00.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        body: WeeklyAvailabilityPutBodySchema,
        response: {
          200: WeeklyAvailabilityResponseSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    (request) =>
      options.availabilityService.replaceWeeklyAvailability(
        request.params.professionalId,
        request.body,
      ),
  );

  app.get(
    '/api/v1/professionals/:professionalId/availability/overrides',
    {
      schema: {
        tags: ['Availability'],
        operationId: 'listProfessionalAvailabilityOverrides',
        summary: 'Lists date overrides for one professional.',
        description:
          'Allowed roles: admin, manager, barber, receptionist. Range is inclusive and limited to 366 dates.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        querystring: DateRangeQuerySchema,
        response: {
          200: AvailabilityOverrideListSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: readPolicy,
    },
    (request) =>
      options.availabilityService.listOverrides(request.params.professionalId, request.query),
  );

  app.put(
    '/api/v1/professionals/:professionalId/availability/overrides/:date',
    {
      schema: {
        tags: ['Availability'],
        operationId: 'upsertProfessionalAvailabilityOverride',
        summary: 'Creates or replaces a date availability override for one professional.',
        description:
          'Allowed roles: admin, manager. closed removes all periods for the date; custom replaces the date with explicit local periods.',
        security: [{ bearerAuth: [] }],
        params: OverrideParamsSchema,
        body: OverrideBodySchema,
        response: {
          200: AvailabilityOverrideResponseSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    (request) => {
      if (request.body.mode === 'closed') {
        return options.availabilityService.upsertOverride(
          request.params.professionalId,
          request.params.date,
          { mode: 'closed' },
        );
      }

      return options.availabilityService.upsertOverride(
        request.params.professionalId,
        request.params.date,
        {
          mode: 'custom',
          periods: request.body.periods ?? [],
        },
      );
    },
  );

  app.delete(
    '/api/v1/professionals/:professionalId/availability/overrides/:date',
    {
      schema: {
        tags: ['Availability'],
        operationId: 'deleteProfessionalAvailabilityOverride',
        summary: 'Deletes a date availability override for one professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: OverrideParamsSchema,
        response: {
          204: EmptySuccessSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    async (request, reply) => {
      await options.availabilityService.deleteOverride(
        request.params.professionalId,
        request.params.date,
      );
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/api/v1/professionals/:professionalId/availability/resolved',
    {
      schema: {
        tags: ['Availability'],
        operationId: 'resolveProfessionalAvailability',
        summary: 'Resolves configured weekly availability plus overrides for a date range.',
        description:
          'Allowed roles: admin, manager, barber, receptionist. Range is inclusive and limited to 31 dates.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        querystring: DateRangeQuerySchema,
        response: {
          200: ResolvedAvailabilityResponseSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: readPolicy,
    },
    (request) =>
      options.availabilityService.resolveAvailability(request.params.professionalId, request.query),
  );

  done();
};
