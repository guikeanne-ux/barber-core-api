import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { ProblemDetailsSchema } from '../../shared/errors/problem-details.js';
import { authenticateRequest } from '../auth/authenticate-request.js';
import { requireAnyRole } from '../auth/require-any-role.js';
import type { CatalogModuleOptions } from './register-catalog-module.js';
import {
  BarberServiceSchema,
  CreateServiceBodySchema,
  PaginationQuerySchema,
  ProfessionalIdParamsSchema,
  ServiceIdParamsSchema,
  UpdateServiceBodySchema,
  createPaginatedResponseSchema,
} from './catalog-schemas.js';
import {
  normalizeCatalogListQuery,
  normalizeCreateServiceBody,
  normalizeUpdateServiceBody,
} from './catalog-http-normalization.js';

const ServiceListSchema = createPaginatedResponseSchema(BarberServiceSchema);

export const serviceRoutes: FastifyPluginCallbackTypebox<CatalogModuleOptions> = (
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
    '/api/v1/services',
    {
      schema: {
        tags: ['Services'],
        operationId: 'createService',
        summary: 'Creates a service.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        body: CreateServiceBodySchema,
        response: {
          201: BarberServiceSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, done) => {
        normalizeCreateServiceBody(request.body);
        done();
      },
      preHandler: writePolicy,
    },
    async (request, reply) => {
      const service = await options.catalogService.createService(request.body);
      return reply.code(201).header('Location', `/api/v1/services/${service.id}`).send(service);
    },
  );

  app.get(
    '/api/v1/services',
    {
      schema: {
        tags: ['Services'],
        operationId: 'listServices',
        summary: 'Lists services.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        querystring: PaginationQuerySchema,
        response: {
          200: ServiceListSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, done) => {
        normalizeCatalogListQuery(request.query);
        done();
      },
      preHandler: readPolicy,
    },
    (request) => options.catalogService.listServices(request.query),
  );

  app.get(
    '/api/v1/services/:serviceId',
    {
      schema: {
        tags: ['Services'],
        operationId: 'getServiceById',
        summary: 'Returns one service by ID.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        params: ServiceIdParamsSchema,
        response: {
          200: BarberServiceSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: readPolicy,
    },
    (request) => options.catalogService.getServiceById(request.params.serviceId),
  );

  app.patch(
    '/api/v1/services/:serviceId',
    {
      schema: {
        tags: ['Services'],
        operationId: 'updateService',
        summary: 'Updates one service.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ServiceIdParamsSchema,
        body: UpdateServiceBodySchema,
        response: {
          200: BarberServiceSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, done) => {
        normalizeUpdateServiceBody(request.body);
        done();
      },
      preHandler: writePolicy,
    },
    (request) => options.catalogService.updateService(request.params.serviceId, request.body),
  );

  app.post(
    '/api/v1/services/:serviceId/activate',
    {
      schema: {
        tags: ['Services'],
        operationId: 'activateService',
        summary: 'Activates one service.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ServiceIdParamsSchema,
        response: {
          200: BarberServiceSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    (request) => options.catalogService.activateService(request.params.serviceId),
  );

  app.post(
    '/api/v1/services/:serviceId/deactivate',
    {
      schema: {
        tags: ['Services'],
        operationId: 'deactivateService',
        summary: 'Deactivates one service.',
        description: 'Allowed roles: admin, manager.',
        security: [{ bearerAuth: [] }],
        params: ServiceIdParamsSchema,
        response: {
          200: BarberServiceSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: writePolicy,
    },
    (request) => options.catalogService.deactivateService(request.params.serviceId),
  );

  app.get(
    '/api/v1/professionals/:professionalId/services',
    {
      schema: {
        tags: ['Services'],
        operationId: 'listServicesByProfessional',
        summary: 'Lists the services that a professional can execute.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        params: ProfessionalIdParamsSchema,
        querystring: PaginationQuerySchema,
        response: {
          200: ServiceListSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, done) => {
        normalizeCatalogListQuery(request.query);
        done();
      },
      preHandler: readPolicy,
    },
    (request) =>
      options.catalogService.listServicesByProfessional(
        request.params.professionalId,
        request.query,
      ),
  );

  done();
};
