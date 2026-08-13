// Estimator (Daniel / estimating) domain types — Phase 9.
//
// "Comparable/history analysis via the shared Knowledge Brain" (Frozen §10):
// no Knowledge Brain infrastructure exists yet (a documented gap since
// Phase 0 — see CP360_SCHEDULED_OPERATING_EVENTS.md's Monthly Knowledge
// Review row). This is the first concrete consumer of what that shared
// system will eventually be, scoped honestly to what's real today: a
// deterministic lookup over completed projects' contract_amount (Phase 8)
// and project_cost_entries — not the full cross-domain retrieval system.

import type { ReadinessCostEntry } from '../finance/types.ts';
export type { ReadinessCostEntry };

export interface ReadinessCompletedProject {
  id: string;
  project_type: string;
  status: string;
  contract_amount: number | null;
}

export interface ComparableProject {
  projectId: string;
  contractAmount: number;
  totalCost: number;
  marginPercent: number | null;
}

export type EstimateAssessmentStatus = 'ready' | 'insufficient_data';

export interface PricingRecommendation {
  projectType: string;
  comparableCount: number;
  recommendedLow: number | null;
  recommendedHigh: number | null;
  medianContractAmount: number | null;
  averageMarginPercent: number | null;
}

export interface EstimateAssessmentResult {
  scopeText: string;
  projectType: string;
  status: EstimateAssessmentStatus;
  pricingRecommendation: PricingRecommendation;
}

export interface ScopeNormalizationResult {
  invoked: boolean;
  normalizedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}
