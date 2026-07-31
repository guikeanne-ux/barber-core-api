import http from 'node:http';
import { TextEncoder } from 'node:util';

import {
  CompactSign,
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  type JWK,
} from 'jose';

export const TEST_ISSUER = 'http://issuer.test/realms/barber';
export const TEST_AUDIENCE = 'barber-core-api';

type JwksMode = 'jwks' | 'bad-json' | 'bad-status' | 'hang' | 'raw-body';

export interface SigningKeyPair {
  readonly kid: string;
  readonly privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  readonly publicJwk: JWK;
}

export interface TokenPayloadInput {
  readonly sub?: string;
  readonly aud?: string | readonly string[];
  readonly preferred_username?: string;
  readonly email?: string;
  readonly resource_access?: Record<string, unknown>;
  readonly nbf?: number;
  readonly iat?: number;
  readonly exp?: number;
  readonly iss?: string;
}

export interface ArbitraryTokenInput {
  readonly payload: Record<string, unknown>;
  readonly issuer?: string;
  readonly audience?: string | readonly string[];
  readonly protectedHeader?: Record<string, unknown>;
}

export async function generateSigningKeyPair(kid: string): Promise<SigningKeyPair> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const exported = await exportJWK(publicKey);

  return {
    kid,
    privateKey,
    publicJwk: {
      ...exported,
      use: 'sig',
      alg: 'RS256',
      kid,
    },
  };
}

export async function signAccessToken(
  keyPair: SigningKeyPair,
  payload: TokenPayloadInput = {},
): Promise<string> {
  const { aud, exp, iat, iss, nbf, sub, ...customClaims } = payload;
  const now = Math.floor(Date.now() / 1000);
  let resolvedAudience: string | string[];

  if (aud === undefined) {
    resolvedAudience = TEST_AUDIENCE;
  } else if (Array.isArray(aud)) {
    resolvedAudience = Array.from(aud);
  } else {
    resolvedAudience = aud as string;
  }

  const jwt = new SignJWT({
    resource_access: {
      [TEST_AUDIENCE]: {
        roles: ['admin'],
      },
    },
    preferred_username: 'admin.demo',
    email: 'admin@example.test',
    ...customClaims,
    ...(sub !== undefined ? { sub } : { sub: 'subject-123' }),
    aud: resolvedAudience,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyPair.kid })
    .setIssuer(iss ?? TEST_ISSUER)
    .setIssuedAt(iat ?? now)
    .setExpirationTime(exp ?? now + 300);

  if (nbf !== undefined) {
    jwt.setNotBefore(nbf);
  }

  return jwt.sign(keyPair.privateKey);
}

export async function signArbitraryAccessToken(
  keyPair: SigningKeyPair,
  input: ArbitraryTokenInput,
): Promise<string> {
  const encoder = new TextEncoder();
  const payload = {
    iss: input.issuer ?? TEST_ISSUER,
    aud: input.audience ?? TEST_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...input.payload,
  };

  return new CompactSign(encoder.encode(JSON.stringify(payload)))
    .setProtectedHeader({
      alg: 'RS256',
      kid: keyPair.kid,
      ...(input.protectedHeader ?? {}),
    })
    .sign(keyPair.privateKey);
}

export class JwksTestServer {
  #jwks: JSONWebKeySet = { keys: [] };

  #mode: JwksMode = 'jwks';

  #rawBody = '{}';

  #rawContentType = 'application/json';

  #server = http.createServer((_, response) => {
    switch (this.#mode) {
      case 'bad-json':
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{ invalid');
        return;
      case 'bad-status':
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'boom' }));
        return;
      case 'hang':
        return;
      case 'raw-body':
        response.writeHead(200, { 'content-type': this.#rawContentType });
        response.end(this.#rawBody);
        return;
      case 'jwks':
      default:
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(this.#jwks));
    }
  });

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.#server.closeAllConnections();
    this.#server.closeIdleConnections();

    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  setMode(mode: JwksMode): void {
    this.#mode = mode;
  }

  setRawBody(body: string, contentType = 'application/json'): void {
    this.#rawBody = body;
    this.#rawContentType = contentType;
    this.#mode = 'raw-body';
  }

  setKeys(keys: readonly JWK[]): void {
    this.#jwks = {
      keys: [...keys],
    };
  }

  get url(): string {
    const address = this.#server.address();
    if (!address || typeof address === 'string') {
      throw new Error('JWKS test server is not running.');
    }

    return `http://127.0.0.1:${String(address.port)}/jwks`;
  }
}
