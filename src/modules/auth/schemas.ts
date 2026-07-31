import { Type } from '@sinclair/typebox';

export const BarberRoleSchema = Type.Union([
  Type.Literal('admin'),
  Type.Literal('manager'),
  Type.Literal('barber'),
  Type.Literal('receptionist'),
]);

export const AuthenticatedPrincipalSchema = Type.Object(
  {
    subject: Type.String({ minLength: 1 }),
    username: Type.Optional(Type.String({ minLength: 1 })),
    email: Type.Optional(Type.String({ minLength: 1 })),
    roles: Type.Array(BarberRoleSchema),
  },
  {
    additionalProperties: false,
  },
);
