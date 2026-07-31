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
