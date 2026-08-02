import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { authenticateRequest } from '../auth/authenticate-request.js';
import { requireAnyRole } from '../auth/require-any-role.js';
import type { AppointmentModuleOptions } from './register-appointments-module.js';
import {
  AppointmentIdParamsSchema,
  AppointmentListResponseSchema,
  AppointmentQuerySchema,
  AppointmentSchema,
  CancelAppointmentBodySchema,
  CreateAppointmentBodySchema,
  ProblemDetailsSchema,
} from './appointment-schemas.js';
import {
  normalizeCancelAppointmentBody,
  normalizeCreateAppointmentBody,
  normalizeAppointmentListQuery,
} from './appointment-http-normalization.js';

export const appointmentRoutes: FastifyPluginCallbackTypebox<AppointmentModuleOptions> = (
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
    requireAnyRole('admin', 'manager', 'receptionist'),
  ];

  app.post(
    '/api/v1/appointments',
    {
      schema: {
        tags: ['Appointments'],
        operationId: 'createAppointment',
        summary: 'Creates an appointment.',
        description: 'Allowed roles: admin, manager, receptionist.',
        security: [{ bearerAuth: [] }],
        body: CreateAppointmentBodySchema,
        response: {
          201: AppointmentSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
          500: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, callback) => {
        normalizeCreateAppointmentBody(request.body);
        callback();
      },
      preHandler: writePolicy,
    },
    async (request, reply) => {
      const appointment = await options.appointmentService.createAppointment(request.body);
      return reply
        .code(201)
        .header('Location', `/api/v1/appointments/${appointment.id}`)
        .send(appointment);
    },
  );

  app.get(
    '/api/v1/appointments',
    {
      schema: {
        tags: ['Appointments'],
        operationId: 'listAppointments',
        summary: 'Lists appointments.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        querystring: AppointmentQuerySchema,
        response: {
          200: AppointmentListResponseSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, callback) => {
        normalizeAppointmentListQuery(request.query);
        callback();
      },
      preHandler: readPolicy,
    },
    (request) =>
      options.appointmentService.listAppointments({
        from: request.query.from,
        to: request.query.to,
        page: request.query.page ?? 1,
        pageSize: request.query.pageSize ?? 20,
        status: request.query.status ?? 'scheduled',
        ...(request.query.professionalId !== undefined
          ? { professionalId: request.query.professionalId }
          : {}),
      }),
  );

  app.get(
    '/api/v1/appointments/:appointmentId',
    {
      schema: {
        tags: ['Appointments'],
        operationId: 'getAppointmentById',
        summary: 'Returns one appointment by ID.',
        description: 'Allowed roles: admin, manager, barber, receptionist.',
        security: [{ bearerAuth: [] }],
        params: AppointmentIdParamsSchema,
        response: {
          200: AppointmentSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preHandler: readPolicy,
    },
    (request) => options.appointmentService.getAppointmentById(request.params.appointmentId),
  );

  app.post(
    '/api/v1/appointments/:appointmentId/cancel',
    {
      schema: {
        tags: ['Appointments'],
        operationId: 'cancelAppointment',
        summary: 'Cancels one appointment.',
        description: 'Allowed roles: admin, manager, receptionist.',
        security: [{ bearerAuth: [] }],
        params: AppointmentIdParamsSchema,
        body: CancelAppointmentBodySchema,
        response: {
          200: AppointmentSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
        },
      },
      preValidation: (request, _reply, callback) => {
        normalizeCancelAppointmentBody(request.body);
        callback();
      },
      preHandler: writePolicy,
    },
    (request) =>
      options.appointmentService.cancelAppointment(request.params.appointmentId, request.body),
  );

  done();
};
