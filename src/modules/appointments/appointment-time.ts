import { Temporal } from '@js-temporal/polyfill';

import { appointmentValidationError } from './appointment-errors.js';

function createFieldError(field: string, message: string, code = 'invalid') {
  return { field, message, code };
}

const DATE_PATTERN = /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])$/;
const START_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface AppointmentInstants {
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly startMinute: number;
  readonly endMinute: number;
}

export function parseAppointmentDate(value: string, field: string): Temporal.PlainDate {
  const match = DATE_PATTERN.exec(value);
  const year = match?.groups?.year;
  const month = match?.groups?.month;
  const day = match?.groups?.day;

  if (!year || !month || !day) {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(field, 'Date must use strict YYYY-MM-DD format.'),
    ]);
  }

  try {
    return Temporal.PlainDate.from(
      {
        year: Number.parseInt(year, 10),
        month: Number.parseInt(month, 10),
        day: Number.parseInt(day, 10),
      },
      { overflow: 'reject' },
    );
  } catch {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(field, 'Date must be a real calendar date.'),
    ]);
  }
}

export function parseAppointmentStart(
  value: string,
  field: string,
): { hour: number; minute: number; startMinute: number } {
  if (!START_PATTERN.test(value)) {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(field, 'Time must use HH:mm with zero padding and minute precision only.'),
    ]);
  }

  const hour = Number.parseInt(value.slice(0, 2), 10);
  const minute = Number.parseInt(value.slice(3, 5), 10);

  return {
    hour,
    minute,
    startMinute: hour * 60 + minute,
  };
}

function resolveDayStart(date: Temporal.PlainDate, timeZone: string, field: string) {
  try {
    return Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: date.year,
        month: date.month,
        day: date.day,
        hour: 0,
        minute: 0,
      },
      {
        overflow: 'reject',
        disambiguation: 'compatible',
      },
    ).toInstant();
  } catch {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(
        field,
        'Unable to resolve the local day boundary for the configured time zone.',
      ),
    ]);
  }
}

export function buildAppointmentInstants(input: {
  date: string;
  start: string;
  timeZone: string;
  durationMinutes: number;
}): AppointmentInstants {
  const localDate = parseAppointmentDate(input.date, '/date');
  const parsedStart = parseAppointmentStart(input.start, '/start');

  let startsAt: Temporal.Instant;
  try {
    startsAt = Temporal.ZonedDateTime.from(
      {
        timeZone: input.timeZone,
        year: localDate.year,
        month: localDate.month,
        day: localDate.day,
        hour: parsedStart.hour,
        minute: parsedStart.minute,
      },
      {
        overflow: 'reject',
        disambiguation: 'reject',
      },
    ).toInstant();
  } catch {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError(
        '/start',
        'The provided local date/time is invalid or ambiguous in the configured time zone.',
      ),
    ]);
  }

  const endsAt = startsAt.add({ minutes: input.durationMinutes });
  const nextLocalDayStart = resolveDayStart(localDate.add({ days: 1 }), input.timeZone, '/date');

  if (Temporal.Instant.compare(endsAt, nextLocalDayStart) > 0) {
    return {
      startsAt,
      endsAt,
      startMinute: parsedStart.startMinute,
      endMinute: -1,
    };
  }

  if (Temporal.Instant.compare(endsAt, nextLocalDayStart) === 0) {
    return {
      startsAt,
      endsAt,
      startMinute: parsedStart.startMinute,
      endMinute: 1440,
    };
  }

  const localEnd = endsAt.toZonedDateTimeISO(input.timeZone);
  return {
    startsAt,
    endsAt,
    startMinute: parsedStart.startMinute,
    endMinute: localEnd.hour * 60 + localEnd.minute,
  };
}

export function renderAppointmentLocalTime(input: {
  startsAt: string;
  endsAt: string;
  timeZone: string;
}): { date: string; start: string; end: string } {
  const start = Temporal.Instant.from(input.startsAt).toZonedDateTimeISO(input.timeZone);
  const end = Temporal.Instant.from(input.endsAt);
  const startDate = start.toPlainDate();
  const nextLocalDayStart = resolveDayStart(
    startDate.add({ days: 1 }),
    input.timeZone,
    '/timeZone',
  );

  const startText = `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`;

  if (Temporal.Instant.compare(end, nextLocalDayStart) === 0) {
    return {
      date: startDate.toString(),
      start: startText,
      end: '24:00',
    };
  }

  const localEnd = end.toZonedDateTimeISO(input.timeZone);
  return {
    date: startDate.toString(),
    start: startText,
    end: `${String(localEnd.hour).padStart(2, '0')}:${String(localEnd.minute).padStart(2, '0')}`,
  };
}

export function buildListingRange(input: { from: string; to: string; timeZone: string }): {
  rangeStart: Temporal.Instant;
  rangeEndExclusive: Temporal.Instant;
} {
  const from = parseAppointmentDate(input.from, '/from');
  const to = parseAppointmentDate(input.to, '/to');

  if (Temporal.PlainDate.compare(from, to) > 0) {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError('/', 'from must be less than or equal to to.'),
    ]);
  }

  if (from.until(to, { largestUnit: 'day' }).days + 1 > 31) {
    throw appointmentValidationError('One or more request fields are invalid.', [
      createFieldError('/', 'The date range must contain at most 31 dates.'),
    ]);
  }

  return {
    rangeStart: resolveDayStart(from, input.timeZone, '/from'),
    rangeEndExclusive: resolveDayStart(to.add({ days: 1 }), input.timeZone, '/to'),
  };
}

export function toAvailabilityMinute(value: string, field: string): number {
  if (value === '24:00') {
    return 1440;
  }

  return parseAppointmentStart(value, field).startMinute;
}

export function isAppointmentCoveredByAvailability(input: {
  startMinute: number;
  endMinute: number;
  periods: readonly { start: string; end: string }[];
}): boolean {
  const normalized = input.periods
    .map((period, index) => ({
      startMinute: toAvailabilityMinute(period.start, `/periods/${String(index)}/start`),
      endMinute: toAvailabilityMinute(period.end, `/periods/${String(index)}/end`),
    }))
    .sort(
      (left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute,
    );

  const merged: { startMinute: number; endMinute: number }[] = [];
  for (const period of normalized) {
    const current = merged.at(-1);
    if (!current) {
      merged.push({ ...period });
      continue;
    }

    if (period.startMinute === current.endMinute) {
      current.endMinute = period.endMinute;
      continue;
    }

    merged.push({ ...period });
  }

  return merged.some(
    (period) => input.startMinute >= period.startMinute && input.endMinute <= period.endMinute,
  );
}
