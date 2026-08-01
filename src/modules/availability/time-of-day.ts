import { availabilityValidationError } from './availability-errors.js';

export interface TimeOfDay {
  readonly value: string;
  readonly minuteOfDay: number;
}

const START_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

function parseTimeParts(value: string): { hour: number; minute: number } {
  const hour = Number.parseInt(value.slice(0, 2), 10);
  const minute = Number.parseInt(value.slice(3, 5), 10);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('Invalid time string.');
  }

  return { hour, minute };
}

function invalidTime(field: string, message: string) {
  return availabilityValidationError('One or more request fields are invalid.', [
    {
      field,
      message,
      code: 'invalid',
    },
  ]);
}

function parseTime(value: string, field: string, pattern: RegExp): TimeOfDay {
  if (!pattern.test(value)) {
    throw invalidTime(field, 'Time must use HH:mm with zero padding and minute precision only.');
  }

  const { hour, minute } = parseTimeParts(value);
  return {
    value,
    minuteOfDay: hour * 60 + minute,
  };
}

export function parseStartTime(value: string, field: string): TimeOfDay {
  if (value === '24:00') {
    throw invalidTime(field, '24:00 is allowed only as an end time.');
  }

  return parseTime(value, field, START_TIME_PATTERN);
}

export function parseEndTime(value: string, field: string): TimeOfDay {
  if (value === '24:00') {
    return {
      value,
      minuteOfDay: 1440,
    };
  }

  return parseTime(value, field, END_TIME_PATTERN);
}

export function formatTimeOfDay(minuteOfDay: number): string {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1440) {
    throw new Error('Minute of day must be an integer between 0 and 1440.');
  }

  if (minuteOfDay === 1440) {
    return '24:00';
  }

  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
