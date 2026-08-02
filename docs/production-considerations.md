# Production Considerations

This repository is development-first in the current stage.

Future production work should address:

- runtime secret management
- reverse proxy and TLS
- HTTPS OIDC issuer and JWKS endpoints
- network policy between the API runtime and the identity provider
- operational visibility for JWKS fetch failures and key rotation
- backup and recovery
- stronger image provenance controls such as digest pinning
- production monitoring and alerting
- deployment topology
- reevaluation of the Fastify request logging deprecation path for version `6`

Current lifecycle behavior already includes a configurable graceful shutdown timeout through `SHUTDOWN_TIMEOUT_MS`.

Current booking-specific trade-offs:

- appointment creation validates one requested local start time rather than generating slots
- catalog and availability may change after validation and before the appointment insert
- the strong concurrency guarantee is limited to preventing double booking of `scheduled` appointments for the same professional
- appointment history is rendered from stored snapshots and the row `time_zone`, not from live catalog data or the current operational timezone
- no policy relative to the current clock blocks creating appointments in the past
