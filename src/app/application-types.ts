import type { FastifyInstance } from 'fastify';

import type { ApplicationConfiguration } from './configuration/configuration-schema.js';
import type { DatabaseConnection } from '../shared/database/database.js';
import type { VerifyAccessToken } from '../modules/auth/verify-access-token.js';

export type ReadinessProbeResult = { ready: true } | { ready: false; reason: string };
export type ReadinessProbe = () => Promise<ReadinessProbeResult>;

export interface ApplicationDependencies {
  readonly configuration: Readonly<ApplicationConfiguration>;
  readonly database: DatabaseConnection;
  readonly readinessProbe: ReadinessProbe;
  readonly verifyAccessToken: VerifyAccessToken;
}

export interface BuiltApplication {
  readonly app: FastifyInstance;
  readonly dependencies: ApplicationDependencies;
}
