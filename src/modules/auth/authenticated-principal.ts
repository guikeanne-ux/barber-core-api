export const BARBER_ROLES = ['admin', 'manager', 'barber', 'receptionist'] as const;

export type BarberRole = (typeof BARBER_ROLES)[number];

export interface AuthenticatedPrincipal {
  readonly subject: string;
  readonly username?: string;
  readonly email?: string;
  readonly roles: readonly BarberRole[];
}

export function isBarberRole(value: string): value is BarberRole {
  return BARBER_ROLES.includes(value as BarberRole);
}
