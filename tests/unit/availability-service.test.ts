import { describe, expect, it, vi } from 'vitest';

import { AvailabilityProblem } from '../../src/modules/availability/availability-errors.js';
import { createAvailabilityService } from '../../src/modules/availability/availability-service.js';
import type { AvailabilityRepository } from '../../src/modules/availability/availability-repository.js';

function createRepositoryStub() {
  const getWeeklyAvailability = vi
    .fn<AvailabilityRepository['getWeeklyAvailability']>()
    .mockResolvedValue({
      week: {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
    });
  const replaceWeeklyAvailability = vi
    .fn<AvailabilityRepository['replaceWeeklyAvailability']>()
    .mockImplementation((_professionalId, week) =>
      Promise.resolve({
        week,
        updatedAt: '2026-08-01T12:00:00.000Z',
      }),
    );
  const listOverrides = vi.fn<AvailabilityRepository['listOverrides']>().mockResolvedValue([]);
  const upsertOverride = vi.fn<AvailabilityRepository['upsertOverride']>();
  const deleteOverride = vi
    .fn<AvailabilityRepository['deleteOverride']>()
    .mockResolvedValue(undefined);

  const repository: AvailabilityRepository = {
    getWeeklyAvailability,
    replaceWeeklyAvailability,
    listOverrides,
    upsertOverride,
    deleteOverride,
  };

  return {
    repository,
    getWeeklyAvailability,
    replaceWeeklyAvailability,
    listOverrides,
    upsertOverride,
    deleteOverride,
  };
}

function createWeeklyInput() {
  return {
    week: {
      monday: [
        { start: '13:00', end: '18:00' },
        { start: '09:00', end: '12:00' },
      ],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
  };
}

describe('availability service', () => {
  it('normalizes weekly periods before persisting and maps the response', async () => {
    const { repository, replaceWeeklyAvailability } = createRepositoryStub();
    const findProfessional = vi.fn().mockResolvedValue({ id: 'professional-1' });
    const service = createAvailabilityService({
      repository,
      findProfessionalAvailabilityReference: findProfessional,
      businessTimeZone: 'America/Sao_Paulo',
    });

    const result = await service.replaceWeeklyAvailability('professional-1', createWeeklyInput());

    expect(replaceWeeklyAvailability).toHaveBeenCalledWith('professional-1', {
      monday: [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 780, endMinute: 1080 },
      ],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
    expect(result).toMatchObject({
      professionalId: 'professional-1',
      timeZone: 'America/Sao_Paulo',
      updatedAt: '2026-08-01T12:00:00.000Z',
    });
    expect(result.week.monday).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '18:00' },
    ]);
  });

  it('rejects overlapping, duplicate, and too-short periods', async () => {
    const { repository } = createRepositoryStub();
    const service = createAvailabilityService({
      repository,
      findProfessionalAvailabilityReference: vi.fn().mockResolvedValue({ id: 'professional-1' }),
      businessTimeZone: 'America/Sao_Paulo',
    });

    await expect(
      service.replaceWeeklyAvailability('professional-1', {
        week: {
          monday: [
            { start: '09:00', end: '12:00' },
            { start: '11:00', end: '13:00' },
          ],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      }),
    ).rejects.toBeInstanceOf(AvailabilityProblem);

    await expect(
      service.replaceWeeklyAvailability('professional-1', {
        week: {
          monday: [{ start: '09:00', end: '09:04' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      }),
    ).rejects.toBeInstanceOf(AvailabilityProblem);

    await expect(
      service.replaceWeeklyAvailability('professional-1', {
        week: {
          monday: [
            { start: '09:00', end: '12:00' },
            { start: '09:00', end: '12:00' },
          ],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      }),
    ).rejects.toBeInstanceOf(AvailabilityProblem);
  });

  it('validates override payloads and forwards normalized periods', async () => {
    const { repository, upsertOverride } = createRepositoryStub();
    upsertOverride.mockResolvedValue({
      professionalId: 'professional-1',
      date: '2026-08-04',
      mode: 'custom',
      periods: [{ start: '10:00', end: '14:00' }],
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    });
    const service = createAvailabilityService({
      repository,
      findProfessionalAvailabilityReference: vi.fn().mockResolvedValue({ id: 'professional-1' }),
      businessTimeZone: 'America/Sao_Paulo',
    });

    const result = await service.upsertOverride('professional-1', '2026-08-04', {
      mode: 'custom',
      periods: [{ start: '10:00', end: '14:00' }],
    });

    expect(upsertOverride).toHaveBeenCalledWith('professional-1', {
      date: '2026-08-04',
      mode: 'custom',
      periods: [{ startMinute: 600, endMinute: 840 }],
    });
    expect(result.mode).toBe('custom');

    await expect(
      service.upsertOverride('professional-1', '2026-08-04', {
        mode: 'custom',
        periods: [],
      }),
    ).rejects.toBeInstanceOf(AvailabilityProblem);
  });

  it('lists overrides and resolves weekly and override days with bounded ranges', async () => {
    const { repository, getWeeklyAvailability, listOverrides } = createRepositoryStub();
    getWeeklyAvailability.mockResolvedValue({
      week: {
        monday: [{ startMinute: 540, endMinute: 720 }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
    });
    listOverrides.mockResolvedValue([
      {
        professionalId: 'professional-1',
        date: '2026-08-04',
        mode: 'closed',
        periods: [],
        createdAt: '2026-08-01T12:00:00.000Z',
        updatedAt: '2026-08-01T12:00:00.000Z',
      },
    ]);

    const service = createAvailabilityService({
      repository,
      findProfessionalAvailabilityReference: vi.fn().mockResolvedValue({ id: 'professional-1' }),
      businessTimeZone: 'America/Sao_Paulo',
    });

    const overrides = await service.listOverrides('professional-1', {
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(overrides.items).toHaveLength(1);

    const resolved = await service.resolveAvailability('professional-1', {
      from: '2026-08-03',
      to: '2026-08-04',
    });
    expect(resolved.days).toEqual([
      {
        date: '2026-08-03',
        weekday: 'monday',
        source: 'weekly',
        periods: [{ start: '09:00', end: '12:00' }],
      },
      {
        date: '2026-08-04',
        weekday: 'tuesday',
        source: 'override',
        overrideMode: 'closed',
        periods: [],
      },
    ]);

    await expect(
      service.resolveAvailability('professional-1', {
        from: '2026-08-03',
        to: '2026-09-03',
      }),
    ).rejects.toBeInstanceOf(AvailabilityProblem);
  });

  it('returns empty weekly resolution when there is no profile', async () => {
    const { repository } = createRepositoryStub();
    const service = createAvailabilityService({
      repository,
      findProfessionalAvailabilityReference: vi.fn().mockResolvedValue({ id: 'professional-1' }),
      businessTimeZone: 'America/Sao_Paulo',
    });

    const resolved = await service.resolveAvailability('professional-1', {
      from: '2026-08-03',
      to: '2026-08-03',
    });

    expect(resolved.days).toEqual([
      {
        date: '2026-08-03',
        weekday: 'monday',
        source: 'weekly',
        periods: [],
      },
    ]);
  });

  it('raises PROFESSIONAL_NOT_FOUND when the catalog collaboration returns null', async () => {
    const { repository } = createRepositoryStub();
    const service = createAvailabilityService({
      repository,
      findProfessionalAvailabilityReference: vi.fn().mockResolvedValue(null),
      businessTimeZone: 'America/Sao_Paulo',
    });

    await expect(service.getWeeklyAvailability('professional-1')).rejects.toMatchObject({
      code: 'PROFESSIONAL_NOT_FOUND',
    });
  });
});
