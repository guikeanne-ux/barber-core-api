import { availabilityValidationError } from './availability-errors.js';

export interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export type WeekdayName =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const WEEKDAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const satisfies readonly WeekdayName[];

const LOCAL_DATE_PATTERN = /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])$/;

function invalidDate(field: string, message: string) {
  return availabilityValidationError('One or more request fields are invalid.', [
    {
      field,
      message,
      code: 'invalid',
    },
  ]);
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function assertValidLocalDate(date: LocalDate): void {
  if (date.month < 1 || date.month > 12) {
    throw new Error('Invalid month.');
  }

  const monthDays = daysInMonth(date.year, date.month);
  if (date.day < 1 || date.day > monthDays) {
    throw new Error('Invalid day.');
  }
}

export function parseLocalDate(value: string, field: string): LocalDate {
  const match = LOCAL_DATE_PATTERN.exec(value);
  const yearText = match?.groups?.year;
  const monthText = match?.groups?.month;
  const dayText = match?.groups?.day;

  if (!yearText || !monthText || !dayText) {
    throw invalidDate(field, 'Date must use strict YYYY-MM-DD format.');
  }

  const date: LocalDate = {
    year: Number.parseInt(yearText, 10),
    month: Number.parseInt(monthText, 10),
    day: Number.parseInt(dayText, 10),
  };

  try {
    assertValidLocalDate(date);
  } catch {
    throw invalidDate(field, 'Date must be a real calendar date.');
  }

  return date;
}

function toUtcDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function fromUtcDate(value: Date): LocalDate {
  const date = {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };

  assertValidLocalDate(date);
  return date;
}

export function formatLocalDate(date: LocalDate): string {
  assertValidLocalDate(date);
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(
    date.day,
  ).padStart(2, '0')}`;
}

export function compareLocalDates(left: LocalDate, right: LocalDate): number {
  const leftText = formatLocalDate(left);
  const rightText = formatLocalDate(right);

  return leftText.localeCompare(rightText);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) {
    throw new Error('Days must be an integer.');
  }

  const utcDate = toUtcDate(date);
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return fromUtcDate(utcDate);
}

export function countInclusiveDays(from: LocalDate, to: LocalDate): number {
  const diffMs = toUtcDate(to).getTime() - toUtcDate(from).getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

export function getIsoWeekday(date: LocalDate): number {
  const weekday = toUtcDate(date).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function getWeekdayName(date: LocalDate): WeekdayName {
  return WEEKDAY_NAMES[getIsoWeekday(date) - 1] ?? 'monday';
}

export function assertValidBusinessTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error(
        'Environment variable BUSINESS_TIME_ZONE must be a valid IANA time zone identifier.',
      );
    }

    throw error;
  }

  return timeZone;
}
