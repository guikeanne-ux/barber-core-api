import { describe, expect, it } from 'vitest';

import { loadConfiguration } from '../../src/app/configuration/load-config.js';

describe('loadConfiguration', () => {
  it('loads valid configuration', () => {
    const configuration = loadConfiguration({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3333',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      CORS_ORIGIN: 'http://localhost:5173',
      APP_VERSION: '0.1.0',
    });

    expect(configuration.PORT).toBe(3333);
    expect(configuration.SHUTDOWN_TIMEOUT_MS).toBe(10_000);
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it('fails fast for invalid configuration', () => {
    expect(() =>
      loadConfiguration({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 'not-a-number',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
      }),
    ).toThrow(/PORT/);
  });

  it('fails when required configuration is missing', () => {
    expect(() =>
      loadConfiguration({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3333',
        LOG_LEVEL: 'info',
        DATABASE_URL: '',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
      }),
    ).toThrow(/Invalid application configuration/);
  });

  it('loads a custom shutdown timeout', () => {
    const configuration = loadConfiguration({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3333',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      CORS_ORIGIN: 'http://localhost:5173',
      APP_VERSION: '0.1.0',
      SHUTDOWN_TIMEOUT_MS: '2500',
    });

    expect(configuration.SHUTDOWN_TIMEOUT_MS).toBe(2500);
  });
});
