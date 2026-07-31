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

Current public codes:

- `AUTHENTICATION_REQUIRED`
- `INVALID_ACCESS_TOKEN`
- `INSUFFICIENT_PERMISSIONS`
- `IDENTITY_PROVIDER_UNAVAILABLE`

`401` responses include:

```text
WWW-Authenticate: Bearer
```

The API does not expose raw JWT claims, stack traces, verification internals, or JWKS payload details in public error responses.
