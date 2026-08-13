import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findComparableProjects, computePricingRecommendation, MIN_COMPARABLES_FOR_RECOMMENDATION } from '../comparableHistory.ts';
import type { ReadinessCompletedProject, ReadinessCostEntry } from '../types.ts';

function project(overrides: Partial<ReadinessCompletedProject>): ReadinessCompletedProject {
  return { id: 'p1', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 100000, ...overrides };
}
test('finds only completed projects of the matching type with a known contract amount', () => {
  const projects = [
    project({ id: 'p1', status: 'Completed', project_type: 'Kitchen remodel' }),
    project({ id: 'p2', status: 'In Progress', project_type: 'Kitchen remodel' }),
    project({ id: 'p3', status: 'Completed', project_type: 'Bathroom remodel' }),
    project({ id: 'p4', status: 'Completed', project_type: 'Kitchen remodel', contract_amount: null }),
  ];
  const comparables = findComparableProjects('Kitchen remodel', projects, []);
  assert.equal(comparables.length, 1);
  assert.equal(comparables[0].projectId, 'p1');
});

test('sums cost entries per project and computes margin percent', () => {
  const projects = [project({ id: 'p1', contract_amount: 100000 })];
  const costs: ReadinessCostEntry[] = [
    { id: 'c1', project_id: 'p1', category: 'Material', amount: 40000, source: 'material' },
    { id: 'c2', project_id: 'p1', category: 'Labor', amount: 20000, source: 'labor' },
    { id: 'c3', project_id: 'p2', category: 'Material', amount: 99999, source: 'material' }, // different project — excluded
  ];
  const comparables = findComparableProjects('Kitchen remodel', projects, costs);
  assert.equal(comparables[0].totalCost, 60000);
  assert.equal(comparables[0].marginPercent, 40);
});

test('fewer than the minimum comparables never produces a recommendation', () => {
  const rec = computePricingRecommendation('Kitchen remodel', [{ projectId: 'p1', contractAmount: 100000, totalCost: 60000, marginPercent: 40 }]);
  assert.equal(rec.recommendedLow, null);
  assert.equal(rec.recommendedHigh, null);
  assert.ok(1 < MIN_COMPARABLES_FOR_RECOMMENDATION);
});

test('with enough comparables, recommends a range bounded by the real min/max, plus median and average margin', () => {
  const rec = computePricingRecommendation('Kitchen remodel', [
    { projectId: 'p1', contractAmount: 80000, totalCost: 60000, marginPercent: 25 },
    { projectId: 'p2', contractAmount: 100000, totalCost: 60000, marginPercent: 40 },
    { projectId: 'p3', contractAmount: 120000, totalCost: 80000, marginPercent: 33.3 },
  ]);
  assert.equal(rec.recommendedLow, 80000);
  assert.equal(rec.recommendedHigh, 120000);
  assert.equal(rec.medianContractAmount, 100000);
  assert.ok(rec.averageMarginPercent && Math.abs(rec.averageMarginPercent - (25 + 40 + 33.3) / 3) < 0.01);
});
