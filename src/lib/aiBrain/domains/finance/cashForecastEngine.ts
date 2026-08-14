// Cash Forecast Engine (CODE tier, Frozen §5). Deterministic date-bucketed
// projection of expected AR inflows minus AP outflows over a horizon — no
// LLM, no bank connection, no payment movement of any kind.

import type { ReadinessPaymentMilestone, ReadinessVendorBill, CashForecastResult } from './types.ts';

const CLOSED_MILESTONE_STATUSES = new Set(['Paid', 'Waived']);

function withinHorizon(dateStr: string | null, asOfDate: string, horizonEnd: string): boolean {
  if (!dateStr) return false;
  // Already-overdue-but-unpaid amounts are still expected cash, so they
  // count as "due within the horizon" too, not just future-dated ones.
  return dateStr <= horizonEnd || dateStr < asOfDate;
}

export function computeCashForecast(
  asOfDate: string,
  horizonDays: number,
  milestones: ReadinessPaymentMilestone[],
  vendorBills: ReadinessVendorBill[]
): CashForecastResult {
  const horizonEnd = new Date(`${asOfDate}T00:00:00Z`);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays);
  const horizonEndStr = horizonEnd.toISOString().split('T')[0];

  const expectedInflows = milestones
    .filter((m) => !CLOSED_MILESTONE_STATUSES.has(m.status) && withinHorizon(m.due_date, asOfDate, horizonEndStr))
    .reduce((sum, m) => sum + m.amount, 0);

  const expectedOutflows = vendorBills
    .filter((b) => b.status !== 'Paid' && withinHorizon(b.due_date, asOfDate, horizonEndStr))
    .reduce((sum, b) => sum + b.amount, 0);

  return { asOfDate, horizonDays, expectedInflows, expectedOutflows, netProjectedCash: expectedInflows - expectedOutflows };
}
