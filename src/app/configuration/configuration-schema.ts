import { Type } from '@sinclair/typebox';

export const NodeEnvironmentSchema = Type.Union([
  Type.Literal('development'),
  Type.Literal('test'),
  Type.Literal('production'),
]);

export const LogLevelSchema = Type.Union([
  Type.Literal('fatal'),
  Type.Literal('error'),
  Type.Literal('warn'),
  Type.Literal('info'),
  Type.Literal('debug'),
  Type.Literal('trace'),
  Type.Literal('silent'),
]);

export const RuntimeConfigurationSchema = Type.Object({
  NODE_ENV: NodeEnvironmentSchema,
});

export const DatabaseConfigurationSchema = Type.Object({
  DATABASE_URL: Type.String({ minLength: 1 }),
});

export const HttpConfigurationSchema = Type.Object({
  HOST: Type.String({ minLength: 1 }),
  PORT: Type.Integer({ minimum: 1, maximum: 65535 }),
  LOG_LEVEL: LogLevelSchema,
  CORS_ORIGIN: Type.String({ minLength: 1 }),
  APP_VERSION: Type.String({ minLength: 1 }),
  SHUTDOWN_TIMEOUT_MS: Type.Integer({ minimum: 1, maximum: 120000 }),
  BUSINESS_TIME_ZONE: Type.String({ minLength: 1 }),
});

export const OidcConfigurationSchema = Type.Object({
  OIDC_ISSUER_URL: Type.String({ minLength: 1 }),
  OIDC_JWKS_URL: Type.String({ minLength: 1 }),
  OIDC_AUDIENCE: Type.String({ minLength: 1 }),
  OIDC_CLOCK_TOLERANCE_SECONDS: Type.Integer({ minimum: 0, maximum: 30 }),
  OIDC_JWKS_TIMEOUT_MS: Type.Integer({ minimum: 100, maximum: 10000 }),
});

export const ApplicationConfigurationSchema = Type.Intersect([
  RuntimeConfigurationSchema,
  DatabaseConfigurationSchema,
  HttpConfigurationSchema,
  OidcConfigurationSchema,
]);

export const MigrationConfigurationSchema = Type.Intersect([
  RuntimeConfigurationSchema,
  DatabaseConfigurationSchema,
]);

export type RuntimeConfiguration = typeof RuntimeConfigurationSchema.static;
export type DatabaseConfiguration = typeof DatabaseConfigurationSchema.static;
export type HttpConfiguration = typeof HttpConfigurationSchema.static;
export type OidcConfiguration = typeof OidcConfigurationSchema.static;
export type ApplicationConfiguration = typeof ApplicationConfigurationSchema.static;
export type MigrationConfiguration = typeof MigrationConfigurationSchema.static;
