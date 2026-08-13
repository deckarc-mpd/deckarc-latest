import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTradeConfirmationCutoff,
  assessMaterialScheduleRisk,
  decideEscalation,
  assessTradeMaterialCoordination,
} from '../tradeMaterialCoordination.ts';
import type { ReadinessTask, ReadinessCrewConfirmation, ReadinessMaterial } from '../types.ts';

const TOMORROW = '2026-08-13';

function task(overrides: Partial<ReadinessTask>): ReadinessTask {
  return {
    id: 't1', project_id: 'p1', task_name: 'Task', status: 'Not Started',
    planned_start_date: null, projected_start_date: null, dependency_task_id: null,
    schedule_locked: false, blocked_reason: '', ...overrides,
  };
}

function confirmation(overrides: Partial<ReadinessCrewConfirmation>): ReadinessCrewConfirmation {
  return {
    id: 'c1', project_id: 'p1', task_id: null, scheduled_date: TOMORROW,
    confirmation_status: 'Confirmed', crew_available: true, start_time_confirmed: true,
    site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: '',
    ...overrides,
  };
}

function material(overrides: Partial<ReadinessMaterial>): ReadinessMaterial {
  return {
    id: 'm1', project_id: 'p1', related_task_id: null, material_name: 'Lumber',
    material_ready_status: 'Ready', expected_delivery_date: TOMORROW, ...overrides,
  };
}

// ─── Trade confirmation cutoff ──────────────────────────────────────────────

test('trade cutoff: a confirmed crew produces no issue', () => {
  const issues = checkTradeConfirmationCutoff(TOMORROW, [confirmation({})]);
  assert.equal(issues.length, 0);
});

test('trade cutoff: an unconfirmed crew past cutoff produces a structured issue', () => {
  const issues = checkTradeConfirmationCutoff(TOMORROW, [
    confirmation({ id: 'c-unconfirmed', confirmation_status: 'Need Reschedule', crew_available: false }),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].confirmationId, 'c-unconfirmed');
  assert.match(issues[0].reasons.join(', '), /Need Reschedule/);
  assert.match(issues[0].reasons.join(', '), /crew availability/);
});

test('trade cutoff: confirmations for a different date are ignored', () => {
  const issues = checkTradeConfirmationCutoff(TOMORROW, [
    confirmation({ scheduled_date: '2026-09-01', confirmation_status: 'Cannot Attend' }),
  ]);
  assert.equal(issues.length, 0);
});

// ─── Material schedule risk ─────────────────────────────────────────────────

test('material risk: a Not Started task with no delivery date at all is at risk', () => {
  const t = task({ id: 't1', planned_start_date: TOMORROW });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Not Ready', expected_delivery_date: null });
  const risks = assessMaterialScheduleRisk([t], [m]);
  assert.equal(risks.length, 1);
  assert.match(risks[0].reason, /no confirmed delivery date/);
});

test('material risk: delivery arriving on/after the task start date is at risk (no buffer)', () => {
  const t = task({ id: 't1', planned_start_date: TOMORROW });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Delayed', expected_delivery_date: TOMORROW });
  const risks = assessMaterialScheduleRisk([t], [m]);
  assert.equal(risks.length, 1);
});

test('material risk: delivery arriving well before the task starts is NOT at risk', () => {
  const t = task({ id: 't1', planned_start_date: '2026-08-20' });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Pending Delivery', expected_delivery_date: TOMORROW });
  const risks = assessMaterialScheduleRisk([t], [m]);
  assert.equal(risks.length, 0);
});

test('material risk: a Ready material is never at risk regardless of date', () => {
  const t = task({ id: 't1', planned_start_date: TOMORROW });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Ready', expected_delivery_date: null });
  const risks = assessMaterialScheduleRisk([t], [m]);
  assert.equal(risks.length, 0);
});

