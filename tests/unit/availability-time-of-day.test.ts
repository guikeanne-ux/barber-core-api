import { describe, expect, it } from 'vitest';

import { AvailabilityProblem } from '../../src/modules/availability/availability-errors.js';
import {
  formatTimeOfDay,
  parseEndTime,
  parseStartTime,
} from '../../src/modules/availability/time-of-day.js';

describe('availability time of day', () => {
  it('parses valid start and end times', () => {
    expect(parseStartTime('00:00', '/start')).toMatchObject({ minuteOfDay: 0 });
    expect(parseStartTime('09:30', '/start')).toMatchObject({ minuteOfDay: 570 });
    expect(parseStartTime('23:59', '/start')).toMatchObject({ minuteOfDay: 1439 });
    expect(parseEndTime('24:00', '/end')).toMatchObject({ minuteOfDay: 1440 });
  });

  it('rejects malformed, unpadded, spaced, or out-of-range values', () => {
    for (const value of ['9:00', '09:0', '09:00:00', ' 09:00', '09:00 ', '25:00', '09:60']) {
      expect(() => parseStartTime(value, '/start')).toThrow(AvailabilityProblem);
    }
  });

  it('rejects 24:00 as a start time', () => {
    expect(() => parseStartTime('24:00', '/start')).toThrow(AvailabilityProblem);
  });

  it('formats minute-of-day values back to HH:mm', () => {
    expect(formatTimeOfDay(0)).toBe('00:00');
    expect(formatTimeOfDay(570)).toBe('09:30');
    expect(formatTimeOfDay(1439)).toBe('23:59');
    expect(formatTimeOfDay(1440)).toBe('24:00');
  });
});
