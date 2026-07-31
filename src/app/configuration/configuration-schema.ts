import { Type } from '@sinclair/typebox';

export const ConfigurationSchema = Type.Object({
  NODE_ENV: Type.Union([
    Type.Literal('development'),
    Type.Literal('test'),
    Type.Literal('production'),
  ]),
  HOST: Type.String({ minLength: 1 }),
  PORT: Type.Integer({ minimum: 1, maximum: 65535 }),
  LOG_LEVEL: Type.Union([
    Type.Literal('fatal'),
    Type.Literal('error'),
    Type.Literal('warn'),
    Type.Literal('info'),
    Type.Literal('debug'),
    Type.Literal('trace'),
    Type.Literal('silent'),
  ]),
  DATABASE_URL: Type.String({ minLength: 1 }),
  CORS_ORIGIN: Type.String({ minLength: 1 }),
  APP_VERSION: Type.String({ minLength: 1 }),
});

export type ApplicationConfiguration = typeof ConfigurationSchema.static;
