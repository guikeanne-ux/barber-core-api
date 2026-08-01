# Security

The current delivery secures the HTTP boundary with:

- security headers
- restricted CORS
- request validation
- body size limits
- no stack traces in responses
- no credentials in logs
- local JWT access-token validation through remote JWKS
- exact issuer and audience validation
- explicit algorithm allowlist
- no client secret in the API for user-token validation
- authenticated catalog routes with explicit read and write role checks
- authenticated availability routes with the same route-level role policy style

## Frontend origin

Initial allowed frontend origin:

```text
http://localhost:5173
```

## Token validation

Protected routes accept only:

```text
Authorization: Bearer <access-token>
```

The API validates:

- signature
- issuer
- audience
- expiration
- `nbf` when present
- required claims used to build the authenticated principal

The API does not use:

- per-request introspection
- Keycloak Admin REST for token validation
- user info as an authentication source
- a bypass variable for insecure HTTP in production

## OIDC configuration

Relevant variables:

- `OIDC_ISSUER_URL`
- `OIDC_JWKS_URL`
- `OIDC_AUDIENCE`
- `OIDC_CLOCK_TOLERANCE_SECONDS`
- `OIDC_JWKS_TIMEOUT_MS`
- `BUSINESS_TIME_ZONE`

`NODE_ENV=production` requires HTTPS for issuer and JWKS URLs. Local development remains explicitly non-production while the local Keycloak environment runs over HTTP.

## Current role matrix

- `admin` and `manager` can read and write catalog routes
- `barber` and `receptionist` can read catalog routes
- `admin` and `manager` can read and write availability routes
- `barber` and `receptionist` can read availability routes
- write attempts by `barber` or `receptionist` return `403`
