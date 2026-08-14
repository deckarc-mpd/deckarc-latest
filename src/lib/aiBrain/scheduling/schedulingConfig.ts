// Company-configurable scheduling per Frozen §11/§20: timezone, business
// calendar/holidays, and project-status exclusions must never be hardcoded.
// Pure, dependency-free (native Intl for timezone math — no new package,
// per ADR-CP360-AI-002) so it can be fully unit tested without a live DB
// or a live clock. The caller (the cron entrypoint) is responsible for
// loading the raw config from Supabase and the current wall-clock time;
// everything here is a pure function of its inputs.

export interface CompanyScheduleConfig {
  companyId: string;
  /** IANA timezone name, e.g. 'America/New_York'. */
  timezone: string;
  allowSaturdayWork: boolean;
  allowSundayWork: boolean;
  /** YYYY-MM-DD holiday dates observed by this company (from us_holidays, optionally company-extended). */
  holidayDates: string[];
  /** projects.status values that make a project ineligible for any sweep. */
  excludedProjectStatuses: string[];
}

export const DEFAULT_EXCLUDED_PROJECT_STATUSES = ['Completed', 'Cancelled', 'Archived', 'On Hold'];

export function defaultScheduleConfig(companyId: string, timezone = 'America/New_York'): CompanyScheduleConfig {
  return {
    companyId,
    timezone,
    allowSaturdayWork: false,
    allowSundayWork: false,
    holidayDates: [],
    excludedProjectStatuses: [...DEFAULT_EXCLUDED_PROJECT_STATUSES],
  };
}

/** YYYY-MM-DD for `instant` as observed in `timezone`, independent of server-local time. */
export function localDateString(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** HH:mm for `instant` as observed in `timezone`. */
export function localTimeString(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

/** 0 = Sunday .. 6 = Saturday, as observed in `timezone`. */
export function localWeekday(instant: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(instant);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday];
}

export function isBusinessDay(instant: Date, config: CompanyScheduleConfig): boolean {
  const dow = localWeekday(instant, config.timezone);
  if (dow === 0 && !config.allowSundayWork) return false;
  if (dow === 6 && !config.allowSaturdayWork) return false;
  if (config.holidayDates.includes(localDateString(instant, config.timezone))) return false;
  return true;
}

export function isProjectEligibleForSweep(
  project: { status: string },
  config: CompanyScheduleConfig
): boolean {
  return !config.excludedProjectStatuses.includes(project.status);
}

/**
 * True when `instant`, converted into the company's timezone, falls within
 * `windowMinutes` minutes of `targetLocalTime` ('HH:mm'). The underlying
 * cron trigger may fire more often (or less often, e.g. an hourly Vercel
 * Cron on a plan that disallows finer granularity) than each named cadence
 * in CP360_SCHEDULED_OPERATING_EVENTS.md — this is what lets a single
 * coarse platform trigger still hit every company's per-timezone cadence
 * correctly, per that doc's §2 "Minimum interval / granularity" note.
 */
export function isWithinSweepWindow(
  instant: Date,
  config: CompanyScheduleConfig,
  targetLocalTime: string,
  windowMinutes = 30
): boolean {
  if (!isBusinessDay(instant, config)) return false;

  const [targetH, targetM] = targetLocalTime.split(':').map(Number);
  const targetMinutesOfDay = targetH * 60 + targetM;

  const nowLocal = localTimeString(instant, config.timezone);
  const [nowH, nowM] = nowLocal.split(':').map(Number);
  const nowMinutesOfDay = nowH * 60 + nowM;

  return Math.abs(nowMinutesOfDay - targetMinutesOfDay) <= windowMinutes;
}
