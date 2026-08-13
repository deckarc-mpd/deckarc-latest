// Billing Service + Collections SOP (CODE tier, Frozen §5). Both read
// payment_milestones — DeckArc's only real AR table — and both are pure
// date/status math. No LLM anywhere in this file.

import type { ReadinessPaymentMilestone, BillingFinding, CollectionsFinding, AgingBucket } from './types.ts';

const BILLING_READY_STATUSES = new Set(['Due', 'Due Today']);
const CLOSED_STATUSES = new Set(['Paid', 'Waived']);

function daysBetween(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00Z`).getTime();
  const b = new Date(`${later}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** Billing Service: which milestones have reached their due status and should be invoiced now. */
export function identifyMilestonesDueForBilling(milestones: ReadinessPaymentMilestone[]): BillingFinding[] {
  return milestones
    .filter((m) => BILLING_READY_STATUSES.has(m.status))
    .map((m) => ({ milestoneId: m.id, milestoneName: m.milestone_name, amount: m.amount, dueDate: m.due_date ?? '' }));
}

function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'overdue_1_30';
  if (daysOverdue <= 60) return 'overdue_31_60';
  return 'overdue_61_plus';
}

/** Collections SOP: overdue, unpaid milestones with AR-aging buckets — never sends anything, only identifies. */
export function identifyCollectionsNeeded(asOfDate: string, milestones: ReadinessPaymentMilestone[]): CollectionsFinding[] {
  const findings: CollectionsFinding[] = [];
  for (const m of milestones) {
    if (CLOSED_STATUSES.has(m.status)) continue;
    if (!m.due_date || m.due_date >= asOfDate) continue;
    const daysOverdue = daysBetween(m.due_date, asOfDate);
    findings.push({
      milestoneId: m.id, milestoneName: m.milestone_name, amount: m.amount,
      dueDate: m.due_date, daysOverdue, bucket: bucketFor(daysOverdue),
    });
  }
  return findings;
}
