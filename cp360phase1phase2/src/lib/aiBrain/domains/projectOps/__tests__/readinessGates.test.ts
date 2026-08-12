import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFieldProgressGate,
  checkDependencyGate,
  checkSubcontractorGate,
  checkMaterialsGate,
  assessTomorrowReadiness,
} from '../readinessGates.ts';
import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
} from '../types.ts';

const TOMORROW = '2026-08-13';

function task(overrides: Partial<ReadinessTask>): ReadinessTask {
  return {
    id: 't1',
    project_id: 'p1',
    task_name: 'Task',
    status: 'Not Started',
    planned_start_date: null,
    projected_start_date: null,
    dependency_task_id: null,
    schedule_locked: false,
    blocked_reason: '',
    ...overrides,
  };
}

// ─── Field Progress Gate ────────────────────────────────────────────────────

test('field progress: an In Progress task with a recent, clean update is ready', () => {
  const t = task({ id: 't1', task_name: 'Framing', status: 'In Progress' });
  const update: ReadinessDailyUpdate = {
    id: 'u1', project_id: 'p1', task_id: 't1', update_date: '2026-08-12',
    current_status: 'On track', blockers: '', delay_reason: '', delay_days: 0,
    materials_pending: '', weather_issue: '',
  };
  const result = checkFieldProgressGate(TOMORROW, [t], [update]);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.findings, []);
});

test('field progress: an In Progress task with no recent update is not_ready', () => {
  const t = task({ id: 't1', task_name: 'Framing', status: 'In Progress' });
  const result = checkFieldProgressGate(TOMORROW, [t], []);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /no daily update/);
});

test('field progress: a stale update (older than 3 days) counts as missing', () => {
  const t = task({ id: 't1', task_name: 'Framing', status: 'In Progress' });
  const staleUpdate: ReadinessDailyUpdate = {
    id: 'u1', project_id: 'p1', task_id: 't1', update_date: '2026-08-08', // 5 days before TOMORROW
    current_status: 'ok', blockers: '', delay_reason: '', delay_days: 0,
    materials_pending: '', weather_issue: '',
  };
  const result = checkFieldProgressGate(TOMORROW, [t], [staleUpdate]);
  assert.equal(result.status, 'not_ready');
});

test('field progress: a reported blocker or delay makes the gate not_ready even with a fresh update', () => {
  const t = task({ id: 't1', task_name: 'Electrical Rough-In', status: 'In Progress' });
  const update: ReadinessDailyUpdate = {
    id: 'u1', project_id: 'p1', task_id: 't1', update_date: '2026-08-12',
    current_status: 'blocked', blockers: 'Panel not accessible, HOA lock on gate',
    delay_reason: '', delay_days: 1, materials_pending: '', weather_issue: '',
  };
  const result = checkFieldProgressGate(TOMORROW, [t], [update]);
  assert.equal(result.status, 'not_ready');
  assert.equal(result.findings.length, 2); // one for delay, one for blocker text
});

test('field progress: tasks that are not In Progress are ignored entirely', () => {
  const t = task({ id: 't1', status: 'Completed' });
  const result = checkFieldProgressGate(TOMORROW, [t], []);
  assert.equal(result.status, 'ready');
});

// ─── Dependency Gate ────────────────────────────────────────────────────────

test('dependency: a task starting tomorrow with a completed predecessor is ready', () => {
  const predecessor = task({ id: 'pred', task_name: 'Foundation', status: 'Completed' });
  const dependent = task({ id: 'dep', task_name: 'Framing', dependency_task_id: 'pred', planned_start_date: TOMORROW });
  const result = checkDependencyGate(TOMORROW, [predecessor, dependent]);
  assert.equal(result.status, 'ready');
});

test('dependency: a task starting tomorrow with an incomplete predecessor is not_ready', () => {
  const predecessor = task({ id: 'pred', task_name: 'Foundation', status: 'In Progress' });
  const dependent = task({ id: 'dep', task_name: 'Framing', dependency_task_id: 'pred', projected_start_date: TOMORROW });
  const result = checkDependencyGate(TOMORROW, [predecessor, dependent]);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /waiting on "Foundation"/);
});

test('dependency: a task with no dependency is always ready regardless of other tasks', () => {
  const t = task({ id: 't1', planned_start_date: TOMORROW, dependency_task_id: null });
  const result = checkDependencyGate(TOMORROW, [t]);
  assert.equal(result.status, 'ready');
});

