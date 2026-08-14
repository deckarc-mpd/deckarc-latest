import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultScheduleConfig,
  localDateString,
  localTimeString,
  localWeekday,
  isBusinessDay,
  isProjectEligibleForSweep,
  isWithinSweepWindow,
} from '../schedulingConfig.ts';

// 2026-08-12T16:00:00Z is a Wednesday in both America/New_York (12:00 EDT)
// and America/Los_Angeles (09:00 PDT) — verified independently via node's
// Intl before writing these assertions, not assumed.
const WEDNESDAY = new Date('2026-08-12T16:00:00Z');
const SATURDAY = new Date('2026-08-15T16:00:00Z');
const SUNDAY = new Date('2026-08-16T16:00:00Z');

test('localDateString and localTimeString convert the same instant differently per timezone', () => {
  assert.equal(localDateString(WEDNESDAY, 'America/New_York'), '2026-08-12');
  assert.equal(localTimeString(WEDNESDAY, 'America/New_York'), '12:00');
  assert.equal(localTimeString(WEDNESDAY, 'America/Los_Angeles'), '09:00');
});

test('localWeekday: 0=Sunday..6=Saturday, used to gate the weekly Sales Pipeline Hygiene sweep to a specific day', () => {
  assert.equal(localWeekday(WEDNESDAY, 'America/New_York'), 3);
  assert.equal(localWeekday(SATURDAY, 'America/New_York'), 6);
  assert.equal(localWeekday(SUNDAY, 'America/New_York'), 0);
});

test('isBusinessDay: an ordinary weekday is a business day', () => {
  const config = defaultScheduleConfig('company-1', 'America/New_York');
  assert.equal(isBusinessDay(WEDNESDAY, config), true);
});

test('isBusinessDay: Saturday/Sunday are excluded by default, included only when explicitly allowed', () => {
  const config = defaultScheduleConfig('company-1', 'America/New_York');
  assert.equal(isBusinessDay(SATURDAY, config), false);
  assert.equal(isBusinessDay(SUNDAY, config), false);

  const weekendConfig = { ...config, allowSaturdayWork: true, allowSundayWork: true };
  assert.equal(isBusinessDay(SATURDAY, weekendConfig), true);
  assert.equal(isBusinessDay(SUNDAY, weekendConfig), true);
});

test('isBusinessDay: a company holiday excludes an otherwise-ordinary weekday', () => {
  const config = { ...defaultScheduleConfig('company-1', 'America/New_York'), holidayDates: ['2026-08-12'] };
  assert.equal(isBusinessDay(WEDNESDAY, config), false);
});

test('isProjectEligibleForSweep: excludes terminal/paused statuses, includes active ones', () => {
  const config = defaultScheduleConfig('company-1');
  assert.equal(isProjectEligibleForSweep({ status: 'In Progress' }, config), true);
  assert.equal(isProjectEligibleForSweep({ status: 'Completed' }, config), false);
  assert.equal(isProjectEligibleForSweep({ status: 'On Hold' }, config), false);
  assert.equal(isProjectEligibleForSweep({ status: 'Cancelled' }, config), false);
});

test('isProjectEligibleForSweep: a company can configure its own exclusion list', () => {
  const config = { ...defaultScheduleConfig('company-1'), excludedProjectStatuses: ['Planning'] };
  assert.equal(isProjectEligibleForSweep({ status: 'Planning' }, config), false);
  assert.equal(isProjectEligibleForSweep({ status: 'Completed' }, config), true); // no longer excluded for THIS company
});

test('isWithinSweepWindow: matches at the exact target local time, in the company timezone', () => {
  const config = defaultScheduleConfig('company-1', 'America/New_York');
  assert.equal(isWithinSweepWindow(WEDNESDAY, config, '12:00'), true);

  const laConfig = defaultScheduleConfig('company-1', 'America/Los_Angeles');
  assert.equal(isWithinSweepWindow(WEDNESDAY, laConfig, '09:00'), true);
  // Same instant, same target string, wrong timezone assumption -> should NOT match LA's 09:00 as if it were NY's.
  assert.equal(isWithinSweepWindow(WEDNESDAY, laConfig, '12:00'), false);
});

test('isWithinSweepWindow: matches within the configured window, not outside it', () => {
  const config = defaultScheduleConfig('company-1', 'America/New_York');
  assert.equal(isWithinSweepWindow(WEDNESDAY, config, '12:15', 30), true); // 15 min away, window 30
  assert.equal(isWithinSweepWindow(WEDNESDAY, config, '13:00', 30), false); // 60 min away, window 30
});

test('isWithinSweepWindow: never matches on a non-business day, regardless of time', () => {
  const config = defaultScheduleConfig('company-1', 'America/New_York');
  assert.equal(isWithinSweepWindow(SATURDAY, config, '12:00'), false);
});
