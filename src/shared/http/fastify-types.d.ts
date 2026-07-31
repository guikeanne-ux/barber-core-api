import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    receivedAtNs: bigint;
  }
}

export {};
