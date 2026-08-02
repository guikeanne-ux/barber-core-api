# Architecture

## Current scope

This repository currently implements the API foundation, identity integration at the HTTP boundary, and the first business modules of the demonstrative vertical slice.

Current modules:

- `system`
- `auth`
- `catalog`
- `availability`
- `appointments`

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

## Availability module

The `availability` module owns:

- weekly availability per professional
- full-date overrides with `closed` and `custom` modes
- resolved availability for an inclusive local date range
- validation of local time and local date inputs
- the `AvailabilityRepository` persistence boundary
- the PostgreSQL adapter for availability storage

The module does not own appointments, slots, bookings, or service-duration-aware capacity.

Cross-module collaboration remains narrow on purpose. `availability` does not import `CatalogRepository` or query catalog tables directly through handlers or services. It receives only a small catalog contract that confirms professional existence and returns `{ id }`.

## Appointments module

The `appointments` module owns:

- appointment creation
- appointment reads and paginated listing
- idempotent cancellation
- customer snapshot normalization and persistence
- commercial snapshots for professional name, service name, duration, price, currency, and timezone
- timezone-aware conversion between local booking input and exact instants
- local-day boundary handling, including `end = 24:00`
- the `AppointmentRepository` persistence boundary
- the PostgreSQL adapter for appointment storage and conflict mapping

The module does not own:

- slots
- available-times generation
- reschedule
- customers as a standalone aggregate
- notifications
- outbox or events

Cross-module collaboration remains explicit and narrow:

- `appointments` receives only a dedicated catalog contract with professional/service snapshot input and capability state
- `appointments` receives only a dedicated availability contract with resolved periods for one local date
- `appointments` does not query catalog tables directly
- `appointments` does not query availability tables directly
- no distributed transaction spans `catalog`, `availability`, and `appointments`

## Modular monolith rules

Future modules must:

- keep their internal persistence private
- avoid direct imports of other modules' internal implementations
- expose only explicit contracts when cross-module collaboration becomes necessary
- avoid querying `professionals`, `services`, or `professional_services` directly outside `catalog`
- avoid querying availability tables directly outside `availability`
- avoid querying `appointments` directly outside the appointments module
