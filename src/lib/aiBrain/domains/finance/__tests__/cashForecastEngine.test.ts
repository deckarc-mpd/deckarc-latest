import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCashForecast } from '../cashForecastEngine.ts';
import type { ReadinessPaymentMilestone, ReadinessVendorBill } from '../types.ts';

const TODAY = '2026-08-13';

function milestone(overrides: Partial<ReadinessPaymentMilestone>): ReadinessPaymentMilestone {
  return { id: 'm1', project_id: 'proj-1', milestone_name: 'Draw', amount: 10000, due_date: TODAY, status: 'Due', ...overrides };
}
function bill(overrides: Partial<ReadinessVendorBill>): ReadinessVendorBill {
  return { id: 'b1', project_id: 'proj-1', vendor_name: 'Ace Plumbing', due_date: TODAY, amount: 4000, status: 'Unpaid', dispute_notes: '', ...overrides };
}

test('nets expected inflows within the horizon against expected outflows', () => {
  const result = computeCashForecast(TODAY, 14, [milestone({ amount: 10000, due_date: '2026-08-20' })], [bill({ amount: 4000, due_date: '2026-08-18' })]);
  assert.equal(result.expectedInflows, 10000);
  assert.equal(result.expectedOutflows, 4000);
  assert.equal(result.netProjectedCash, 6000);
});

test('a milestone/bill due beyond the horizon is excluded', () => {
  const result = computeCashForecast(TODAY, 7, [milestone({ due_date: '2026-09-01' })], [bill({ due_date: '2026-09-01' })]);
  assert.equal(result.expectedInflows, 0);
  assert.equal(result.expectedOutflows, 0);
});

test('an already-overdue unpaid milestone still counts as expected cash', () => {
  const result = computeCashForecast(TODAY, 7, [milestone({ due_date: '2026-07-01', status: 'Overdue' })], []);
  assert.equal(result.expectedInflows, 10000);
});

test('paid milestones and paid bills never count', () => {
  const result = computeCashForecast(TODAY, 14, [milestone({ status: 'Paid' })], [bill({ status: 'Paid' })]);
  assert.equal(result.expectedInflows, 0);
  assert.equal(result.expectedOutflows, 0);
});

test('a negative net projected cash is representable — no clamping to zero', () => {
  const result = computeCashForecast(TODAY, 14, [milestone({ amount: 1000 })], [bill({ amount: 5000 })]);
  assert.equal(result.netProjectedCash, -4000);
});
