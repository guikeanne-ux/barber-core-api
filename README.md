# barber-core-api

`barber-core-api` is the main HTTP API of the Barber Platform ecosystem. This repository currently implements only the technical foundation, without business modules, authentication, or messaging.

## What this repository already provides

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

## Plugin choice for OpenAPI and schemas

This implementation uses:

- `@fastify/type-provider-typebox`
- `@fastify/swagger`
- `@fastify/swagger-ui`

This combination was chosen because it keeps TypeBox as the single contract source for request and response schemas while integrating cleanly with Fastify `5` and allowing deterministic OpenAPI generation.

## Development commands

```bash
npm ci
npm run dev
npm run build
npm start
npm run validate
```

## Docker commands

```bash
npm run docker:up
npm run docker:down
npm run docker:reset
npm run docker:logs
npm run smoke
```

## OpenAPI

The generated contract is versioned at:

```text
openapi/openapi.json
```

Generate it with:

```bash
npm run openapi:generate
```

## Documentation map

- [Architecture](docs/architecture.md)
- [Local Development](docs/local-development.md)
- [Database](docs/database.md)
- [Error Handling](docs/error-handling.md)
- [Observability](docs/observability.md)
- [Security](docs/security.md)
- [Production Considerations](docs/production-considerations.md)
