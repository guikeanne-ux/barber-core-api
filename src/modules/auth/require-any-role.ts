import type { preHandlerHookHandler } from 'fastify';

import type { BarberRole } from './authenticated-principal.js';
import { authenticationRequired, insufficientPermissions } from './authentication-errors.js';

export function requireAnyRole(...roles: readonly BarberRole[]): preHandlerHookHandler {
  return (request, _reply, done) => {
    const identity = request.identity;

    if (!identity) {
      done(authenticationRequired());
      return;
    }

    const isAuthorized = roles.some((role) => identity.roles.includes(role));
    if (!isAuthorized) {
      done(insufficientPermissions());
      return;
    }

    done();
  };
}
