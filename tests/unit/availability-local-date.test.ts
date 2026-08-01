import { describe, expect, it } from 'vitest';

import {
  addDays,
  assertValidBusinessTimeZone,
  compareLocalDates,
  countInclusiveDays,
  formatLocalDate,
  getIsoWeekday,
  getWeekdayName,
  isLeapYear,
  parseLocalDate,
} from '../../src/modules/availability/local-date.js';
import { AvailabilityProblem } from '../../src/modules/availability/availability-errors.js';

describe('availability local dates', () => {
  it('parses valid ISO local dates and formats them back', () => {
    const date = parseLocalDate('2028-02-29', '/date');
    expect(date).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(formatLocalDate(date)).toBe('2028-02-29');
  });

  it('rejects invalid or non-existent dates', () => {
    expect(() => parseLocalDate('2027-02-29', '/date')).toThrow(AvailabilityProblem);
    expect(() => parseLocalDate('2026-02-30', '/date')).toThrow(AvailabilityProblem);
    expect(() => parseLocalDate('2026-8-03', '/date')).toThrow(AvailabilityProblem);
    expect(() => parseLocalDate('2026-08-03T10:00:00Z', '/date')).toThrow(AvailabilityProblem);
  });

  it('handles leap years, month rollover, year rollover, comparisons, and inclusive counts', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(formatLocalDate(addDays(parseLocalDate('2026-08-31', '/from'), 1))).toBe('2026-09-01');
    expect(formatLocalDate(addDays(parseLocalDate('2026-12-31', '/from'), 1))).toBe('2027-01-01');
    expect(
      compareLocalDates(parseLocalDate('2026-08-03', '/a'), parseLocalDate('2026-08-04', '/b')),
    ).toBeLessThan(0);
    expect(
      countInclusiveDays(
        parseLocalDate('2028-01-01', '/from'),
        parseLocalDate('2028-12-31', '/to'),
      ),
    ).toBe(366);
  });

  it('returns ISO weekdays deterministically', () => {
    const monday = parseLocalDate('2026-08-03', '/date');
    const friday = parseLocalDate('2026-08-07', '/date');
    expect(getIsoWeekday(monday)).toBe(1);
    expect(getWeekdayName(monday)).toBe('monday');
    expect(getIsoWeekday(friday)).toBe(5);
    expect(getWeekdayName(friday)).toBe('friday');
  });

  it('validates IANA business time zones', () => {
    expect(assertValidBusinessTimeZone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(() => assertValidBusinessTimeZone('Mars/Olympus_Mons')).toThrow(
      /BUSINESS_TIME_ZONE must be a valid IANA time zone identifier/,
    );
  });
});
