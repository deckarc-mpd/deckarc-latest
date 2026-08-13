import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCostsByCategory, computeProjectMargin, MARGIN_WARNING_PERCENT } from '../marginCostEngine.ts';
import type { ReadinessCostEntry, ReadinessChangeOrder } from '../types.ts';

function costEntry(overrides: Partial<ReadinessCostEntry>): ReadinessCostEntry {
  return { id: 'c1', project_id: 'proj-1', category: 'Material', amount: 1000, source: 'material', ...overrides };
}
function changeOrder(overrides: Partial<ReadinessChangeOrder>): ReadinessChangeOrder {
  return { id: 'co1', project_id: 'proj-1', cost_impact: 5000, approval_status: 'Approved', ...overrides };
}

test('cost tracking: sums total and breaks down by category', () => {
  const summary = summarizeCostsByCategory('proj-1', [
    costEntry({ category: 'Material', amount: 1000 }),
    costEntry({ id: 'c2', category: 'Labor', amount: 2000, source: 'labor' }),
    costEntry({ id: 'c3', category: 'Material', amount: 500 }),
  ]);
  assert.equal(summary.totalCost, 3500);
  assert.deepEqual(summary.byCategory, { Material: 1500, Labor: 2000 });
});

test('cost tracking: excludes entries from a different project', () => {
  const summary = summarizeCostsByCategory('proj-1', [costEntry({ project_id: 'proj-2' })]);
  assert.equal(summary.totalCost, 0);
});

test('margin engine: revenue is contract amount plus APPROVED change orders only', () => {
  const result = computeProjectMargin('proj-1', 100000, [
    changeOrder({ cost_impact: 5000, approval_status: 'Approved' }),
    changeOrder({ id: 'co2', cost_impact: 3000, approval_status: 'Draft' }),
  ], [costEntry({ amount: 60000 })]);
  assert.equal(result.totalRevenue, 105000); // 100000 + 5000 approved only
  assert.equal(result.totalCost, 60000);
  assert.equal(result.margin, 45000);
  assert.ok(result.marginPercent && Math.abs(result.marginPercent - (45000 / 105000) * 100) < 0.001);
});

test('margin engine: an unset contract amount leaves margin null, not a fabricated number', () => {
  const result = computeProjectMargin('proj-1', null, [], [costEntry({ amount: 1000 })]);
  assert.equal(result.totalRevenue, null);
  assert.equal(result.margin, null);
  assert.equal(result.marginPercent, null);
});

test('MARGIN_WARNING_PERCENT is a named, documented threshold', () => {
  assert.equal(typeof MARGIN_WARNING_PERCENT, 'number');
});
