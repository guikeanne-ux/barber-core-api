# Error Handling

The API returns Problem Details with content type:

```text
application/problem+json
```

Each error includes:

- `type`
- `title`
- `status`
- `detail`
- `instance`
- `code`
- `requestId`

Validation errors may also include a sanitized `errors` array.

## Authentication and authorization statuses

Protected routes may also return:

- `401 Unauthorized`
- `403 Forbidden`
- `503 Service Unavailable`

Unexpected internal failures continue to use:

- `500 Internal Server Error`

Current public codes:

- `AUTHENTICATION_REQUIRED`
- `INVALID_ACCESS_TOKEN`
- `INSUFFICIENT_PERMISSIONS`
- `IDENTITY_PROVIDER_UNAVAILABLE`
- `VALIDATION_ERROR`
- `PROFESSIONAL_NOT_FOUND`
- `SERVICE_NOT_FOUND`
- `AVAILABILITY_RANGE_TOO_LARGE`

`401` responses include:

```text
WWW-Authenticate: Bearer
```

The API does not expose raw JWT claims, stack traces, verification internals, or JWKS payload details in public error responses.

Authentication verification failures are classified as:

- `401` for missing credentials, malformed bearer tokens, invalid signatures, invalid claims, and tokens without a matching key after a valid JWKS lookup
- `503` for known identity-provider operational failures such as timeout, unreachable JWKS endpoint, HTTP error responses, and invalid JWKS payloads
- `500` for unexpected internal defects outside the known authentication failure categories

Catalog routes keep domain-specific classification narrow:

- `400` only for explicit validation failures
- `404` only for missing professionals or services
- `500` for unexpected persistence or application defects

Availability routes follow the same public format:

- `400` for invalid dates, invalid times, overlapping periods, ranges above the documented limits, and malformed payloads
- `404` only for missing professionals
- `500` for unexpected persistence or application defects
