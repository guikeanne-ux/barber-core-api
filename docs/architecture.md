# Architecture

## Current scope

This repository currently implements the API foundation, identity integration at the HTTP boundary, and the first business module of the demonstrative vertical slice.

Current modules:

- `system`
- `auth`
- `catalog`

## Composition

The application is separated into:

- configuration loading
- dependency creation
- Fastify application construction
- route registration
- server startup
- graceful shutdown

The design allows tests to build the Fastify instance with `fastify.inject` without opening a TCP port.

Each module receives explicitly only its own dependencies. There is no global service locator and modules do not access a general application container.

## Auth module

The `auth` module owns:

- bearer token extraction from `Authorization`
- local JWT validation through remote JWKS
- sanitized authenticated principal mapping
- explicit `authenticateRequest` route protection
- explicit `requireAnyRole(...)` role checks
- `GET /api/v1/auth/me`

The module does not own login flows, sessions, refresh tokens, Keycloak administration, or business authorization rules beyond the current route-level client-role checks.

## Catalog module

The `catalog` module owns:

- professionals
- services
- professional-service capabilities
- HTTP contracts for those resources
- validation and normalization rules
- the `CatalogRepository` persistence boundary
- the PostgreSQL adapter for catalog storage

Handlers do not talk to Kysely directly. The module stays cohesive on purpose, instead of being split into speculative submodules per entity.

## Modular monolith rules

Future modules must:

- keep their internal persistence private
- avoid direct imports of other modules' internal implementations
- expose only explicit contracts when cross-module collaboration becomes necessary
- avoid querying `professionals`, `services`, or `professional_services` directly outside `catalog`
