import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { parseBearerToken } from './bearer-token.js';
import type { VerifyAccessToken } from './verify-access-token.js';

export function authenticateRequest(
  verifyAccessToken: VerifyAccessToken,
): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest) => {
    const token = parseBearerToken(request.headers.authorization);
    const principal = await verifyAccessToken(token);
    request.identity = principal;
  };
}
