import {
  availabilityProfessionalNotFound,
  availabilityValidationError,
} from './availability-errors.js';
import type { AvailabilityRepository } from './availability-repository.js';
import {
  addDays,
  compareLocalDates,
  countInclusiveDays,
  formatLocalDate,
  getWeekdayName,
  type LocalDate,
  parseLocalDate,
  type WeekdayName,
  WEEKDAY_NAMES,
} from './local-date.js';
import { formatTimeOfDay, parseEndTime, parseStartTime } from './time-of-day.js';
import type {
  AvailabilityOverride,
  AvailabilityPeriod,
  AvailabilityPeriodMinutes,
  AvailabilityOverridesList,
  ResolvedAvailability,
  ResolvedAvailabilityDay,
  WeeklyAvailability,
  WeeklyAvailabilityWeekMinutes,
} from './availability-types.js';
import type { FindProfessionalAvailabilityReference } from '../catalog/catalog-service.js';

export interface AvailabilityService {
  getWeeklyAvailability(professionalId: string): Promise<WeeklyAvailability>;
  replaceWeeklyAvailability(
    professionalId: string,
    input: { week: Record<WeekdayName, AvailabilityPeriod[]> },
  ): Promise<WeeklyAvailability>;
  listOverrides(
    professionalId: string,
    input: { from: string; to: string },
  ): Promise<AvailabilityOverridesList>;
  upsertOverride(
    professionalId: string,
    date: string,
    input:
      | { mode: 'closed'; periods?: AvailabilityPeriod[] }
      | { mode: 'custom'; periods?: AvailabilityPeriod[] },
  ): Promise<AvailabilityOverride>;
  deleteOverride(professionalId: string, date: string): Promise<void>;
  resolveAvailability(
    professionalId: string,
    input: { from: string; to: string },
  ): Promise<ResolvedAvailability>;
}