test('material risk: an In Progress task is never evaluated (that is Phase 2 territory)', () => {
  const t = task({ id: 't1', status: 'In Progress', planned_start_date: TOMORROW });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Not Ready', expected_delivery_date: null });
  const risks = assessMaterialScheduleRisk([t], [m]);
  assert.equal(risks.length, 0);
});

test('material risk: a task with no start date at all is skipped (nothing to compare against)', () => {
  const t = task({ id: 't1', planned_start_date: null, projected_start_date: null });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Not Ready', expected_delivery_date: null });
  const risks = assessMaterialScheduleRisk([t], [m]);
  assert.equal(risks.length, 0);
});

test('material risk: a multi-hop dependency chain is fully captured downstream', () => {
  const a = task({ id: 'a', task_name: 'A', planned_start_date: TOMORROW });
  const b = task({ id: 'b', task_name: 'B', dependency_task_id: 'a' });
  const c = task({ id: 'c', task_name: 'C', dependency_task_id: 'b' });
  const unrelated = task({ id: 'z', task_name: 'Unrelated', dependency_task_id: null });
  const m = material({ id: 'm1', related_task_id: 'a', material_ready_status: 'Not Ready', expected_delivery_date: null });

  const risks = assessMaterialScheduleRisk([a, b, c, unrelated], [m]);
  assert.equal(risks.length, 1);
  assert.deepEqual([...risks[0].downstreamImpactedTaskIds].sort(), ['b', 'c']);
});

// ─── Escalation decision ─────────────────────────────────────────────────────

test('decideEscalation: no issues at all -> not required', () => {
  const { required, reasons } = decideEscalation([], []);
  assert.equal(required, false);
  assert.deepEqual(reasons, []);
});

test('decideEscalation: any trade confirmation issue -> required', () => {
  const { required } = decideEscalation(
    [{ confirmationId: 'c1', taskId: null, confirmationStatus: 'Pending', reasons: ['status: Pending'] }],
    []
  );
  assert.equal(required, true);
});

test('decideEscalation: a material risk with downstream impact -> required', () => {
  const { required, reasons } = decideEscalation([], [
    { taskId: 't1', taskName: 'T1', materialId: 'm1', materialName: 'Lumber', materialStatus: 'Not Ready', expectedDeliveryDate: TOMORROW, reason: 'x', downstreamImpactedTaskIds: ['t2'] },
  ]);
  assert.equal(required, true);
  assert.match(reasons[0], /threatens 1 downstream/);
});

test('decideEscalation: a material risk with a known near-term date and NO downstream impact -> not required', () => {
  const { required } = decideEscalation([], [
    { taskId: 't1', taskName: 'T1', materialId: 'm1', materialName: 'Lumber', materialStatus: 'Partially Ready', expectedDeliveryDate: TOMORROW, reason: 'x', downstreamImpactedTaskIds: [] },
  ]);
  assert.equal(required, false);
});

test('decideEscalation: a material risk with NO known delivery date at all -> required even with no downstream impact', () => {
  const { required } = decideEscalation([], [
    { taskId: 't1', taskName: 'T1', materialId: 'm1', materialName: 'Lumber', materialStatus: 'Not Ready', expectedDeliveryDate: null, reason: 'x', downstreamImpactedTaskIds: [] },
  ]);
  assert.equal(required, true);
});

// ─── Integration ─────────────────────────────────────────────────────────────

test('assessTradeMaterialCoordination combines both checks into one result', () => {
  const t = task({ id: 't1', planned_start_date: TOMORROW });
  const m = material({ id: 'm1', related_task_id: 't1', material_ready_status: 'Not Ready', expected_delivery_date: null });
  const c = confirmation({ id: 'c1', confirmation_status: 'Cannot Attend' });

  const result = assessTradeMaterialCoordination('proj-1', TOMORROW, [t], [c], [m]);
  assert.equal(result.tradeConfirmationIssues.length, 1);
  assert.equal(result.materialScheduleRisks.length, 1);
  assert.equal(result.escalationRequired, true);
  assert.equal(result.escalationReasons.length, 2);
});
