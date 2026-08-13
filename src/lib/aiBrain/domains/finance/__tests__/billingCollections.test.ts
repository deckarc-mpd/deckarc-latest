import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyMilestonesDueForBilling, identifyCollectionsNeeded } from '../billingCollections.ts';
import type { ReadinessPaymentMilestone } from '../types.ts';

const TODAY = '2026-08-13';

function milestone(overrides: Partial<ReadinessPaymentMilestone>): ReadinessPaymentMilestone {
  return { id: 'm1', project_id: 'proj-1', milestone_name: 'Rough-in Draw', amount: 10000, due_date: TODAY, status: 'Not Due', ...overrides };
}

test('billing: a milestone in Due/Due Today status is ready to invoice', () => {
  const findings = identifyMilestonesDueForBilling([milestone({ status: 'Due' }), milestone({ id: 'm2', status: 'Due Today' })]);
  assert.equal(findings.length, 2);
});

test('billing: Not Due / Due Soon / Paid milestones are never surfaced', () => {
  const findings = identifyMilestonesDueForBilling([
    milestone({ status: 'Not Due' }), milestone({ id: 'm2', status: 'Due Soon' }), milestone({ id: 'm3', status: 'Paid' }),
  ]);
  assert.equal(findings.length, 0);
});

test('collections: an overdue, unpaid milestone is surfaced with correct days-overdue and bucket', () => {
  const findings = identifyCollectionsNeeded(TODAY, [milestone({ status: 'Overdue', due_date: '2026-07-20' })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].daysOverdue, 24);
  assert.equal(findings[0].bucket, 'overdue_1_30');
});

test('collections: aging buckets are correct at each boundary', () => {
  const f1 = identifyCollectionsNeeded(TODAY, [milestone({ due_date: '2026-07-14', status: 'Overdue' })]); // 30 days
  const f2 = identifyCollectionsNeeded(TODAY, [milestone({ due_date: '2026-07-13', status: 'Overdue' })]); // 31 days
  const f3 = identifyCollectionsNeeded(TODAY, [milestone({ due_date: '2026-06-13', status: 'Overdue' })]); // 61 days
  assert.equal(f1[0].bucket, 'overdue_1_30');
  assert.equal(f2[0].bucket, 'overdue_31_60');
  assert.equal(f3[0].bucket, 'overdue_61_plus');
});

test('collections: Paid/Waived milestones are never surfaced even if past due_date', () => {
  const findings = identifyCollectionsNeeded(TODAY, [milestone({ due_date: '2026-07-01', status: 'Paid' }), milestone({ id: 'm2', due_date: '2026-07-01', status: 'Waived' })]);
  assert.equal(findings.length, 0);
});

test('collections: a milestone due today or in the future is never overdue', () => {
  const findings = identifyCollectionsNeeded(TODAY, [milestone({ due_date: TODAY, status: 'Due Today' }), milestone({ id: 'm2', due_date: '2026-09-01', status: 'Not Due' })]);
  assert.equal(findings.length, 0);
});
