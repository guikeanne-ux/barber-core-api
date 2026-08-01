import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApplication } from '../app/build-application.js';
import { createDependencies } from '../app/create-dependencies.js';
import type { ApplicationConfiguration } from '../app/configuration/configuration-schema.js';
import { stopApplication } from '../app/stop-application.js';
import { sortOpenApiDocument } from '../shared/openapi/stable-openapi.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.resolve(currentDir, '../../openapi/openapi.json');

const configuration: Readonly<ApplicationConfiguration> = Object.freeze({
  NODE_ENV: 'development',
  HOST: '0.0.0.0',
  PORT: 3000,
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_VERSION: '0.1.0',
  SHUTDOWN_TIMEOUT_MS: 10_000,
  BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
  OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
  OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
  OIDC_AUDIENCE: 'barber-core-api',
  OIDC_CLOCK_TOLERANCE_SECONDS: 5,
  OIDC_JWKS_TIMEOUT_MS: 3000,
});

const dependencies = createDependencies(configuration);
const application = await buildApplication(dependencies);

try {
  const sorted = sortOpenApiDocument(application.app.swagger());
  await mkdir(path.dirname(openApiPath), { recursive: true });
  await writeFile(openApiPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  console.log(`OpenAPI written to ${openApiPath}`);
} finally {
  await stopApplication(application);
}
