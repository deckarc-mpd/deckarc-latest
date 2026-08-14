import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessFinanceReadiness } from '../financeAssessment.ts';
import type { ReadinessPaymentMilestone, ReadinessVendorBill } from '../types.ts';

const TODAY = '2026-08-13';

function milestone(overrides: Partial<ReadinessPaymentMilestone>): ReadinessPaymentMilestone {
  return { id: 'm1', project_id: 'proj-1', milestone_name: 'Draw', amount: 10000, due_date: TODAY, status: 'Not Due', ...overrides };
}
function bill(overrides: Partial<ReadinessVendorBill>): ReadinessVendorBill {
  return { id: 'b1', project_id: 'proj-1', vendor_name: 'Vendor', due_date: TODAY, amount: 1000, status: 'Unpaid', dispute_notes: '', ...overrides };
}

test('an entirely clean project rolls up to ready', () => {
  const result = assessFinanceReadiness('proj-1', TODAY, 200000, [], [], [{ id: 'c1', project_id: 'proj-1', category: 'Material', amount: 50000, source: 'material' }], []);
  assert.equal(result.overallStatus, 'ready');
  assert.ok(result.gates.every((g) => g.status === 'ready'));
});

test('a margin below the warning threshold rolls up to blocked', () => {
  const result = assessFinanceReadiness('proj-1', TODAY, 100000, [], [], [{ id: 'c1', project_id: 'proj-1', category: 'Labor', amount: 92000, source: 'labor' }], []);
  assert.equal(result.overallStatus, 'blocked');
  const marginGate = result.gates.find((g) => g.gate === 'margin')!;
  assert.equal(marginGate.status, 'not_ready');
});

test('negative projected cash rolls up to blocked', () => {
  const result = assessFinanceReadiness('proj-1', TODAY, 200000, [], [bill({ amount: 50000, due_date: '2026-08-15' })], [], []);
  assert.equal(result.overallStatus, 'blocked');
});

test('only billing/collections/ap findings roll up to at_risk, not blocked', () => {
  const result = assessFinanceReadiness('proj-1', TODAY, 200000, [milestone({ status: 'Due' })], [], [{ id: 'c1', project_id: 'proj-1', category: 'Material', amount: 1000, source: 'material' }], []);
  assert.equal(result.overallStatus, 'at_risk');
});

test('an unset contract amount never fabricates a margin risk', () => {
  const result = assessFinanceReadiness('proj-1', TODAY, null, [], [], [{ id: 'c1', project_id: 'proj-1', category: 'Material', amount: 99999999, source: 'material' }], []);
  const marginGate = result.gates.find((g) => g.gate === 'margin')!;
  assert.equal(marginGate.status, 'ready');
  assert.equal(result.margin.margin, null);
});

test('rows from a different project are excluded from every gate', () => {
  const result = assessFinanceReadiness('proj-1', TODAY, 200000, [milestone({ project_id: 'proj-2', status: 'Overdue', due_date: '2026-07-01' })], [bill({ project_id: 'proj-2' })], [], []);
  assert.equal(result.overallStatus, 'ready');
});
