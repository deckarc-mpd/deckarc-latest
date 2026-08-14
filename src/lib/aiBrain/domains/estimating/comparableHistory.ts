// Comparable/history analysis (CODE tier, Frozen §4/§10). Pure arithmetic
// over completed projects — no LLM anywhere in this file, and no write
// path. Final price authorization stays human-only (Frozen §7): this
// module only ever proposes a range from real historical data, never a
// single authorized number.

import type { ReadinessCompletedProject, ReadinessCostEntry, ComparableProject, PricingRecommendation } from './types.ts';

/** Fewer than this many real comparables and a range would be a guess dressed up as data, not a recommendation. */
export const MIN_COMPARABLES_FOR_RECOMMENDATION = 2;

export function findComparableProjects(
  projectType: string,
  completedProjects: ReadinessCompletedProject[],
  costEntries: ReadinessCostEntry[]
): ComparableProject[] {
  return completedProjects
    .filter((p) => p.status === 'Completed' && p.project_type === projectType && p.contract_amount !== null)
    .map((p) => {
      const totalCost = costEntries.filter((c) => c.project_id === p.id).reduce((sum, c) => sum + c.amount, 0);
      const contractAmount = p.contract_amount as number;
      const marginPercent = contractAmount !== 0 ? ((contractAmount - totalCost) / contractAmount) * 100 : null;
      return { projectId: p.id, contractAmount, totalCost, marginPercent };
    });
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computePricingRecommendation(projectType: string, comparables: ComparableProject[]): PricingRecommendation {
  if (comparables.length < MIN_COMPARABLES_FOR_RECOMMENDATION) {
    return { projectType, comparableCount: comparables.length, recommendedLow: null, recommendedHigh: null, medianContractAmount: null, averageMarginPercent: null };
  }
  const amounts = comparables.map((c) => c.contractAmount).sort((a, b) => a - b);
  const margins = comparables.map((c) => c.marginPercent).filter((m): m is number => m !== null);
  return {
    projectType,
    comparableCount: comparables.length,
    recommendedLow: amounts[0],
    recommendedHigh: amounts[amounts.length - 1],
    medianContractAmount: median(amounts),
    averageMarginPercent: margins.length > 0 ? margins.reduce((sum, m) => sum + m, 0) / margins.length : null,
  };
}
