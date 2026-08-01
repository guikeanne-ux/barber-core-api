import type { ProblemFieldError } from '../../shared/errors/problem-details.js';

export class AvailabilityProblem extends Error {
  readonly statusCode: 400 | 404;
  readonly type: string;
  readonly code: 'VALIDATION_ERROR' | 'PROFESSIONAL_NOT_FOUND';
  readonly detail: string;
  readonly errors?: readonly ProblemFieldError[];

  constructor(input: {
    message: string;
    statusCode: 400 | 404;
    type: string;
    code: 'VALIDATION_ERROR' | 'PROFESSIONAL_NOT_FOUND';
    detail: string;
    errors?: readonly ProblemFieldError[];
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = 'AvailabilityProblem';
    this.statusCode = input.statusCode;
    this.type = input.type;
    this.code = input.code;
    this.detail = input.detail;
    if (input.errors !== undefined) {
      this.errors = input.errors;
    }
  }
}

export function availabilityValidationError(
  detail = 'One or more request fields are invalid.',
  errors?: readonly ProblemFieldError[],
): AvailabilityProblem {
  return new AvailabilityProblem({
    message: 'Availability validation failed.',
    statusCode: 400,
    type: 'https://barber-platform.dev/problems/validation-error',
    code: 'VALIDATION_ERROR',
    detail,
    ...(errors !== undefined ? { errors } : {}),
  });
}

export function availabilityProfessionalNotFound(): AvailabilityProblem {
  return new AvailabilityProblem({
    message: 'Professional not found.',
    statusCode: 404,
    type: 'https://barber-platform.dev/problems/professional-not-found',
    code: 'PROFESSIONAL_NOT_FOUND',
    detail: 'The requested professional was not found.',
  });
}
