import { sql } from 'kysely';

export async function up(db) {
  await sql`
    create table professionals (
      id uuid primary key,
      name varchar(120) not null,
      bio varchar(1000) null,
      status varchar(16) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint professionals_name_trimmed_length_check
        check (char_length(btrim(name)) between 2 and 120),
      constraint professionals_status_check
        check (status in ('active', 'inactive'))
    )
  `.execute(db);

  await sql`
    create table services (
      id uuid primary key,
      name varchar(120) not null,
      description varchar(1000) null,
      duration_minutes integer not null,
      price_cents integer not null,
      status varchar(16) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint services_name_trimmed_length_check
        check (char_length(btrim(name)) between 2 and 120),
      constraint services_duration_minutes_check
        check (duration_minutes between 5 and 480),
      constraint services_price_cents_check
        check (price_cents between 0 and 10000000),
      constraint services_status_check
        check (status in ('active', 'inactive'))
    )
  `.execute(db);

  await sql`
    create table professional_services (
      professional_id uuid not null,
      service_id uuid not null,
      created_at timestamptz not null default now(),
      constraint professional_services_pkey
        primary key (professional_id, service_id),
      constraint professional_services_professional_id_fkey
        foreign key (professional_id)
        references professionals (id)
        on delete no action,
      constraint professional_services_service_id_fkey
        foreign key (service_id)
        references services (id)
        on delete no action
    )
  `.execute(db);

  await sql`
    create index professionals_status_name_id_idx
      on professionals (status, name, id)
  `.execute(db);

  await sql`
    create index professionals_name_id_idx
      on professionals (name, id)
  `.execute(db);

  await sql`
    create index services_status_name_id_idx
      on services (status, name, id)
  `.execute(db);

  await sql`
    create index services_name_id_idx
      on services (name, id)
  `.execute(db);

  await sql`
    create index professional_services_service_id_professional_id_idx
      on professional_services (service_id, professional_id)
  `.execute(db);
}

export async function down(db) {
  await sql`drop table if exists professional_services`.execute(db);
  await sql`drop table if exists services`.execute(db);
  await sql`drop table if exists professionals`.execute(db);
}
