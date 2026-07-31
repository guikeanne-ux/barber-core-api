# Migrations

This directory intentionally contains no production migration yet.

The first production migration will be added together with the first persistent business module.

Even without production migrations, the repository must still implement and validate the real Kysely migration mechanism. Integration tests use disposable migration fixtures against PostgreSQL started by Testcontainers to prove:

- migration `up`
- rollback
- deterministic order
- migrator metadata persistence
