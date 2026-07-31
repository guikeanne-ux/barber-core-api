import 'fastify';
import type { AuthenticatedPrincipal } from '../../modules/auth/authenticated-principal.js';

declare module 'fastify' {
  interface FastifyRequest {
    receivedAtNs: bigint;
    identity: AuthenticatedPrincipal | null;
  }
}

export {};
