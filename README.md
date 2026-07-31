# barber-core-api

`barber-core-api` is the main HTTP API of the Barber Platform ecosystem. This repository currently implements only the technical foundation, without business modules, authentication, or messaging.

## Scope

This repository currently covers only:

- Fastify and TypeScript application bootstrap
- PostgreSQL connectivity and migration mechanism
- technical HTTP endpoints
- error, logging, and lifecycle conventions
- Docker and CI execution

Deliberately out of scope for now:

- authentication and authorization
- Keycloak integration
- business CRUDs and scheduling flows
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
- Vitest and Testcontainers
- Docker Compose and GitHub Actions

## Architecture

The composition root stays explicit in `buildApplication()` and `startServer()`.

There is no global service locator. Each module receives only the dependencies it needs.

Current technical module:

- `system`

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

Production-style local run:

```bash
npm run build
npm start
```

## Migrations

This delivery intentionally contains no production migration yet, but the real migration mechanism is already implemented.

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

## Docker

```bash
npm run docker:up
npm run docker:down
npm run docker:reset
npm run docker:logs
npm run smoke
```

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
