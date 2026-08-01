import { sql } from 'kysely';

export async function up(db) {
  await sql`
    create table professional_availability_profiles (
      professional_id uuid primary key,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      weekly_updated_at timestamptz null,
      constraint professional_availability_profiles_professional_id_fkey
        foreign key (professional_id)
        references professionals (id)
        on delete no action
    )
  `.execute(db);

  await sql`
    create table professional_weekly_periods (
      professional_id uuid not null,
      weekday smallint not null,
      start_minute smallint not null,
      end_minute smallint not null,
      constraint professional_weekly_periods_pkey
        primary key (professional_id, weekday, start_minute, end_minute),
      constraint professional_weekly_periods_professional_id_fkey
        foreign key (professional_id)
        references professional_availability_profiles (professional_id)
        on delete cascade,
      constraint professional_weekly_periods_weekday_check
        check (weekday between 1 and 7),
      constraint professional_weekly_periods_start_minute_check
        check (start_minute between 0 and 1439),
      constraint professional_weekly_periods_end_minute_check
        check (end_minute between 1 and 1440),
      constraint professional_weekly_periods_start_before_end_check
        check (start_minute < end_minute),
      constraint professional_weekly_periods_minimum_duration_check
        check (end_minute - start_minute >= 5)
    )
  `.execute(db);

  await sql`
    create table professional_availability_overrides (
      professional_id uuid not null,
      local_date date not null,
      mode varchar(16) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint professional_availability_overrides_pkey
        primary key (professional_id, local_date),
      constraint professional_availability_overrides_professional_id_fkey
        foreign key (professional_id)
        references professional_availability_profiles (professional_id)
        on delete cascade,
      constraint professional_availability_overrides_mode_check
        check (mode in ('closed', 'custom'))
    )
  `.execute(db);

  await sql`
    create table professional_availability_override_periods (
      professional_id uuid not null,
      local_date date not null,
      start_minute smallint not null,
      end_minute smallint not null,
      constraint professional_availability_override_periods_pkey
        primary key (professional_id, local_date, start_minute, end_minute),
      constraint professional_availability_override_periods_override_fkey
        foreign key (professional_id, local_date)
        references professional_availability_overrides (professional_id, local_date)
        on delete cascade,
      constraint professional_availability_override_periods_start_minute_check
        check (start_minute between 0 and 1439),
      constraint professional_availability_override_periods_end_minute_check
        check (end_minute between 1 and 1440),
      constraint professional_availability_override_periods_start_before_end_check
        check (start_minute < end_minute),
      constraint professional_availability_override_periods_minimum_duration_check
        check (end_minute - start_minute >= 5)
    )
  `.execute(db);

  await sql`
    create index professional_weekly_periods_professional_weekday_start_idx
      on professional_weekly_periods (professional_id, weekday, start_minute)
  `.execute(db);

  await sql`
    create index professional_availability_override_periods_professional_date_start_idx
      on professional_availability_override_periods (professional_id, local_date, start_minute)
  `.execute(db);
}

export async function down(db) {
  await sql`drop table if exists professional_availability_override_periods`.execute(db);
  await sql`drop table if exists professional_availability_overrides`.execute(db);
  await sql`drop table if exists professional_weekly_periods`.execute(db);
  await sql`drop table if exists professional_availability_profiles`.execute(db);
}
