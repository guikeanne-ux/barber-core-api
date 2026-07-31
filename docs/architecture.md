# Architecture

## Foundation scope

This repository currently implements only the API foundation. There are no business modules yet.

The only module in this delivery is:

- `system`

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

## Modular monolith rules

Future modules must:

- keep their internal persistence private
- avoid direct imports of other modules' internal implementations
- expose only explicit contracts when cross-module collaboration becomes necessary
