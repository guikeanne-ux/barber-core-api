import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';

import { ProblemDetailsSchema } from '../../shared/errors/problem-details.js';
import { authenticateRequest } from '../auth/authenticate-request.js';
import { requireAnyRole } from '../auth/require-any-role.js';
import type { CatalogModuleOptions } from './register-catalog-module.js';
import {
  CreateProfessionalBodySchema,
  PaginationQuerySchema,
  ProfessionalIdParamsSchema,
  ProfessionalSchema,
  ProfessionalServiceCapabilityParamsSchema,
  UpdateProfessionalBodySchema,
  createPaginatedResponseSchema,
} from './catalog-schemas.js';
import { coerceCatalogListQuery } from './coerce-catalog-list-query.js';

const EmptySuccessSchema = Type.Null({});
const ProfessionalListSchema = createPaginatedResponseSchema(ProfessionalSchema);

export const professionalRoutes: FastifyPluginCallbackTypebox<CatalogModuleOptions> = (
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

  app.post(
    '/api/v1/professionals',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'createProfessional',
        summary: 'Creates a professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        body: CreateProfessionalBodySchema,
        response: {
          201: ProfessionalSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    async (request, reply) => {
      const professional = await options.catalogService.createProfessional(request.body);
      return reply
        .code(201)
        .header('Location', `/api/v1/professionals/${professional.id}`)
        .send(professional);
    },
  );

  app.get(
    '/api/v1/professionals',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'listProfessionals',
        summary: 'Lists professionals.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        querystring: PaginationQuerySchema,
        response: {
          200: ProfessionalListSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, done) => {
        coerceCatalogListQuery(request.query);
        done();
      },
      preHandler: readPolicy,
    },
    (request) => options.catalogService.listProfessionals(request.query),
  );

  app.get(
    '/api/v1/professionals/:professionalId',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'getProfessionalById',
        summary: 'Returns one professional by ID.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        response: {
          200: ProfessionalSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: readPolicy,
    },
    (request) => options.catalogService.getProfessionalById(request.params.professionalId),
  );

  app.patch(
    '/api/v1/professionals/:professionalId',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'updateProfessional',
        summary: 'Updates one professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        body: UpdateProfessionalBodySchema,
        response: {
          200: ProfessionalSchema,
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
      options.catalogService.updateProfessional(request.params.professionalId, request.body),
  );

  app.post(
    '/api/v1/professionals/:professionalId/activate',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'activateProfessional',
        summary: 'Activates one professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        response: {
          200: ProfessionalSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    (request) => options.catalogService.activateProfessional(request.params.professionalId),
  );

  app.post(
    '/api/v1/professionals/:professionalId/deactivate',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'deactivateProfessional',
        summary: 'Deactivates one professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        response: {
          200: ProfessionalSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    (request) => options.catalogService.deactivateProfessional(request.params.professionalId),
  );

  app.put(
    '/api/v1/professionals/:professionalId/services/:serviceId',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'addServiceToProfessional',
        summary: 'Associates a service with a professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalServiceCapabilityParamsSchema,
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
      await options.catalogService.addServiceToProfessional(
        request.params.professionalId,
        request.params.serviceId,
      );
      return reply.code(204).send(null);
    },
  );

  app.delete(
    '/api/v1/professionals/:professionalId/services/:serviceId',
    {
      schema: {
        tags: ['Professionals'],
        operationId: 'removeServiceFromProfessional',
        summary: 'Removes the service capability from a professional.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalServiceCapabilityParamsSchema,
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
      await options.catalogService.removeServiceFromProfessional(
        request.params.professionalId,
        request.params.serviceId,
      );
      return reply.code(204).send(null);
    },
  );

  done();
};
