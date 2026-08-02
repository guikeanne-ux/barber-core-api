# Local Development

## Requirements

- Node.js `24.18.0`
- npm
- Docker

## Setup

```bash
cp .env.example .env
npm ci
```

Key local variables:

- `CORS_ORIGIN=http://localhost:5173`
- `SHUTDOWN_TIMEOUT_MS=10000`
- `BUSINESS_TIME_ZONE=America/Sao_Paulo`
- `OIDC_ISSUER_URL=http://localhost:8080/realms/barber`
- `OIDC_JWKS_URL=http://localhost:8080/realms/barber/protocol/openid-connect/certs`
- `OIDC_AUDIENCE=barber-core-api`

## Run locally

```bash
npm run dev
```

When protected routes receive a token and the configured JWKS endpoint is unavailable, the API returns `503 IDENTITY_PROVIDER_UNAVAILABLE`. Startup itself does not require Keycloak to be reachable.

Once a JWKS key has already been resolved and cached for a known `kid`, the API can continue validating tokens signed with that cached key during a temporary JWKS outage. Tokens signed with a new `kid` still fail with `503` until the JWKS endpoint becomes reachable again.

## Run the containerized environment

```bash
npm run docker:up
npm run smoke
```

The Docker smoke flow starts an ephemeral JWKS fixture on the host during `npm run smoke`. It does not require a real Keycloak container, does not version private keys, and validates authenticated availability operations against the running API container.

During the smoke run, the script:

- starts the temporary JWKS fixture on the host at `http://127.0.0.1:18080`
- recreates only the `api` container with temporary OIDC values pointing to `http://host.docker.internal:18080/realms/barber`
- confirms the effective `OIDC_ISSUER_URL`, `OIDC_JWKS_URL`, and `OIDC_AUDIENCE` inside the container before the authenticated probe
- exercises catalog creation, weekly configuration, one appointment conflict, one cancellation, and one rebooking in the same interval

This temporary OIDC configuration exists only for the smoke execution. To return the API container to the normal local development configuration backed by `barber-identity`, run:

```bash
npm run docker:up
```

## Technical endpoints

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/auth/me`
- `POST /api/v1/professionals`
- `GET /api/v1/professionals`
- `POST /api/v1/services`
- `GET /api/v1/services`
- `GET /api/v1/professionals/:professionalId/availability/weekly`
- `PUT /api/v1/professionals/:professionalId/availability/weekly`
- `GET /api/v1/professionals/:professionalId/availability/overrides`
- `PUT /api/v1/professionals/:professionalId/availability/overrides/:date`
- `DELETE /api/v1/professionals/:professionalId/availability/overrides/:date`
- `GET /api/v1/professionals/:professionalId/availability/resolved`
- `POST /api/v1/appointments`
- `GET /api/v1/appointments`
- `GET /api/v1/appointments/:appointmentId`
- `POST /api/v1/appointments/:appointmentId/cancel`
- `GET /docs`
- `GET /docs/json`

## Manual authenticated check

If `barber-identity` is running and you have a local access token:

```bash
export BARBER_ACCESS_TOKEN='<token-local>'
curl \
  --fail-with-body \
  --header "Authorization: Bearer ${BARBER_ACCESS_TOKEN}" \
  http://localhost:3000/api/v1/auth/me
unset BARBER_ACCESS_TOKEN
```

## Reset the Docker environment

```bash
npm run docker:reset
```
