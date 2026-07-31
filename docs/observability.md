# Observability

The foundation uses Fastify with Pino for structured JSON logging.

## Request identification

The API uses header:

```text
x-request-id
```

If the incoming value is not a valid UUID, the API generates one with `crypto.randomUUID()`.

## Log redaction

Sensitive fields are redacted, including:

- authorization
- cookie
- set-cookie
- password
- token
- secret
- client secret
