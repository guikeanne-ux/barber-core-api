# Database

## Foundation

The API uses:

- PostgreSQL `18`
- `pg` for pooling
- Kysely for typed SQL access

## Migrations

Production migrations are intentionally absent in this first delivery.

The real Kysely migration mechanism is still implemented and validated through disposable migration fixtures in integration tests. This proves the workflow without creating domain tables before domain modules exist.
