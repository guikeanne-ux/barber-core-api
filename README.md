# barber-core-api

`barber-core-api` is the main HTTP API of the Barber Platform ecosystem. This repository currently implements the technical foundation, identity integration, route-level authorization, and the first business modules: `catalog`, `availability`, and `appointments`.

## Scope

This repository currently covers only:

- Fastify and TypeScript application bootstrap
- PostgreSQL connectivity and migration mechanism
- technical HTTP endpoints
- local JWT validation through Keycloak JWKS
- explicit route-level authentication and authorization helpers
- catalog management for professionals, services, and professional-service capabilities
- professional weekly availability, date overrides, and resolved availability
- appointment creation, reads, listing, cancellation, and real PostgreSQL overlap protection
- error, logging, and lifecycle conventions
- Docker and CI execution

Deliberately out of scope for now:

- slot generation, available-times endpoints, reschedule, and completed/no-show lifecycle states
- messaging, outbox, RabbitMQ, notifications, or workers

## What it already provides

- Node.js `24.18.0` LTS foundation with TypeScript ESM and strict compiler settings
- Fastify `5` application bootstrap with explicit composition root
- TypeBox schemas and Fastify Type Provider integration
- PostgreSQL foundation using `pg` and Kysely
- health, liveness, and readiness endpoints
- Problem Details responses
- `x-request-id` propagation
- structured JSON logs with redaction
- local access-token validation with `jose` and remote JWKS
- sanitized authenticated principal at `GET /api/v1/auth/me`
- role-based authorization with `admin`, `manager`, `barber`, and `receptionist`
- authenticated catalog endpoints for professionals and services
- authenticated capability management between professionals and services
- authenticated availability endpoints for weekly configuration, overrides, and resolved ranges
- authenticated appointment endpoints for create, read, list, and cancel
- timezone-aware local booking conversion through `@js-temporal/polyfill`
- appointment snapshots for professional, service, price, duration, and timezone
- PostgreSQL `btree_gist` plus exclusion constraint for double-booking prevention
- OpenAPI generation and Swagger UI
- unit, integration, and Docker smoke tests
- Docker and GitHub Actions pipeline

## Technology stack

- Node.js `24.18.0`
- TypeScript ESM with strict compiler settings
- Fastify `5`
- TypeBox with `@fastify/type-provider-typebox`
- PostgreSQL `18.4`
- Kysely and `pg`
- `@js-temporal/polyfill`
- Vitest and Testcontainers
- Docker Compose and GitHub Actions

## Architecture

The composition root stays explicit in `buildApplication()` and `startServer()`.

There is no global service locator. Each module receives only the dependencies it needs.

Current modules:

- `system`
- `auth`
- `catalog`
- `availability`
- `appointments`

## Health endpoints

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /docs`
- `GET /docs/json`

`/health/live` is independent from PostgreSQL. `/health/ready` depends on the configured readiness probe.

## Local execution

```bash
cp .env.example .env
npm ci
npm run dev
```

Identity-related local defaults in `.env.example` point to the `barber-identity` Keycloak realm:

- `OIDC_ISSUER_URL=http://localhost:8080/realms/barber`
- `OIDC_JWKS_URL=http://localhost:8080/realms/barber/protocol/openid-connect/certs`
- `OIDC_AUDIENCE=barber-core-api`

Production-style local run:

```bash
npm run build
npm start
```

## Migrations

The repository now contains production migrations for:

- `catalog`
- `availability`
- `appointments`

Useful commands:

```bash
npm run db:migrate
npm run db:rollback
npm run db:migration:create -- <migration-name>
```

## Tests and validation

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
npm run validate
```

Auth integration tests use a controlled local JWKS harness and do not require a real Keycloak process.

## Docker

```bash
npm run docker:up
npm run docker:down
npm run docker:reset
npm run docker:logs
npm run smoke
```

`npm run smoke` starts a temporary JWKS fixture on the host, recreates the `api` container with smoke-specific OIDC values that target `host.docker.internal`, validates `/api/v1/auth/me`, and then exercises catalog, availability, and appointment flows without requiring a real Keycloak container. No token, private key, or fixture state is versioned.

## OpenAPI

The contract is generated from the Fastify + TypeBox schemas and versioned at:

```text
openapi/openapi.json
```

Commands:

```bash
npm run openapi:generate
npm run openapi:check
```

The contract now includes:

- `bearerAuth` security scheme
- `GET /api/v1/auth/me`
- `Professionals` and `Services` tags
- `Availability` tag
- `Appointments` tag
- protected catalog operations with stable `operationId` values
- protected availability operations with stable `operationId` values
- protected appointment operations with stable `operationId` values
- standardized `401`, `403`, and `503` Problem Details for protected routes

## Graceful shutdown

The runtime validates `SHUTDOWN_TIMEOUT_MS` and uses it as the maximum shutdown window.

Shutdown behavior:

- handles `SIGINT` and `SIGTERM`
- prevents concurrent shutdown execution
- stops accepting new requests via Fastify close
- closes PostgreSQL resources
- sets `process.exitCode` instead of calling `process.exit(0)` on success
- forces non-zero termination only after a timeout path is logged

## Main commands

```bash
npm run dev
npm run build
npm start
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:coverage
npm run validate
```

## Documentation

- [Architecture](docs/architecture.md)
- [Local Development](docs/local-development.md)
- [Database](docs/database.md)
- [Error Handling](docs/error-handling.md)
- [Observability](docs/observability.md)
- [Security](docs/security.md)
- [Production Considerations](docs/production-considerations.md)
