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
