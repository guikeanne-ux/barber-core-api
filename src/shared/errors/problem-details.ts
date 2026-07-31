import type { FastifyRequest } from 'fastify';

import { Type } from '@sinclair/typebox';

export const ProblemDetailsSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer(),
    detail: Type.String(),
    instance: Type.String(),
    code: Type.String(),
    requestId: Type.String({ format: 'uuid' }),
    errors: Type.Optional(
      Type.Array(
        Type.Object({
          field: Type.String(),
          message: Type.String(),
          code: Type.Optional(Type.String()),
        }),
      ),
    ),
  },
  {
    additionalProperties: false,
  },
);

export type ProblemDetails = typeof ProblemDetailsSchema.static;

export type ProblemFieldError = NonNullable<ProblemDetails['errors']>[number];

export function createProblemDetails(
  request: Pick<FastifyRequest, 'id' | 'url'>,
  input: {
    type: string;
    title: string;
    status: number;
    detail: string;
    code: string;
    errors?: ProblemFieldError[];
  },
): ProblemDetails {
  return {
    type: input.type,
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: request.url,
    code: input.code,
    requestId: request.id,
    ...(input.errors ? { errors: input.errors } : {}),
  };
}
