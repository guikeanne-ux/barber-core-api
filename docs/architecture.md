# Architecture

## Current scope

This repository currently implements the API foundation plus identity integration at the HTTP boundary. There are still no business modules yet.

Current technical modules:

- `system`
- `auth`

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

## Modular monolith rules

Future modules must:

- keep their internal persistence private
- avoid direct imports of other modules' internal implementations
- expose only explicit contracts when cross-module collaboration becomes necessary
