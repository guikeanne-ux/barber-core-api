import { sql, type Kysely } from 'kysely';

import type { DatabaseConnection } from '../../shared/database/database.js';
import type { CatalogDatabaseSchema } from '../catalog/catalog-types.js';
import type {
  AvailabilityRepository,
  StoredWeeklyAvailability,
} from './availability-repository.js';
import type {
  AvailabilityDatabase,
  AvailabilityDatabaseSchema,
  AvailabilityOverride,
  AvailabilityOverrideRow,
  AvailabilityPeriodMinutes,
  WeeklyAvailabilityWeekMinutes,
} from './availability-types.js';
import { WEEKDAY_NAMES, type WeekdayName } from './local-date.js';
import { formatTimeOfDay } from './time-of-day.js';

type AvailabilityStorageDatabase = AvailabilityDatabase &
  Kysely<CatalogDatabaseSchema & AvailabilityDatabaseSchema>;

function toIsoString(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function toLocalDateText(value: string | Date): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString().slice(0, 10);
}

function withOptionalUpdatedAt(
  week: WeeklyAvailabilityWeekMinutes,
  updatedAt: string | undefined,
): StoredWeeklyAvailability {
  return {
    week,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function createEmptyWeekMinutes(): WeeklyAvailabilityWeekMinutes {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

function weekdayToIso(weekday: WeekdayName): number {
  return WEEKDAY_NAMES.indexOf(weekday) + 1;
}

function isoToWeekday(weekday: number): WeekdayName {
  const resolved = WEEKDAY_NAMES[weekday - 1];
  if (!resolved) {
    throw new Error(`Invalid ISO weekday: ${String(weekday)}`);
  }

  return resolved;
}

function periodsEqual(
  left: readonly AvailabilityPeriodMinutes[],
  right: readonly AvailabilityPeriodMinutes[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (const [index, period] of left.entries()) {
    const matchingPeriod = right[index];
    if (matchingPeriod === undefined) {
      return false;
    }

    if (
      period.startMinute !== matchingPeriod.startMinute ||
      period.endMinute !== matchingPeriod.endMinute
    ) {
      return false;
    }
  }

  return true;
}

function weeksEqual(
  left: WeeklyAvailabilityWeekMinutes,
  right: WeeklyAvailabilityWeekMinutes,
): boolean {
  return WEEKDAY_NAMES.every((weekday) => periodsEqual(left[weekday], right[weekday]));
}

async function loadWeeklyAvailability(
  db: AvailabilityStorageDatabase,
  professionalId: string,
): Promise<StoredWeeklyAvailability> {
  const profile = await db
    .selectFrom('professional_availability_profiles')
    .select(['professional_id', 'weekly_updated_at'])
    .where('professional_id', '=', professionalId)
    .executeTakeFirst();

  const rows = await db
    .selectFrom('professional_weekly_periods')
    .select(['weekday', 'start_minute', 'end_minute'])
    .where('professional_id', '=', professionalId)
    .orderBy('weekday', 'asc')
    .orderBy('start_minute', 'asc')
    .orderBy('end_minute', 'asc')
    .execute();

  const week = createEmptyWeekMinutes();
  for (const row of rows) {
    week[isoToWeekday(row.weekday)].push({
      startMinute: row.start_minute,
      endMinute: row.end_minute,
    });
  }

  return {
    week,
    ...(profile?.weekly_updated_at ? { updatedAt: profile.weekly_updated_at.toISOString() } : {}),
  };
}

async function loadOverrideRows(
  db: AvailabilityStorageDatabase,
  professionalId: string,
  from: string,
  to: string,
): Promise<AvailabilityOverride[]> {
  const headers = await db
    .selectFrom('professional_availability_overrides')
    .selectAll()
    .where('professional_id', '=', professionalId)
    .where('local_date', '>=', from)
    .where('local_date', '<=', to)
    .orderBy('local_date', 'asc')
    .execute();

  if (headers.length === 0) {
    return [];
  }

  const periods = await db
    .selectFrom('professional_availability_override_periods')
    .selectAll()
    .where('professional_id', '=', professionalId)
    .where('local_date', '>=', from)
    .where('local_date', '<=', to)
    .orderBy('local_date', 'asc')
    .orderBy('start_minute', 'asc')
    .orderBy('end_minute', 'asc')
    .execute();

  const periodsByDate = new Map<string, AvailabilityPeriodMinutes[]>();
  for (const row of periods) {
    const localDate = toLocalDateText(row.local_date);
    const current = periodsByDate.get(localDate) ?? [];
    current.push({
      startMinute: row.start_minute,
      endMinute: row.end_minute,
    });
    periodsByDate.set(localDate, current);
  }

  return headers.map((row) => {
    const localDate = toLocalDateText(row.local_date);
    return mapOverride(row, periodsByDate.get(localDate) ?? []);
  });
}

function mapOverride(
  row: AvailabilityOverrideRow,
  periods: readonly AvailabilityPeriodMinutes[],
): AvailabilityOverride {
  if (row.mode === 'closed') {
    return {
      professionalId: row.professional_id,
      date: toLocalDateText(row.local_date),
      mode: 'closed',
      periods: [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  return {
    professionalId: row.professional_id,
    date: toLocalDateText(row.local_date),
    mode: 'custom',
    periods: periods.map((period) => ({
      start: formatTimeOfDay(period.startMinute),
      end: formatTimeOfDay(period.endMinute),
    })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createPostgresAvailabilityRepository(
  connection: DatabaseConnection,
): AvailabilityRepository {
  const db = connection.db as unknown as AvailabilityStorageDatabase;

  return {
    async getWeeklyAvailability(professionalId) {
      return loadWeeklyAvailability(db, professionalId);
    },

    async replaceWeeklyAvailability(professionalId, week) {
      return db.transaction().execute(async (trx) => {
        await trx
          .insertInto('professional_availability_profiles')
          .values({
            professional_id: professionalId,
          })
          .onConflict((builder) => builder.column('professional_id').doNothing())
          .execute();

        const profile = await trx
          .selectFrom('professional_availability_profiles')
          .selectAll()
          .where('professional_id', '=', professionalId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        const current = await loadWeeklyAvailability(
          trx as unknown as AvailabilityStorageDatabase,
          professionalId,
        );

        if (weeksEqual(current.week, week) && profile.weekly_updated_at !== null) {
          return current;
        }

        await trx
          .deleteFrom('professional_weekly_periods')
          .where('professional_id', '=', professionalId)
          .execute();

        const weeklyRows = WEEKDAY_NAMES.flatMap((weekday) =>
          week[weekday].map((period) => ({
            professional_id: professionalId,
            weekday: weekdayToIso(weekday),
            start_minute: period.startMinute,
            end_minute: period.endMinute,
          })),
        );

        if (weeklyRows.length > 0) {
          await trx.insertInto('professional_weekly_periods').values(weeklyRows).execute();
        }

        const updated = await trx
          .updateTable('professional_availability_profiles')
          .set({
            updated_at: sql<Date>`now()`,
            weekly_updated_at: sql<Date>`now()`,
          })
          .where('professional_id', '=', professionalId)
          .returning(['weekly_updated_at'])
          .executeTakeFirstOrThrow();

        return withOptionalUpdatedAt(week, toIsoString(updated.weekly_updated_at));
      });
    },

    async listOverrides(professionalId, from, to) {
      return loadOverrideRows(db, professionalId, from, to);
    },

    async upsertOverride(professionalId, input) {
      return db.transaction().execute(async (trx) => {
        await trx
          .insertInto('professional_availability_profiles')
          .values({
            professional_id: professionalId,
          })
          .onConflict((builder) => builder.column('professional_id').doNothing())
          .execute();

        await trx
          .selectFrom('professional_availability_profiles')
          .select('professional_id')
          .where('professional_id', '=', professionalId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        const currentHeader = await trx
          .selectFrom('professional_availability_overrides')
          .selectAll()
          .where('professional_id', '=', professionalId)
          .where('local_date', '=', input.date)
          .executeTakeFirst();

        const currentPeriodsRows = await trx
          .selectFrom('professional_availability_override_periods')
          .selectAll()
          .where('professional_id', '=', professionalId)
          .where('local_date', '=', input.date)
          .orderBy('start_minute', 'asc')
          .orderBy('end_minute', 'asc')
          .execute();

        const currentPeriods = currentPeriodsRows.map((row) => ({
          startMinute: row.start_minute,
          endMinute: row.end_minute,
        }));

        const nextPeriods = input.mode === 'custom' ? [...input.periods] : [];
        const isNoOp =
          currentHeader?.mode === input.mode && periodsEqual(currentPeriods, nextPeriods);

        if (isNoOp) {
          return mapOverride(currentHeader, currentPeriods);
        }

        let header: AvailabilityOverrideRow;

        if (currentHeader) {
          header = await trx
            .updateTable('professional_availability_overrides')
            .set({
              mode: input.mode,
              updated_at: sql<Date>`now()`,
            })
            .where('professional_id', '=', professionalId)
            .where('local_date', '=', input.date)
            .returningAll()
            .executeTakeFirstOrThrow();
        } else {
          header = await trx
            .insertInto('professional_availability_overrides')
            .values({
              professional_id: professionalId,
              local_date: input.date,
              mode: input.mode,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
        }

        await trx
          .deleteFrom('professional_availability_override_periods')
          .where('professional_id', '=', professionalId)
          .where('local_date', '=', input.date)
          .execute();

        if (input.mode === 'custom' && input.periods.length > 0) {
          await trx
            .insertInto('professional_availability_override_periods')
            .values(
              input.periods.map((period) => ({
                professional_id: professionalId,
                local_date: input.date,
                start_minute: period.startMinute,
                end_minute: period.endMinute,
              })),
            )
            .execute();
        }

        await trx
          .updateTable('professional_availability_profiles')
          .set({
            updated_at: sql<Date>`now()`,
          })
          .where('professional_id', '=', professionalId)
          .executeTakeFirst();

        return mapOverride(header, nextPeriods);
      });
    },

    async deleteOverride(professionalId, date) {
      await db.transaction().execute(async (trx) => {
        const profile = await trx
          .selectFrom('professional_availability_profiles')
          .select('professional_id')
          .where('professional_id', '=', professionalId)
          .executeTakeFirst();

        if (!profile) {
          return;
        }

        await trx
          .selectFrom('professional_availability_profiles')
          .select('professional_id')
          .where('professional_id', '=', professionalId)
          .forUpdate()
          .executeTakeFirstOrThrow();

        const deleted = await trx
          .deleteFrom('professional_availability_overrides')
          .where('professional_id', '=', professionalId)
          .where('local_date', '=', date)
          .returning('professional_id')
          .executeTakeFirst();

        if (!deleted) {
          return;
        }

        await trx
          .updateTable('professional_availability_profiles')
          .set({
            updated_at: sql<Date>`now()`,
          })
          .where('professional_id', '=', professionalId)
          .executeTakeFirst();
      });
    },
  };
}
