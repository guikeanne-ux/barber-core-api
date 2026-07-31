import { randomUUID } from 'node:crypto';

import fastify, { type FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerCorePlugins } from '../../src/app/plugins/register-plugins.js';
import { authenticateRequest } from '../../src/modules/auth/authenticate-request.js';
import type { VerifyAccessToken } from '../../src/modules/auth/verify-access-token.js';
import { authRoutes } from '../../src/modules/auth/routes.js';
import { requireAnyRole } from '../../src/modules/auth/require-any-role.js';
import { createVerifyAccessToken } from '../../src/modules/auth/verify-access-token.js';
import {
  generateSigningKeyPair,
  JwksTestServer,
  signAccessToken,
  signArbitraryAccessToken,
  TEST_AUDIENCE,
  TEST_ISSUER,
} from './helpers/jwks-test-server.js';

interface ProblemDetailsResponse {
  code: string;
  requestId?: string;
}

async function buildAuthTestApplication(input: {
  jwksUrl: string;
  jwksTimeoutMs?: number;
  oidcClockToleranceSeconds?: number;
  logLines?: string[];
  verifyAccessToken?: VerifyAccessToken;
}): Promise<FastifyInstance> {
  const app = fastify({
    logger: input.logLines
      ? {
          level: 'info',
          stream: {
            write: (line: string) => {
              input.logLines?.push(line);
            },
          },
        }
      : false,
    disableRequestLogging: true,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  await registerCorePlugins(app, {
    configuration: {
      NODE_ENV: 'test',
      APP_VERSION: '0.1.0',
      CORS_ORIGIN: 'http://localhost:5173',
    },
  });

  const verifyAccessToken =
    input.verifyAccessToken ??
    createVerifyAccessToken(
      {
        OIDC_ISSUER_URL: TEST_ISSUER,
        OIDC_JWKS_URL: input.jwksUrl,
        OIDC_AUDIENCE: TEST_AUDIENCE,
        OIDC_CLOCK_TOLERANCE_SECONDS: input.oidcClockToleranceSeconds ?? 1,
        OIDC_JWKS_TIMEOUT_MS: input.jwksTimeoutMs ?? 300,
      },
      {
        cooldownDurationMs: 0,
      },
    );

  await app.register(authRoutes, {
    verifyAccessToken,
  });

  app.get('/public', () => ({ ok: true as const }));

  app.get(
    '/protected/manager',
    {
      preHandler: [authenticateRequest(verifyAccessToken), requireAnyRole('manager')],
      schema: {
        response: {
          200: Type.Object({
            ok: Type.Literal(true),
          }),
        },
      },
    },
    () => ({ ok: true as const }),
  );

  app.get(
    '/protected/misconfigured',
    {
      preHandler: [requireAnyRole('admin')],
      schema: {
        response: {
          200: Type.Object({
            ok: Type.Literal(true),
          }),
        },
      },
    },
    () => ({ ok: true as const }),
  );

  await app.ready();
  return app;
}

describe('auth HTTP integration', () => {
  const jwksServer = new JwksTestServer();
  let primaryKey: Awaited<ReturnType<typeof generateSigningKeyPair>>;
  let secondaryKey: Awaited<ReturnType<typeof generateSigningKeyPair>>;

  beforeAll(async () => {
    primaryKey = await generateSigningKeyPair('kid-primary');
    secondaryKey = await generateSigningKeyPair('kid-secondary');
    await jwksServer.start();
  });

  beforeEach(() => {
    jwksServer.setMode('jwks');
    jwksServer.setKeys([primaryKey.publicJwk]);
  });

  afterAll(async () => {
    await jwksServer.stop();
  });

  it('keeps public routes accessible without authentication', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/public',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('returns 401 for missing credentials on /api/v1/auth/me', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      const body = response.json<ProblemDetailsResponse>();
      expect(body.code).toBe('AUTHENTICATION_REQUIRED');
      expect(body.requestId).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('returns 401 for malformed bearer credentials', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Basic abc',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('returns the sanitized principal for a valid access token', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      sub: '11111111-2222-3333-4444-555555555555',
      preferred_username: 'manager.demo',
      email: 'manager@example.test',
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['manager'],
        },
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        subject: '11111111-2222-3333-4444-555555555555',
        username: 'manager.demo',
        email: 'manager@example.test',
        roles: ['manager'],
      });
    } finally {
      await app.close();
    }
  });

  it('accepts tokens whose audience claim is an array containing the API audience', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      aud: ['barber-web-app', TEST_AUDIENCE],
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        subject: 'subject-123',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects tokens whose audience array does not contain the API audience', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      aud: ['barber-web-app', 'barber-notification-service'],
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('returns an empty roles array when the token has no barber-core-api roles', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      resource_access: {},
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        roles: [],
      });
    } finally {
      await app.close();
    }
  });

  it('accepts only exact supported roles, removes duplicates, and keeps deterministic ordering', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['barber', 'manager', 'Manager', 'ADMIN', ' receptionist', 'manager'],
        },
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        roles: ['manager', 'barber'],
      });
    } finally {
      await app.close();
    }
  });

  it.each([
    { description: 'resource_access is not an object', payload: { resource_access: 'invalid' } },
    {
      description: 'client access is not an object',
      payload: { resource_access: { [TEST_AUDIENCE]: 'invalid' } },
    },
    {
      description: 'roles is not an array',
      payload: { resource_access: { [TEST_AUDIENCE]: { roles: 'manager' } } },
    },
    {
      description: 'roles contains non-string values',
      payload: { resource_access: { [TEST_AUDIENCE]: { roles: ['manager', 123] } } },
    },
  ])('returns 401 when $description', async ({ payload }) => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signArbitraryAccessToken(primaryKey, {
      payload,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it.each([
    {
      description: 'preferred_username is not a string',
      payload: { preferred_username: 123 },
    },
    {
      description: 'preferred_username is an empty string',
      payload: { preferred_username: '' },
    },
    {
      description: 'email is not a string',
      payload: { email: null },
    },
    {
      description: 'email is an empty string',
      payload: { email: '' },
    },
  ])('omits invalid optional identity fields when $description', async ({ payload }) => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signArbitraryAccessToken(primaryKey, {
      payload: {
        sub: 'subject-optional-fields',
        ...payload,
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<Record<string, unknown>>();
      expect(body).not.toHaveProperty('username');
      expect(body).not.toHaveProperty('email');
      expect(body.username).toBeUndefined();
      expect(body.email).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it.each([
    {
      description: 'sub is absent',
      payload: { sub: undefined },
    },
    {
      description: 'sub is empty',
      payload: { sub: '' },
    },
    {
      description: 'sub has the wrong type',
      payload: { sub: { nested: true } },
    },
  ])('returns 401 when $description', async ({ payload }) => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signArbitraryAccessToken(primaryKey, {
      payload,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('accepts a token with a numeric iat claim', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signArbitraryAccessToken(primaryKey, {
      payload: {
        sub: 'subject-valid-iat',
        iat: Math.floor(Date.now() / 1000),
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it.each([
    {
      description: 'iat is a string',
      payload: { iat: 'invalid' },
    },
    {
      description: 'iat is an object',
      payload: { iat: { issuedAt: 1 } },
    },
  ])('returns 401 when $description', async ({ payload }) => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signArbitraryAccessToken(primaryKey, {
      payload,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 403 when the authenticated principal lacks the required role', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['barber'],
        },
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected/manager',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 401 when requireAnyRole runs without prior authentication', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected/misconfigured',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'AUTHENTICATION_REQUIRED',
      });
    } finally {
      await app.close();
    }
  });

  it('accepts a valid manager token on a role-protected route', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['manager'],
        },
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/protected/manager',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('rejects frontend-oriented tokens that do not contain the API audience', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey, {
      aud: 'barber-web-app',
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects expired tokens', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const now = Math.floor(Date.now() / 1000);
    const token = await signAccessToken(primaryKey, {
      iat: now - 30,
      exp: now - 10,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('accepts tokens that are within the configured clock tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      oidcClockToleranceSeconds: 5,
    });
    const token = await signAccessToken(primaryKey, {
      nbf: now + 2,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('rejects tokens that exceed the configured clock tolerance', async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      oidcClockToleranceSeconds: 1,
    });
    const token = await signAccessToken(primaryKey, {
      nbf: now + 10,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects tokens signed for the wrong issuer', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const wrongIssuerToken = await signAccessToken(primaryKey, {
      iss: 'http://issuer.example.invalid/realms/barber',
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${wrongIssuerToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects tokens with an invalid signature for a known kid', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const outsiderKey = await generateSigningKeyPair(primaryKey.kid);
    const token = await signAccessToken(outsiderKey);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 401 when JWKS fetch succeeds without a matching key', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const outsiderKey = await generateSigningKeyPair('kid-outsider');
    const token = await signAccessToken(outsiderKey);

    try {
      jwksServer.setKeys([secondaryKey.publicJwk]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: 'INVALID_ACCESS_TOKEN',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 503 on JWKS timeout', async () => {
    jwksServer.setMode('hang');
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      jwksTimeoutMs: 50,
    });
    const token = await signAccessToken(primaryKey);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 503 on non-success JWKS responses', async () => {
    jwksServer.setMode('bad-status');
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      });
    } finally {
      await app.close();
    }
  });

  it('returns 503 on syntactically invalid JWKS JSON payloads', async () => {
    jwksServer.setMode('bad-json');
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const token = await signAccessToken(primaryKey);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      });
    } finally {
      await app.close();
    }
  });

  it.each([
    { description: 'payload is empty object', body: '{}' },
    { description: 'keys is not an array', body: '{"keys":"invalid"}' },
  ])(
    'returns 503 when the JWKS response is structurally invalid because $description',
    async ({ body }) => {
      jwksServer.setRawBody(body);
      const app = await buildAuthTestApplication({
        jwksUrl: jwksServer.url,
      });
      const token = await signAccessToken(primaryKey);

      try {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: {
            authorization: `Bearer ${token}`,
          },
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({
          code: 'IDENTITY_PROVIDER_UNAVAILABLE',
        });
      } finally {
        await app.close();
      }
    },
  );

  it('supports key rotation without restarting the API', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
    });
    const firstToken = await signAccessToken(primaryKey);
    const secondToken = await signAccessToken(secondaryKey, {
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['manager'],
        },
      },
    });

    try {
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${firstToken}`,
        },
      });

      expect(firstResponse.statusCode).toBe(200);

      jwksServer.setKeys([secondaryKey.publicJwk]);

      const secondResponse = await app.inject({
        method: 'GET',
        url: '/protected/manager',
        headers: {
          authorization: `Bearer ${secondToken}`,
        },
      });

      expect(secondResponse.statusCode).toBe(200);
      expect(secondResponse.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('continues accepting cached keys when JWKS becomes unavailable but rejects new kids with 503', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      jwksTimeoutMs: 50,
    });
    const cachedToken = await signAccessToken(primaryKey);
    const rotatedToken = await signAccessToken(secondaryKey);

    try {
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${cachedToken}`,
        },
      });

      expect(firstResponse.statusCode).toBe(200);

      jwksServer.setMode('hang');

      const cachedResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${cachedToken}`,
        },
      });

      expect(cachedResponse.statusCode).toBe(200);

      const rotatedResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${rotatedToken}`,
        },
      });

      expect(rotatedResponse.statusCode).toBe(503);
      expect(rotatedResponse.json()).toMatchObject({
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      });
    } finally {
      await app.close();
    }
  });

  it('returns coherent 503 responses for concurrent unknown-kid requests when JWKS is unavailable', async () => {
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      jwksTimeoutMs: 50,
    });
    const cachedToken = await signAccessToken(primaryKey);
    const unknownKidToken = await signAccessToken(secondaryKey);

    try {
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${cachedToken}`,
        },
      });

      expect(firstResponse.statusCode).toBe(200);
      jwksServer.setMode('hang');

      const responses = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: {
            authorization: `Bearer ${unknownKidToken}`,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: {
            authorization: `Bearer ${unknownKidToken}`,
          },
        }),
      ]);

      expect(responses.map((response) => response.statusCode)).toEqual([503, 503]);
      expect(responses.map((response) => response.json<ProblemDetailsResponse>().code)).toEqual([
        'IDENTITY_PROVIDER_UNAVAILABLE',
        'IDENTITY_PROVIDER_UNAVAILABLE',
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns 500 for unexpected verifier defects instead of coercing them to 503', async () => {
    const logLines: string[] = [];
    const token = await signAccessToken(primaryKey, {
      sub: 'subject-unexpected-error',
      preferred_username: 'unexpected.user',
      email: 'unexpected@example.test',
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['manager', 'barber'],
        },
      },
    });
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      logLines,
      verifyAccessToken: () => {
        throw new Error('simulated verifier defect');
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        code: 'INTERNAL_ERROR',
      });
      expect(response.body).not.toContain('simulated verifier defect');
      expect(response.body).not.toContain(token);

      const joinedLogs = logLines.join('\n');
      expect(joinedLogs).toContain('request_failed');
      expect(joinedLogs).toContain('simulated verifier defect');
      expect(joinedLogs).not.toContain(token);
      expect(joinedLogs).not.toContain('subject-unexpected-error');
      expect(joinedLogs).not.toContain('unexpected.user');
      expect(joinedLogs).not.toContain('unexpected@example.test');
      expect(joinedLogs).not.toContain('"roles":["manager","barber"]');
    } finally {
      await app.close();
    }
  });

  it('does not log the bearer token, JWT claims, or JWKS material for authentication failures', async () => {
    const logLines: string[] = [];
    const app = await buildAuthTestApplication({
      jwksUrl: jwksServer.url,
      logLines,
    });
    const token = await signAccessToken(primaryKey, {
      sub: 'subject-sensitive',
      preferred_username: 'sensitive.user',
      email: 'sensitive@example.test',
      resource_access: {
        [TEST_AUDIENCE]: {
          roles: ['manager', 'barber'],
        },
      },
    });

    try {
      await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${token}tampered`,
        },
      });

      const joinedLogs = logLines.join('\n');
      expect(joinedLogs).toContain('authentication_failed');
      expect(joinedLogs).not.toContain(token);
      expect(joinedLogs).not.toContain('authorization');
      expect(joinedLogs).not.toContain('resource_access');
      expect(joinedLogs).not.toContain('preferred_username');
      expect(joinedLogs).not.toContain('email');
      expect(joinedLogs).not.toContain('subject-sensitive');
      expect(joinedLogs).not.toContain('sensitive.user');
      expect(joinedLogs).not.toContain('sensitive@example.test');
      expect(joinedLogs).not.toContain('"roles":["manager","barber"]');
      expect(joinedLogs).not.toContain('"keys"');
      expect(joinedLogs).not.toContain('"kty"');
    } finally {
      await app.close();
    }
  });
});
