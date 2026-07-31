import { Value } from '@sinclair/typebox/value';

import { ConfigurationSchema, type ApplicationConfiguration } from './configuration-schema.js';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

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

export function loadConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): Readonly<ApplicationConfiguration> {
  const candidate = {
    NODE_ENV: env.NODE_ENV,
    HOST: env.HOST,
    PORT: parseInteger('PORT', env.PORT),
    LOG_LEVEL: env.LOG_LEVEL,
    DATABASE_URL: env.DATABASE_URL,
    CORS_ORIGIN: env.CORS_ORIGIN,
    APP_VERSION: env.APP_VERSION,
    SHUTDOWN_TIMEOUT_MS:
      parseInteger('SHUTDOWN_TIMEOUT_MS', env.SHUTDOWN_TIMEOUT_MS) ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
  };

  if (!Value.Check(ConfigurationSchema, candidate)) {
    const errors = [...Value.Errors(ConfigurationSchema, candidate)]
      .map((error) => `${error.path || '/'} ${error.message}`)
      .join('; ');
    throw new Error(`Invalid application configuration: ${errors}`);
  }

  return Object.freeze(candidate);
}
