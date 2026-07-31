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

## Technical endpoints

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/auth/me`
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
