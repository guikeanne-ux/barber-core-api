import type {
  AvailabilityOverride,
  AvailabilityPeriodMinutes,
  WeeklyAvailabilityWeekMinutes,
} from './availability-types.js';

export interface StoredWeeklyAvailability {
  readonly week: WeeklyAvailabilityWeekMinutes;
  readonly updatedAt?: string;
}

export interface AvailabilityRepository {
  getWeeklyAvailability(professionalId: string): Promise<StoredWeeklyAvailability>;
  replaceWeeklyAvailability(
    professionalId: string,
    week: WeeklyAvailabilityWeekMinutes,
  ): Promise<StoredWeeklyAvailability>;
  listOverrides(professionalId: string, from: string, to: string): Promise<AvailabilityOverride[]>;
  upsertOverride(
    professionalId: string,
    input:
      | {
          date: string;
          mode: 'closed';
        }
      | {
          date: string;
          mode: 'custom';
          periods: readonly AvailabilityPeriodMinutes[];
        },
  ): Promise<AvailabilityOverride>;
  deleteOverride(professionalId: string, date: string): Promise<void>;
}
