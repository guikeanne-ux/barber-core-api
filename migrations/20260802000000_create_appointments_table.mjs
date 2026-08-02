import { sql } from 'kysely';

export async function up(db) {
  await sql`create extension if not exists btree_gist`.execute(db);

  await sql`
    create table appointments (
      id uuid primary key,
      professional_id uuid not null,
      service_id uuid not null,
      professional_name text not null,
      service_name text not null,
      duration_minutes integer not null,
      price_cents integer not null,
      currency text not null,
      customer_name text not null,
      customer_phone text null,
      notes text null,
      time_zone text not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      status text not null,
      cancelled_at timestamptz null,
      cancellation_reason text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint appointments_professional_id_fkey
        foreign key (professional_id)
        references professionals (id)
        on delete no action,
      constraint appointments_service_id_fkey
        foreign key (service_id)
        references services (id)
        on delete no action,
      constraint appointments_ends_after_starts_check
        check (ends_at > starts_at),
      constraint appointments_duration_minutes_check
        check (duration_minutes between 5 and 480),
      constraint appointments_price_cents_check
        check (price_cents between 0 and 10000000),
      constraint appointments_currency_check
        check (currency = 'BRL'),
      constraint appointments_status_check
        check (status in ('scheduled', 'cancelled')),
      constraint appointments_professional_name_check
        check (char_length(btrim(professional_name)) between 2 and 120),
      constraint appointments_service_name_check
        check (char_length(btrim(service_name)) between 2 and 120),
      constraint appointments_customer_name_check
        check (char_length(btrim(customer_name)) between 2 and 120),
      constraint appointments_customer_phone_check
        check (customer_phone is null or char_length(btrim(customer_phone)) between 1 and 32),
      constraint appointments_notes_check
        check (notes is null or char_length(btrim(notes)) between 1 and 1000),
      constraint appointments_cancellation_reason_check
        check (
          cancellation_reason is null
          or char_length(btrim(cancellation_reason)) between 1 and 500
        ),
      constraint appointments_cancellation_state_check
        check (
          (
            status = 'scheduled'
            and cancelled_at is null
            and cancellation_reason is null
          )
          or (
            status = 'cancelled'
            and cancelled_at is not null
          )
        ),
      constraint appointments_professional_scheduled_time_excl
        exclude using gist (
          professional_id with =,
          tstzrange(starts_at, ends_at, '[)') with &&
        )
        where (status = 'scheduled')
    )
  `.execute(db);

  await sql`
    create index appointments_starts_at_id_idx
      on appointments (starts_at, id)
  `.execute(db);

  await sql`
    create index appointments_professional_id_starts_at_id_idx
      on appointments (professional_id, starts_at, id)
  `.execute(db);
}

export async function down(db) {
  await sql`drop table if exists appointments`.execute(db);
}
