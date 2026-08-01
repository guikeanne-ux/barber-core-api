# Observability

The foundation uses Fastify with Pino for structured JSON logging.

## Request identification

The API uses header:

```text
x-request-id
```

If the incoming value is not a valid UUID, the API generates one with `crypto.randomUUID()`.

The same `requestId` is returned in Problem Details responses, including authentication and authorization failures.

## Log redaction

Sensitive fields are redacted, including:

- authorization
- cookie
- set-cookie
- password
- token
- secret
- client secret

Authentication logs also avoid recording:

- access tokens
- raw JWT claims
- usernames
- emails
- subjects
- full role arrays
- JWKS material

Catalog request logs should also avoid recording:

- professional names
- full `bio`
- full `description`
- service prices

Availability request logs should also avoid recording:

- full weekly payloads
- full override period arrays
- unnecessary repetition of date-range query payloads

## Auth result categories

Protected-route failures are logged with sanitized categories such as:

- `missing_credentials`
- `invalid_token`
- `expired_token`
- `not_yet_valid`
- `wrong_issuer`
- `wrong_audience`
- `insufficient_permissions`
- `jwks_unavailable`
- `jwks_timeout`
- `jwks_invalid_response`

Unexpected internal failures are logged with sanitized request context plus a bounded error name and message, while public responses remain generic `500 INTERNAL_ERROR` Problem Details.

## Shutdown logs

Graceful shutdown logs:

- received signal
- successful completion
- failure
- timeout before forced non-zero exit
