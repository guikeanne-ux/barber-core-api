# Migrations

This directory contains the current production migrations for the API.

The first business migration creates the `professionals`, `services`, and `professional_services` tables owned by the `catalog` module.

Integration tests still validate the real Kysely migration mechanism against disposable PostgreSQL instances from Testcontainers, including:

- migration `up`
- rollback
- deterministic order
- migrator metadata persistence
- production catalog schema constraints and indexes
