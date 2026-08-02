import type { ProblemFieldError } from '../../shared/errors/problem-details.js';

export type AppointmentProblemCode =
  | 'VALIDATION_ERROR'
  | 'PROFESSIONAL_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'APPOINTMENT_NOT_FOUND'
  | 'PROFESSIONAL_INACTIVE'
  | 'SERVICE_INACTIVE'
  | 'PROFESSIONAL_SERVICE_NOT_AVAILABLE'
  | 'APPOINTMENT_OUTSIDE_AVAILABILITY'
  | 'APPOINTMENT_TIME_CONFLICT'
  | 'INTERNAL_ERROR';

export class AppointmentProblem extends Error {
  readonly statusCode: 400 | 404 | 409 | 500;
  readonly type: string;
  readonly code: AppointmentProblemCode;
  readonly detail: string;
  readonly errors?: readonly ProblemFieldError[];

  constructor(input: {
    message: string;
    statusCode: 400 | 404 | 409 | 500;
    type: string;
    code: AppointmentProblemCode;
    detail: string;
    errors?: readonly ProblemFieldError[];
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = 'AppointmentProblem';
    this.statusCode = input.statusCode;
    this.type = input.type;
    this.code = input.code;
    this.detail = input.detail;
    if (input.errors !== undefined) {
      this.errors = input.errors;
    }
  }
}

export function appointmentValidationError(
  detail = 'One or more request fields are invalid.',
  errors?: readonly ProblemFieldError[],
): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Appointment validation failed.',
    statusCode: 400,
    type: 'https://barber-platform.dev/problems/validation-error',
    code: 'VALIDATION_ERROR',
    detail,
    ...(errors !== undefined ? { errors } : {}),
  });
}

export function appointmentProfessionalNotFound(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Professional not found.',
    statusCode: 404,
    type: 'https://barber-platform.dev/problems/professional-not-found',
    code: 'PROFESSIONAL_NOT_FOUND',
    detail: 'The requested professional was not found.',
  });
}

export function appointmentServiceNotFound(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Service not found.',
    statusCode: 404,
    type: 'https://barber-platform.dev/problems/service-not-found',
    code: 'SERVICE_NOT_FOUND',
    detail: 'The requested service was not found.',
  });
}

export function appointmentNotFound(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Appointment not found.',
    statusCode: 404,
    type: 'https://barber-platform.dev/problems/appointment-not-found',
    code: 'APPOINTMENT_NOT_FOUND',
    detail: 'The requested appointment was not found.',
  });
}

export function professionalInactive(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Professional inactive.',
    statusCode: 409,
    type: 'https://barber-platform.dev/problems/professional-inactive',
    code: 'PROFESSIONAL_INACTIVE',
    detail: 'The selected professional is inactive.',
  });
}

export function serviceInactive(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Service inactive.',
    statusCode: 409,
    type: 'https://barber-platform.dev/problems/service-inactive',
    code: 'SERVICE_INACTIVE',
    detail: 'The selected service is inactive.',
  });
}

export function professionalServiceNotAvailable(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Professional service capability missing.',
    statusCode: 409,
    type: 'https://barber-platform.dev/problems/professional-service-not-available',
    code: 'PROFESSIONAL_SERVICE_NOT_AVAILABLE',
    detail: 'The selected professional cannot perform the selected service.',
  });
}

export function appointmentOutsideAvailability(): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Appointment outside availability.',
    statusCode: 409,
    type: 'https://barber-platform.dev/problems/appointment-outside-availability',
    code: 'APPOINTMENT_OUTSIDE_AVAILABILITY',
    detail: 'The requested appointment interval is outside the resolved availability.',
  });
}

export function appointmentTimeConflict(cause?: unknown): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Appointment time conflict.',
    statusCode: 409,
    type: 'https://barber-platform.dev/problems/appointment-time-conflict',
    code: 'APPOINTMENT_TIME_CONFLICT',
    detail: 'The requested appointment interval conflicts with another scheduled appointment.',
    ...(cause !== undefined ? { cause } : {}),
  });
}

export function appointmentInternalError(
  detail = 'The request could not be completed.',
  cause?: unknown,
): AppointmentProblem {
  return new AppointmentProblem({
    message: 'Appointment internal error.',
    statusCode: 500,
    type: 'https://barber-platform.dev/problems/internal-error',
    code: 'INTERNAL_ERROR',
    detail,
    ...(cause !== undefined ? { cause } : {}),
  });
}
