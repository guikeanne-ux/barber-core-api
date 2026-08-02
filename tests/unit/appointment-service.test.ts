/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import { createAppointmentService } from '../../src/modules/appointments/appointment-service.js';
import type { AppointmentRepository } from '../../src/modules/appointments/appointment-repository.js';
import type {
  AppointmentCatalogReference,
  AppointmentRow,
  ResolvedAvailabilityForAppointment,
} from '../../src/modules/appointments/appointment-types.js';

function createRepositoryStub(): AppointmentRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  };
}

function createCatalogReference(
  overrides: Partial<AppointmentCatalogReference> = {},
): AppointmentCatalogReference {
  return {
    professional: {
      id: '11111111-2222-4333-8444-555555555555',
      name: 'Ana Martins',
      status: 'active',
    },
    service: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      name: 'Corte',
      status: 'active',
      durationMinutes: 30,
      priceCents: 4500,
      currency: 'BRL',
    },
    professionalCanPerformService: true,
    ...overrides,
  };
}

function createCatalogReferenceWithoutProfessional(): AppointmentCatalogReference {
  const base = createCatalogReference();
  if (!base.service) {
    throw new Error('Expected service fixture.');
  }

  return {
    service: base.service,
    professionalCanPerformService: true,
  };
}

function createCatalogReferenceWithoutService(): AppointmentCatalogReference {
  const base = createCatalogReference();
  if (!base.professional) {
    throw new Error('Expected professional fixture.');
  }

  return {
    professional: base.professional,
    professionalCanPerformService: true,
  };
}

function createResolvedAvailability(
  overrides: Partial<ResolvedAvailabilityForAppointment> = {},
): ResolvedAvailabilityForAppointment {
  return {
    professionalId: '11111111-2222-4333-8444-555555555555',
    date: '2026-08-10',
    timeZone: 'America/Sao_Paulo',
    periods: [{ start: '09:00', end: '18:00' }],
    ...overrides,
  };
}

function createAppointmentRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'bbbbbbbb-2222-4333-8444-555555555555',
    professional_id: '11111111-2222-4333-8444-555555555555',
    service_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    professional_name: 'Ana Martins',
    service_name: 'Corte',
    duration_minutes: 30,
    price_cents: 4500,
    currency: 'BRL',
    customer_name: 'João da Silva',
    customer_phone: '+5548999999999',
    notes: 'Primeira visita',
    time_zone: 'America/Sao_Paulo',
    starts_at: new Date('2026-08-10T12:00:00.000Z'),
    ends_at: new Date('2026-08-10T12:30:00.000Z'),
    status: 'scheduled',
    cancelled_at: null,
    cancellation_reason: null,
    created_at: new Date('2026-08-01T12:00:00.000Z'),
    updated_at: new Date('2026-08-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('createAppointmentService', () => {
  it('creates an appointment with snapshots and normalized customer fields', async () => {
    const repository = createRepositoryStub();
    const created = createAppointmentRow();
    const findAppointmentCatalogReference = vi.fn().mockResolvedValue(createCatalogReference());
    const resolveAvailabilityForAppointment = vi
      .fn()
      .mockResolvedValue(createResolvedAvailability());
    vi.mocked(repository.create).mockResolvedValue(created);

    const service = createAppointmentService({
      repository,
      findAppointmentCatalogReference,
      resolveAvailabilityForAppointment,
      businessTimeZone: 'America/Sao_Paulo',
    });

    const result = await service.createAppointment({
      professionalId: '11111111-2222-4333-8444-555555555555',
      serviceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      date: '2026-08-10',
      start: '09:00',
      customerName: '  João da Silva  ',
      customerPhone: '  +5548999999999  ',
      notes: '  Primeira visita  ',
    });

    expect(result).toMatchObject({
      customerName: 'João da Silva',
      customerPhone: '+5548999999999',
      notes: 'Primeira visita',
      professionalName: 'Ana Martins',
      serviceName: 'Corte',
      status: 'scheduled',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        professionalName: 'Ana Martins',
        serviceName: 'Corte',
        customerName: 'João da Silva',
        customerPhone: '+5548999999999',
        notes: 'Primeira visita',
        timeZone: 'America/Sao_Paulo',
      }),
    );
  });

  it('rejects missing professional, service, inactive states, and missing capability', async () => {
    const repository = createRepositoryStub();
    const resolveAvailabilityForAppointment = vi
      .fn()
      .mockResolvedValue(createResolvedAvailability());

    const service = createAppointmentService({
      repository,
      findAppointmentCatalogReference: vi
        .fn()
        .mockResolvedValue(createCatalogReferenceWithoutProfessional()),
      resolveAvailabilityForAppointment,
      businessTimeZone: 'America/Sao_Paulo',
    });
    await expect(
      service.createAppointment({
        professionalId: 'p',
        serviceId: 's',
        date: '2026-08-10',
        start: '09:00',
        customerName: 'João da Silva',
      }),
    ).rejects.toMatchObject({ code: 'PROFESSIONAL_NOT_FOUND' });

    const serviceMissing = createAppointmentService({
      repository,
      findAppointmentCatalogReference: vi
        .fn()
        .mockResolvedValue(createCatalogReferenceWithoutService()),
      resolveAvailabilityForAppointment,
      businessTimeZone: 'America/Sao_Paulo',
    });
    await expect(
      serviceMissing.createAppointment({
        professionalId: 'p',
        serviceId: 's',
        date: '2026-08-10',
        start: '09:00',
        customerName: 'João da Silva',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_NOT_FOUND' });

    const inactiveProfessional = createAppointmentService({
      repository,
      findAppointmentCatalogReference: vi
        .fn()
        .mockResolvedValue(
          createCatalogReference({ professional: { id: 'p', name: 'Ana', status: 'inactive' } }),
        ),
      resolveAvailabilityForAppointment,
      businessTimeZone: 'America/Sao_Paulo',
    });
    await expect(
      inactiveProfessional.createAppointment({
        professionalId: 'p',
        serviceId: 's',
        date: '2026-08-10',
        start: '09:00',
        customerName: 'João da Silva',
      }),
    ).rejects.toMatchObject({ code: 'PROFESSIONAL_INACTIVE' });

    const capabilityMissing = createAppointmentService({
      repository,
      findAppointmentCatalogReference: vi
        .fn()
        .mockResolvedValue(createCatalogReference({ professionalCanPerformService: false })),
      resolveAvailabilityForAppointment,
      businessTimeZone: 'America/Sao_Paulo',
    });
    await expect(
      capabilityMissing.createAppointment({
        professionalId: 'p',
        serviceId: 's',
        date: '2026-08-10',
        start: '09:00',
        customerName: 'João da Silva',
      }),
    ).rejects.toMatchObject({ code: 'PROFESSIONAL_SERVICE_NOT_AVAILABLE' });
  });

  it('rejects appointments outside coverage and accepts exact 24:00 coverage', async () => {
    const repository = createRepositoryStub();
    const findAppointmentCatalogReference = vi.fn().mockResolvedValue(createCatalogReference());

    const outside = createAppointmentService({
      repository,
      findAppointmentCatalogReference,
      resolveAvailabilityForAppointment: vi.fn().mockResolvedValue(
        createResolvedAvailability({
          periods: [{ start: '22:00', end: '24:00' }],
        }),
      ),
      businessTimeZone: 'America/Sao_Paulo',
    });
    vi.mocked(repository.create).mockResolvedValue(
      createAppointmentRow({
        starts_at: new Date('2026-08-11T02:30:00.000Z'),
        ends_at: new Date('2026-08-11T03:00:00.000Z'),
      }),
    );

    await expect(
      outside.createAppointment({
        professionalId: 'p',
        serviceId: 's',
        date: '2026-08-10',
        start: '23:30',
        customerName: 'João da Silva',
      }),
    ).resolves.toBeDefined();

    const beyondMidnight = createAppointmentService({
      repository,
      findAppointmentCatalogReference: vi.fn().mockResolvedValue(
        (() => {
          const base = createCatalogReference();
          if (!base.service) {
            throw new Error('Expected service fixture.');
          }

          return createCatalogReference({
            service: {
              ...base.service,
              durationMinutes: 31,
            },
          });
        })(),
      ),
      resolveAvailabilityForAppointment: vi.fn().mockResolvedValue(
        createResolvedAvailability({
          periods: [{ start: '22:00', end: '24:00' }],
        }),
      ),
      businessTimeZone: 'America/Sao_Paulo',
    });

    vi.mocked(repository.create).mockResolvedValue(
      createAppointmentRow({
        starts_at: new Date('2026-08-11T02:30:00.000Z'),
        ends_at: new Date('2026-08-11T03:00:00.000Z'),
      }),
    );

    await expect(
      beyondMidnight.createAppointment({
        professionalId: 'p',
        serviceId: 's',
        date: '2026-08-10',
        start: '23:30',
        customerName: 'João da Silva',
      }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_OUTSIDE_AVAILABILITY' });
  });

  it('returns the persisted appointment unchanged on repeated cancellation and not found otherwise', async () => {
    const repository = createRepositoryStub();
    const current = createAppointmentRow({
      status: 'cancelled',
      cancelled_at: new Date('2026-08-01T13:00:00.000Z'),
      cancellation_reason: 'Cliente solicitou cancelamento.',
      updated_at: new Date('2026-08-01T13:00:00.000Z'),
    });
    vi.mocked(repository.cancel).mockResolvedValue(undefined);
    vi.mocked(repository.findById).mockResolvedValue(current);

    const service = createAppointmentService({
      repository,
      findAppointmentCatalogReference: vi.fn(),
      resolveAvailabilityForAppointment: vi.fn(),
      businessTimeZone: 'America/Sao_Paulo',
    });

    const result = await service.cancelAppointment(current.id, {
      reason: '  outra razão  ',
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Cliente solicitou cancelamento.',
    });

    vi.mocked(repository.findById).mockResolvedValueOnce(undefined);
    await expect(service.cancelAppointment('missing', {})).rejects.toMatchObject({
      code: 'APPOINTMENT_NOT_FOUND',
    });
  });
});
