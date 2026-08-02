import { describe, expect, it } from 'vitest';

import {
  buildAppointmentInstants,
  buildListingRange,
  isAppointmentCoveredByAvailability,
  parseAppointmentDate,
  parseAppointmentStart,
  renderAppointmentLocalTime,
} from '../../src/modules/appointments/appointment-time.js';
import { AppointmentProblem } from '../../src/modules/appointments/appointment-errors.js';

function expectValidationError(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppointmentProblem);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  throw new Error('Expected validation error to be thrown.');
}

describe('appointment-time', () => {
  it('parses a valid strict local date', () => {
    expect(parseAppointmentDate('2026-08-10', '/date').toString()).toBe('2026-08-10');
  });

  it('rejects invalid local dates', () => {
    expectValidationError(() => parseAppointmentDate('2026-02-30', '/date'));
    expectValidationError(() => parseAppointmentDate('2026-8-10', '/date'));
  });

  it('parses a valid strict start time and rejects invalid formats including 24:00', () => {
    expect(parseAppointmentStart('09:30', '/start')).toMatchObject({
      hour: 9,
      minute: 30,
      startMinute: 570,
    });
    expectValidationError(() => parseAppointmentStart('24:00', '/start'));
    expectValidationError(() => parseAppointmentStart('9:00', '/start'));
  });

  it('converts local time into exact instants using elapsed real minutes', () => {
    const appointment = buildAppointmentInstants({
      date: '2026-08-10',
      start: '09:00',
      timeZone: 'America/Sao_Paulo',
      durationMinutes: 30,
    });

    expect(appointment.startMinute).toBe(540);
    expect(appointment.endMinute).toBe(570);
    expect(appointment.endsAt.epochMilliseconds - appointment.startsAt.epochMilliseconds).toBe(
      30 * 60 * 1000,
    );
  });

  it('renders end=24:00 when the appointment ends exactly on the next local day boundary', () => {
    const appointment = buildAppointmentInstants({
      date: '2026-08-10',
      start: '23:30',
      timeZone: 'America/Sao_Paulo',
      durationMinutes: 30,
    });

    expect(appointment.endMinute).toBe(1440);
    expect(
      renderAppointmentLocalTime({
        startsAt: appointment.startsAt.toString(),
        endsAt: appointment.endsAt.toString(),
        timeZone: 'America/Sao_Paulo',
      }),
    ).toEqual({
      date: '2026-08-10',
      start: '23:30',
      end: '24:00',
    });
  });

  it('marks intervals beyond the next local day boundary as invalid for coverage', () => {
    const appointment = buildAppointmentInstants({
      date: '2026-08-10',
      start: '23:30',
      timeZone: 'America/Sao_Paulo',
      durationMinutes: 31,
    });

    expect(appointment.endMinute).toBe(-1);
  });

  it('rejects nonexistent and ambiguous DST local times deterministically', () => {
    expectValidationError(() =>
      buildAppointmentInstants({
        date: '2026-03-08',
        start: '02:30',
        timeZone: 'America/New_York',
        durationMinutes: 30,
      }),
    );

    expectValidationError(() =>
      buildAppointmentInstants({
        date: '2026-11-01',
        start: '01:30',
        timeZone: 'America/New_York',
        durationMinutes: 30,
      }),
    );
  });

  it('builds listing boundaries with an exclusive end range and a maximum of 31 dates', () => {
    const range = buildListingRange({
      from: '2026-08-01',
      to: '2026-08-31',
      timeZone: 'America/Sao_Paulo',
    });

    expect(range.rangeEndExclusive.epochMilliseconds).toBeGreaterThan(
      range.rangeStart.epochMilliseconds,
    );
    expectValidationError(() =>
      buildListingRange({
        from: '2026-08-01',
        to: '2026-09-01',
        timeZone: 'America/Sao_Paulo',
      }),
    );
  });

  it('validates availability coverage using local minutes, including adjacent periods and 24:00', () => {
    expect(
      isAppointmentCoveredByAvailability({
        startMinute: 690,
        endMinute: 750,
        periods: [
          { start: '09:00', end: '12:00' },
          { start: '12:00', end: '15:00' },
        ],
      }),
    ).toBe(true);

    expect(
      isAppointmentCoveredByAvailability({
        startMinute: 690,
        endMinute: 810,
        periods: [
          { start: '09:00', end: '12:00' },
          { start: '13:00', end: '18:00' },
        ],
      }),
    ).toBe(false);

    expect(
      isAppointmentCoveredByAvailability({
        startMinute: 1410,
        endMinute: 1440,
        periods: [{ start: '22:00', end: '24:00' }],
      }),
    ).toBe(true);
  });
});
