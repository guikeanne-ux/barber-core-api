import type { FastifyInstance } from 'fastify';

import type { ApplicationConfiguration } from './configuration/configuration-schema.js';
import type { DatabaseConnection } from '../shared/database/database.js';

export interface ApplicationDependencies {
  readonly configuration: Readonly<ApplicationConfiguration>;
  readonly database: DatabaseConnection;
  readonly readinessTimeoutMs: number;
  readonly readinessProbe: () => Promise<{ ready: true } | { ready: false; reason: string }>;
}

export interface BuiltApplication {
  readonly app: FastifyInstance;
  readonly dependencies: ApplicationDependencies;
}
