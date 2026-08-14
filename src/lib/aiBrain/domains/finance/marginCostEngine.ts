// Margin Engine + Cost Tracking (CODE tier, Frozen §5). Pure arithmetic
// over contract value, approved change orders, and logged cost entries —
// no LLM anywhere in this file, and no write path (this never adjusts a
// contract or posts a cost; it only reads and sums what's already there).

import type { ReadinessCostEntry, ReadinessChangeOrder, MarginResult } from './types.ts';

/** A margin below this percent is flagged as a risk worth a human look. */
export const MARGIN_WARNING_PERCENT = 15;

export interface CostSummary {
  totalCost: number;
  byCategory: Record<string, number>;
}

/** Cost Tracking: total logged cost for a project, broken down by category. */
export function summarizeCostsByCategory(projectId: string, costEntries: ReadinessCostEntry[]): CostSummary {
  const relevant = costEntries.filter((c) => c.project_id === projectId);
  const byCategory: Record<string, number> = {};
  let totalCost = 0;
  for (const entry of relevant) {
    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.amount;
    totalCost += entry.amount;
  }
  return { totalCost, byCategory };
}

/**
 * Margin Engine: revenue is the contract amount plus the value of any
 * APPROVED change order (an approved change order is billable to the
 * client, so it increases contract revenue — a draft/rejected one does
 * not). Cost is every logged project_cost_entries row. If no
 * contract_amount is set, margin is left unknown (null) rather than
 * guessed — an unset contract amount is a data-completeness gap, not a
 * margin risk, and this engine never fabricates a number to fill it.
 */
export function computeProjectMargin(
  projectId: string,
  contractAmount: number | null,
  changeOrders: ReadinessChangeOrder[],
  costEntries: ReadinessCostEntry[]
): MarginResult {
  const approvedChangeOrderValue = changeOrders
    .filter((co) => co.project_id === projectId && co.approval_status === 'Approved')
    .reduce((sum, co) => sum + co.cost_impact, 0);

  const { totalCost } = summarizeCostsByCategory(projectId, costEntries);

  const totalRevenue = contractAmount === null ? null : contractAmount + approvedChangeOrderValue;
  const margin = totalRevenue === null ? null : totalRevenue - totalCost;
  const marginPercent = margin === null || totalRevenue === null || totalRevenue === 0 ? null : (margin / totalRevenue) * 100;

  return { projectId, contractAmount, approvedChangeOrderValue, totalRevenue, totalCost, margin, marginPercent };
}