function toFieldError(field: string, message: string, code = 'invalid') {
  return { field, message, code };
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

function mapPeriods(periods: readonly AvailabilityPeriodMinutes[]): AvailabilityPeriod[] {
  return periods.map((period) => ({
    start: formatTimeOfDay(period.startMinute),
    end: formatTimeOfDay(period.endMinute),
  }));
}

function mapWeeklyAvailability(
  professionalId: string,
  timeZone: string,
  stored: {
    week: WeeklyAvailabilityWeekMinutes;
    updatedAt?: string;
  },
): WeeklyAvailability {
  return {
    professionalId,
    timeZone,
    week: {
      monday: mapPeriods(stored.week.monday),
      tuesday: mapPeriods(stored.week.tuesday),
      wednesday: mapPeriods(stored.week.wednesday),
      thursday: mapPeriods(stored.week.thursday),
      friday: mapPeriods(stored.week.friday),
      saturday: mapPeriods(stored.week.saturday),
      sunday: mapPeriods(stored.week.sunday),
    },
    ...(stored.updatedAt ? { updatedAt: stored.updatedAt } : {}),
  };
}

function validatePeriods(
  periods: readonly AvailabilityPeriod[],
  fieldPrefix: string,
  minimumItems: number,
): readonly AvailabilityPeriodMinutes[] {
  if (periods.length < minimumItems) {
    throw availabilityValidationError('One or more request fields are invalid.', [
      toFieldError(
        fieldPrefix,
        `At least ${String(minimumItems)} period(s) must be provided.`,
        'minItems',
      ),
    ]);
  }

  if (periods.length > 8) {
    throw availabilityValidationError('One or more request fields are invalid.', [
      toFieldError(fieldPrefix, 'A maximum of 8 periods is allowed.', 'maxItems'),
    ]);
  }

  const normalized = periods.map((period, index) => {
    const start = parseStartTime(period.start, `${fieldPrefix}/${String(index)}/start`);
    const end = parseEndTime(period.end, `${fieldPrefix}/${String(index)}/end`);

    if (start.minuteOfDay >= end.minuteOfDay) {
      throw availabilityValidationError('One or more request fields are invalid.', [
        toFieldError(`${fieldPrefix}/${String(index)}`, 'Each period must satisfy start < end.'),
      ]);
    }

    if (end.minuteOfDay - start.minuteOfDay < 5) {
      throw availabilityValidationError('One or more request fields are invalid.', [
        toFieldError(
          `${fieldPrefix}/${String(index)}`,
          'Each period must have a minimum duration of 5 minutes.',
        ),
      ]);
    }

    return {
      startMinute: start.minuteOfDay,
      endMinute: end.minuteOfDay,
    };
  });

  const ordered = [...normalized].sort(
    (left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index - 1];
    const next = ordered[index];
    if (!current || !next) {
      continue;
    }

    if (current.startMinute === next.startMinute && current.endMinute === next.endMinute) {
      throw availabilityValidationError('One or more request fields are invalid.', [
        toFieldError(fieldPrefix, 'Duplicate periods are not allowed.'),
      ]);
    }

    if (next.startMinute < current.endMinute) {
      throw availabilityValidationError('One or more request fields are invalid.', [
        toFieldError(fieldPrefix, 'Overlapping periods are not allowed.'),
      ]);
    }
  }

  return ordered;
}

function normalizeWeeklyWeek(
  week: Record<WeekdayName, AvailabilityPeriod[]>,
): WeeklyAvailabilityWeekMinutes {
  const normalized = createEmptyWeekMinutes();

  for (const weekday of WEEKDAY_NAMES) {
    normalized[weekday] = [...validatePeriods(week[weekday], `/week/${weekday}`, 0)];
  }

  return normalized;
}

function assertRange(from: LocalDate, to: LocalDate, maximumDays: number, fieldPrefix = '/'): void {
  if (compareLocalDates(from, to) > 0) {
    throw availabilityValidationError('One or more request fields are invalid.', [
      toFieldError(fieldPrefix, 'from must be less than or equal to to.'),
    ]);
  }

  const days = countInclusiveDays(from, to);
  if (days > maximumDays) {
    throw availabilityValidationError('One or more request fields are invalid.', [
      toFieldError(
        fieldPrefix,
        `The date range must contain at most ${String(maximumDays)} dates.`,
      ),
    ]);
  }
}

async function ensureProfessionalExists(
  findProfessionalAvailabilityReference: FindProfessionalAvailabilityReference,
  professionalId: string,
): Promise<void> {
  const reference = await findProfessionalAvailabilityReference(professionalId);
  if (!reference) {
    throw availabilityProfessionalNotFound();
  }
}

export function createAvailabilityService(input: {
  repository: AvailabilityRepository;
  findProfessionalAvailabilityReference: FindProfessionalAvailabilityReference;
  businessTimeZone: string;
}): AvailabilityService {
  return {
    async getWeeklyAvailability(professionalId) {
      await ensureProfessionalExists(input.findProfessionalAvailabilityReference, professionalId);
      const stored = await input.repository.getWeeklyAvailability(professionalId);
      return mapWeeklyAvailability(professionalId, input.businessTimeZone, stored);
    },

    async replaceWeeklyAvailability(professionalId, payload) {
      await ensureProfessionalExists(input.findProfessionalAvailabilityReference, professionalId);
      const week = normalizeWeeklyWeek(payload.week);
      const stored = await input.repository.replaceWeeklyAvailability(professionalId, week);
      return mapWeeklyAvailability(professionalId, input.businessTimeZone, stored);
    },

    async listOverrides(professionalId, query) {
      await ensureProfessionalExists(input.findProfessionalAvailabilityReference, professionalId);
      const from = parseLocalDate(query.from, '/from');
      const to = parseLocalDate(query.to, '/to');
      assertRange(from, to, 366, '/');

      return {
        professionalId,
        timeZone: input.businessTimeZone,
        from: formatLocalDate(from),
        to: formatLocalDate(to),
        items: await input.repository.listOverrides(professionalId, query.from, query.to),
      };
    },

    async upsertOverride(professionalId, date, payload) {
      await ensureProfessionalExists(input.findProfessionalAvailabilityReference, professionalId);
      const normalizedDate = formatLocalDate(parseLocalDate(date, '/date'));

      if (payload.mode === 'closed') {
        if (payload.periods !== undefined) {
          throw availabilityValidationError('One or more request fields are invalid.', [
            toFieldError('/periods', 'periods is not allowed when mode=closed.'),
          ]);
        }

        return input.repository.upsertOverride(professionalId, {
          date: normalizedDate,
          mode: 'closed',
        });
      }

      if (payload.periods === undefined) {
        throw availabilityValidationError('One or more request fields are invalid.', [
          toFieldError('/periods', 'periods is required when mode=custom.', 'required'),
        ]);
      }

      return input.repository.upsertOverride(professionalId, {
        date: normalizedDate,
        mode: 'custom',
        periods: validatePeriods(payload.periods, '/periods', 1),
      });
    },

    async deleteOverride(professionalId, date) {
      await ensureProfessionalExists(input.findProfessionalAvailabilityReference, professionalId);
      const normalizedDate = formatLocalDate(parseLocalDate(date, '/date'));
      await input.repository.deleteOverride(professionalId, normalizedDate);
    },

    async resolveAvailability(professionalId, query) {
      await ensureProfessionalExists(input.findProfessionalAvailabilityReference, professionalId);
      const from = parseLocalDate(query.from, '/from');
      const to = parseLocalDate(query.to, '/to');
      assertRange(from, to, 31, '/');

      const weekly = await input.repository.getWeeklyAvailability(professionalId);
      const overrides = await input.repository.listOverrides(professionalId, query.from, query.to);
      const overridesByDate = new Map(overrides.map((override) => [override.date, override]));
      const days: ResolvedAvailabilityDay[] = [];

      for (let current = from; compareLocalDates(current, to) <= 0; current = addDays(current, 1)) {
        const date = formatLocalDate(current);
        const weekday = getWeekdayName(current);
        const override = overridesByDate.get(date);

        if (override) {
          days.push({
            date,
            weekday,
            source: 'override',
            overrideMode: override.mode,
            periods: override.mode === 'closed' ? [] : [...override.periods],
          });
          continue;
        }

        days.push({
          date,
          weekday,
          source: 'weekly',
          periods: mapPeriods(weekly.week[weekday]),
        });
      }

      return {
        professionalId,
        timeZone: input.businessTimeZone,
        from: formatLocalDate(from),
        to: formatLocalDate(to),
        days,
      };
    },
  };
}
