import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import {
  ApplicationConfigurationSchema,
  MigrationConfigurationSchema,
  type ApplicationConfiguration,
  type MigrationConfiguration,
  type NodeEnvironmentSchema,
} from './configuration-schema.js';
import { assertValidBusinessTimeZone } from '../../modules/availability/local-date.js';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

type NodeEnvironment = typeof NodeEnvironmentSchema.static;

function parseInteger(name: string, value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }

  return parsed;
}

function assertValidConfiguration<TValue>(
  schema: TSchema,
  candidate: TValue,
  label: string,
): asserts candidate is TValue {
  if (!Value.Check(schema, candidate)) {
    const errors = [...Value.Errors(schema, candidate)]
      .map((error) => `${error.path || '/'} ${error.message}`)
      .join('; ');
    throw new Error(`Invalid ${label} configuration: ${errors}`);
  }
}

function normalizeAbsoluteUrl(name: string, value: string, nodeEnv: NodeEnvironment): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Environment variable ${name} must be an absolute URL.`);
  }

  if (!parsed.protocol || !parsed.hostname) {
    throw new Error(`Environment variable ${name} must be an absolute URL.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`Environment variable ${name} must not include username or password.`);
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error(`Environment variable ${name} must use HTTPS when NODE_ENV=production.`);
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString().replace(/\/$/, '');
}

export function loadConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): Readonly<ApplicationConfiguration> {
  const rawCandidate = {
    NODE_ENV: env.NODE_ENV,
    HOST: env.HOST,
    PORT: parseInteger('PORT', env.PORT),
    LOG_LEVEL: env.LOG_LEVEL,
    DATABASE_URL: env.DATABASE_URL,
    CORS_ORIGIN: env.CORS_ORIGIN,
    APP_VERSION: env.APP_VERSION,
    SHUTDOWN_TIMEOUT_MS:
      parseInteger('SHUTDOWN_TIMEOUT_MS', env.SHUTDOWN_TIMEOUT_MS) ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    BUSINESS_TIME_ZONE: env.BUSINESS_TIME_ZONE,
    OIDC_ISSUER_URL: env.OIDC_ISSUER_URL,
    OIDC_JWKS_URL: env.OIDC_JWKS_URL,
    OIDC_AUDIENCE: env.OIDC_AUDIENCE,
    OIDC_CLOCK_TOLERANCE_SECONDS: parseInteger(
      'OIDC_CLOCK_TOLERANCE_SECONDS',
      env.OIDC_CLOCK_TOLERANCE_SECONDS,
    ),
    OIDC_JWKS_TIMEOUT_MS: parseInteger('OIDC_JWKS_TIMEOUT_MS', env.OIDC_JWKS_TIMEOUT_MS),
  };

  assertValidConfiguration(ApplicationConfigurationSchema, rawCandidate, 'application');

  const validatedCandidate = rawCandidate as ApplicationConfiguration;

  const candidate: ApplicationConfiguration = {
    ...validatedCandidate,
    OIDC_ISSUER_URL: normalizeAbsoluteUrl(
      'OIDC_ISSUER_URL',
      validatedCandidate.OIDC_ISSUER_URL,
      validatedCandidate.NODE_ENV,
    ),
    OIDC_JWKS_URL: normalizeAbsoluteUrl(
      'OIDC_JWKS_URL',
      validatedCandidate.OIDC_JWKS_URL,
      validatedCandidate.NODE_ENV,
    ),
    BUSINESS_TIME_ZONE: assertValidBusinessTimeZone(validatedCandidate.BUSINESS_TIME_ZONE),
  };

  return Object.freeze(candidate);
}

export function loadMigrationConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): Readonly<MigrationConfiguration> {
  const candidate = {
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
  };

  assertValidConfiguration(MigrationConfigurationSchema, candidate, 'migration');

  return Object.freeze(candidate as MigrationConfiguration);
}
