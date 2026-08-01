import { describe, expect, it } from 'vitest';

import {
  loadConfiguration,
  loadMigrationConfiguration,
} from '../../src/app/configuration/load-config.js';

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
      BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
      OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber/',
      OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs/',
      OIDC_AUDIENCE: 'barber-core-api',
      OIDC_CLOCK_TOLERANCE_SECONDS: '5',
      OIDC_JWKS_TIMEOUT_MS: '3000',
    });

    expect(configuration.PORT).toBe(3333);
    expect(configuration.SHUTDOWN_TIMEOUT_MS).toBe(10_000);
    expect(configuration.OIDC_ISSUER_URL).toBe('http://localhost:8080/realms/barber');
    expect(configuration.OIDC_JWKS_URL).toBe(
      'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
    );
    expect(configuration.BUSINESS_TIME_ZONE).toBe('America/Sao_Paulo');
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
        BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
        OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
        OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
        OIDC_AUDIENCE: 'barber-core-api',
        OIDC_CLOCK_TOLERANCE_SECONDS: '5',
        OIDC_JWKS_TIMEOUT_MS: '3000',
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
        BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
        OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
        OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
        OIDC_AUDIENCE: 'barber-core-api',
        OIDC_CLOCK_TOLERANCE_SECONDS: '5',
        OIDC_JWKS_TIMEOUT_MS: '3000',
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
      BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
      OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
      OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
      OIDC_AUDIENCE: 'barber-core-api',
      OIDC_CLOCK_TOLERANCE_SECONDS: '5',
      OIDC_JWKS_TIMEOUT_MS: '3000',
    });

    expect(configuration.SHUTDOWN_TIMEOUT_MS).toBe(2500);
  });

  it('fails when production OIDC URLs do not use HTTPS', () => {
    expect(() =>
      loadConfiguration({
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3333',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
        BUSINESS_TIME_ZONE: 'America/Sao_Paulo',
        OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
        OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
        OIDC_AUDIENCE: 'barber-core-api',
        OIDC_CLOCK_TOLERANCE_SECONDS: '5',
        OIDC_JWKS_TIMEOUT_MS: '3000',
      }),
    ).toThrow(/must use HTTPS/);
  });

  it('loads migration configuration without OIDC variables', () => {
    const configuration = loadMigrationConfiguration({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });

    expect(configuration).toEqual({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it('fails when BUSINESS_TIME_ZONE is missing or invalid', () => {
    expect(() =>
      loadConfiguration({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3333',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
        OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
        OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
        OIDC_AUDIENCE: 'barber-core-api',
        OIDC_CLOCK_TOLERANCE_SECONDS: '5',
        OIDC_JWKS_TIMEOUT_MS: '3000',
      }),
    ).toThrow(/Invalid application configuration/);

    expect(() =>
      loadConfiguration({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3333',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_VERSION: '0.1.0',
        BUSINESS_TIME_ZONE: 'Mars/Olympus_Mons',
        OIDC_ISSUER_URL: 'http://localhost:8080/realms/barber',
        OIDC_JWKS_URL: 'http://localhost:8080/realms/barber/protocol/openid-connect/certs',
        OIDC_AUDIENCE: 'barber-core-api',
        OIDC_CLOCK_TOLERANCE_SECONDS: '5',
        OIDC_JWKS_TIMEOUT_MS: '3000',
      }),
    ).toThrow(/BUSINESS_TIME_ZONE/);
  });
});
