import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { SignJWT, exportJWK, generateKeyPair, importJWK } from 'jose';

const DEFAULT_AUDIENCE = 'barber-core-api';
const DEFAULT_ISSUER = 'http://host.docker.internal:18080/realms/barber';
const DEFAULT_PORT = 18080;
const DEFAULT_STATE_DIR = path.resolve('.smoke-jwks');
function readArgument(index, fallback) {
  return process.argv[index] ?? fallback;
}

async function ensureStateDirectory(stateDirectory) {
  await mkdir(stateDirectory, { recursive: true });
}

async function ensureFixtureState(stateDirectory) {
  await ensureStateDirectory(stateDirectory);
  const privateKeyPath = path.join(stateDirectory, 'private-jwk.json');
  const publicKeyPath = path.join(stateDirectory, 'jwks.json');

  try {
    const [privateKeyContent, publicKeyContent] = await Promise.all([
      readFile(privateKeyPath, 'utf8'),
      readFile(publicKeyPath, 'utf8'),
    ]);

    return {
      privateJwk: JSON.parse(privateKeyContent),
      jwks: JSON.parse(publicKeyContent),
    };
  } catch {
    const { privateKey, publicKey } = await generateKeyPair('RS256', {
      extractable: true,
    });
    const privateJwk = await exportJWK(privateKey);
    const publicJwk = await exportJWK(publicKey);
    const kid = `smoke-key-${randomUUID()}`;

    const normalizedPrivateJwk = {
      ...privateJwk,
      alg: 'RS256',
      use: 'sig',
      kid,
    };
    const normalizedPublicJwk = {
      ...publicJwk,
      alg: 'RS256',
      use: 'sig',
      kid,
    };
    const jwks = {
      keys: [normalizedPublicJwk],
    };

    await Promise.all([
      writeFile(privateKeyPath, JSON.stringify(normalizedPrivateJwk)),
      writeFile(publicKeyPath, JSON.stringify(jwks)),
    ]);

    return {
      privateJwk: normalizedPrivateJwk,
      jwks,
    };
  }
}

async function serve(stateDirectory, port, issuerUrl) {
  const { jwks } = await ensureFixtureState(stateDirectory);
  const discoveryDocument = {
    issuer: issuerUrl,
    jwks_uri: `${issuerUrl}/protocol/openid-connect/certs`,
  };

  const server = http.createServer(async (request, response) => {
    const url = new globalThis.URL(
      request.url ?? '/',
      `http://${request.headers.host ?? '127.0.0.1'}`,
    );

    if (url.pathname === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === '/realms/barber/.well-known/openid-configuration') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(discoveryDocument));
      return;
    }

    if (url.pathname === '/realms/barber/protocol/openid-connect/certs') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(jwks));
      return;
    }

    if (url.pathname === '/token') {
      const rolesValue = url.searchParams.get('roles') ?? 'admin';
      const subject = url.searchParams.get('subject') ?? 'smoke-user';

      try {
        const token = await issueToken(stateDirectory, rolesValue, subject, issuerUrl);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ accessToken: token }));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: 'token_issue_failed',
            detail: error instanceof Error ? error.message : 'unknown_error',
          }),
        );
      }
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const shutdown = async (signal) => {
    process.stderr.write(`smoke-jwks-fixture: received ${signal}, shutting down\n`);
    server.closeAllConnections();
    server.closeIdleConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.stderr.write(`smoke-jwks-fixture: listening on port ${String(port)}\n`);
}

async function issueToken(stateDirectory, rolesValue, subject, issuerUrl) {
  const { privateJwk } = await ensureFixtureState(stateDirectory);
  const privateKey = await importJWK(privateJwk, 'RS256');
  const kid = typeof privateJwk.kid === 'string' ? privateJwk.kid : 'smoke-key';
  const roles = rolesValue
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    sub: subject,
    preferred_username: `${subject}.demo`,
    resource_access: {
      [DEFAULT_AUDIENCE]: {
        roles,
      },
    },
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid,
    })
    .setIssuer(issuerUrl)
    .setAudience(DEFAULT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  return token;
}

async function main() {
  const command = readArgument(2, 'serve');

  if (command === 'serve') {
    const stateDirectory = readArgument(3, DEFAULT_STATE_DIR);
    const port = Number.parseInt(readArgument(4, String(DEFAULT_PORT)), 10);
    const issuerUrl = readArgument(5, DEFAULT_ISSUER);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Invalid smoke JWKS fixture port.');
    }

    await serve(stateDirectory, port, issuerUrl);
    return;
  }

  if (command === 'token') {
    const stateDirectory = readArgument(3, DEFAULT_STATE_DIR);
    const rolesValue = readArgument(4, 'admin');
    const subject = readArgument(5, 'smoke-user');
    const tokenIssuerUrl = readArgument(6, DEFAULT_ISSUER);
    const token = await issueToken(stateDirectory, rolesValue, subject, tokenIssuerUrl);
    process.stdout.write(token);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

await main();
