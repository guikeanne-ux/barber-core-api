import type { Generated, Kysely, Selectable } from 'kysely';

import type { WeekdayName } from './local-date.js';

export interface AvailabilityPeriod {
  readonly start: string;
  readonly end: string;
}

export interface AvailabilityPeriodMinutes {
  readonly startMinute: number;
  readonly endMinute: number;
}

export type WeeklyAvailabilityWeek = Record<WeekdayName, AvailabilityPeriod[]>;
export type WeeklyAvailabilityWeekMinutes = Record<WeekdayName, AvailabilityPeriodMinutes[]>;

export interface WeeklyAvailability {
  readonly professionalId: string;
  readonly timeZone: string;
  readonly week: WeeklyAvailabilityWeek;
  readonly updatedAt?: string;
}

export interface AvailabilityOverrideBase {
  readonly professionalId: string;
  readonly date: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ClosedAvailabilityOverride extends AvailabilityOverrideBase {
  readonly mode: 'closed';
  readonly periods: [];
}

export interface CustomAvailabilityOverride extends AvailabilityOverrideBase {
  readonly mode: 'custom';
  readonly periods: AvailabilityPeriod[];
}

export type AvailabilityOverride = ClosedAvailabilityOverride | CustomAvailabilityOverride;

export interface AvailabilityOverridesList {
  readonly professionalId: string;
  readonly timeZone: string;
  readonly from: string;
  readonly to: string;
  readonly items: AvailabilityOverride[];
}

export interface ResolvedAvailabilityDayBase {
  readonly date: string;
  readonly weekday: WeekdayName;
  readonly periods: AvailabilityPeriod[];
}

export interface ResolvedAvailabilityWeeklyDay extends ResolvedAvailabilityDayBase {
  readonly source: 'weekly';
}

export interface ResolvedAvailabilityOverrideDay extends ResolvedAvailabilityDayBase {
  readonly source: 'override';
  readonly overrideMode: 'closed' | 'custom';
}

export type ResolvedAvailabilityDay =
  ResolvedAvailabilityWeeklyDay | ResolvedAvailabilityOverrideDay;

export interface ResolvedAvailability {
  readonly professionalId: string;
  readonly timeZone: string;
  readonly from: string;
  readonly to: string;
  readonly days: ResolvedAvailabilityDay[];
}

export interface ProfessionalAvailabilityProfileTable {
  readonly professional_id: string;
  readonly created_at: Generated<Date>;
  readonly updated_at: Generated<Date>;
  readonly weekly_updated_at: Date | null;
}

export interface ProfessionalWeeklyPeriodTable {
  readonly professional_id: string;
  readonly weekday: number;
  readonly start_minute: number;
  readonly end_minute: number;
}

export interface ProfessionalAvailabilityOverrideTable {
  readonly professional_id: string;
  readonly local_date: string | Date;
  readonly mode: 'closed' | 'custom';
  readonly created_at: Generated<Date>;
  readonly updated_at: Generated<Date>;
}

export interface ProfessionalAvailabilityOverridePeriodTable {
  readonly professional_id: string;
  readonly local_date: string | Date;
  readonly start_minute: number;
  readonly end_minute: number;
}

export interface AvailabilityDatabaseSchema {
  readonly professional_availability_profiles: ProfessionalAvailabilityProfileTable;
  readonly professional_weekly_periods: ProfessionalWeeklyPeriodTable;
  readonly professional_availability_overrides: ProfessionalAvailabilityOverrideTable;
  readonly professional_availability_override_periods: ProfessionalAvailabilityOverridePeriodTable;
}

export type AvailabilityDatabase = Kysely<AvailabilityDatabaseSchema>;
export type AvailabilityProfileRow = Selectable<ProfessionalAvailabilityProfileTable>;
export type AvailabilityOverrideRow = Selectable<ProfessionalAvailabilityOverrideTable>;
