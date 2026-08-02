import { describe, expect, it } from 'vitest';

import { mapAppointmentRepositoryError } from '../../src/modules/appointments/postgres-appointment-repository.js';

describe('mapAppointmentRepositoryError', () => {
  it('maps the known appointments exclusion constraint to APPOINTMENT_TIME_CONFLICT', () => {
    try {
      mapAppointmentRepositoryError({
        code: '23P01',
        constraint: 'appointments_professional_scheduled_time_excl',
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'APPOINTMENT_TIME_CONFLICT',
        statusCode: 409,
      });
      return;
    }

    throw new Error('Expected repository error mapping to throw.');
  });

  it('keeps unknown 23P01 constraint failures as INTERNAL_ERROR', () => {
    try {
      mapAppointmentRepositoryError({
        code: '23P01',
        constraint: 'another_exclusion_constraint',
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      });
      return;
    }

    throw new Error('Expected repository error mapping to throw.');
  });
});