test('dependency: a task not starting tomorrow is not evaluated even if its dependency is incomplete', () => {
  const predecessor = task({ id: 'pred', status: 'In Progress' });
  const dependent = task({ id: 'dep', dependency_task_id: 'pred', planned_start_date: '2026-09-01' });
  const result = checkDependencyGate(TOMORROW, [predecessor, dependent]);
  assert.equal(result.status, 'ready');
});

// ─── Subcontractor Gate ─────────────────────────────────────────────────────

function confirmation(overrides: Partial<ReadinessCrewConfirmation>): ReadinessCrewConfirmation {
  return {
    id: 'c1', project_id: 'p1', task_id: null, scheduled_date: TOMORROW,
    confirmation_status: 'Confirmed', crew_available: true, start_time_confirmed: true,
    site_access_confirmed: true, ...overrides,
  };
}

test('subcontractor: a fully confirmed crew is ready', () => {
  const result = checkSubcontractorGate(TOMORROW, [confirmation({})]);
  assert.equal(result.status, 'ready');
});

test('subcontractor: a pending confirmation is not_ready', () => {
  const result = checkSubcontractorGate(TOMORROW, [confirmation({ confirmation_status: 'Pending' })]);
  assert.equal(result.status, 'not_ready');
});

test('subcontractor: confirmed status but unconfirmed site access is still not_ready', () => {
  const result = checkSubcontractorGate(TOMORROW, [confirmation({ site_access_confirmed: false })]);
  assert.equal(result.status, 'not_ready');
  assert.match(result.findings[0], /site access not confirmed/);
});

test('subcontractor: confirmations for other dates are ignored', () => {
  const result = checkSubcontractorGate(TOMORROW, [confirmation({ scheduled_date: '2026-09-01', confirmation_status: 'Cannot Attend' })]);
  assert.equal(result.status, 'ready');
});

// ─── Materials Gate ─────────────────────────────────────────────────────────

function material(overrides: Partial<ReadinessMaterial>): ReadinessMaterial {
  return {
    id: 'm1', project_id: 'p1', related_task_id: null, material_name: 'Lumber',
    material_ready_status: 'Ready', expected_delivery_date: TOMORROW, ...overrides,
  };
}

test('materials: a ready delivery due tomorrow is ready', () => {
  const result = checkMaterialsGate(TOMORROW, [], [material({})]);
  assert.equal(result.status, 'ready');
});

test('materials: a delayed delivery due tomorrow is not_ready', () => {
  const result = checkMaterialsGate(TOMORROW, [], [material({ material_ready_status: 'Delayed' })]);
  assert.equal(result.status, 'not_ready');
});

test('materials: a material linked to a task starting tomorrow is checked even without a matching delivery date', () => {
  const t = task({ id: 't1', planned_start_date: TOMORROW });
  const m = material({ related_task_id: 't1', expected_delivery_date: null, material_ready_status: 'Not Ready' });
  const result = checkMaterialsGate(TOMORROW, [t], [m]);
  assert.equal(result.status, 'not_ready');
});

test('materials: unrelated materials with unrelated dates are ignored', () => {
  const m = material({ expected_delivery_date: '2026-09-01', material_ready_status: 'Not Ready' });
  const result = checkMaterialsGate(TOMORROW, [], [m]);
  assert.equal(result.status, 'ready');
});

// ─── Rollup ──────────────────────────────────────────────────────────────────

test('assessTomorrowReadiness: all gates ready -> overall ready', () => {
  const result = assessTomorrowReadiness('p1', TOMORROW, [], [], [], []);
  assert.equal(result.overallStatus, 'ready');
  assert.equal(result.gates.length, 4);
});

test('assessTomorrowReadiness: dependency failure alone -> overall blocked', () => {
  const predecessor = task({ id: 'pred', status: 'Open' });
  const dependent = task({ id: 'dep', dependency_task_id: 'pred', planned_start_date: TOMORROW });
  const result = assessTomorrowReadiness('p1', TOMORROW, [predecessor, dependent], [], [], []);
  assert.equal(result.overallStatus, 'blocked');
});

test('assessTomorrowReadiness: only a materials failure -> overall at_risk, not blocked', () => {
  const m = material({ material_ready_status: 'Not Ready' });
  const result = assessTomorrowReadiness('p1', TOMORROW, [], [], [m], []);
  assert.equal(result.overallStatus, 'at_risk');
});

test('assessTomorrowReadiness: only a subcontractor failure -> overall at_risk', () => {
  const c = confirmation({ confirmation_status: 'Need Reschedule' });
  const result = assessTomorrowReadiness('p1', TOMORROW, [], [c], [], []);
  assert.equal(result.overallStatus, 'at_risk');
});
