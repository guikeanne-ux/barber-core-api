import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import type { VerifyAccessToken } from '../auth/verify-access-token.js';
import type { AppointmentService } from './appointment-service.js';
import { appointmentRoutes } from './appointment-routes.js';

export interface AppointmentModuleOptions {
  readonly verifyAccessToken: VerifyAccessToken;
  readonly appointmentService: AppointmentService;
}

export const registerAppointmentsModule: FastifyPluginCallbackTypebox<AppointmentModuleOptions> = (
  app,
  options,
  done,
) => {
  app.register(appointmentRoutes, options);
  done();
};
