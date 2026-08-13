// Controlled Tools for the Estimator (Daniel) agent — Phase 9.
//
// find_comparable_pricing is CODE tier and the only tool with access to
// raw completed-project/cost-entry rows. normalize_project_scope is AI
// tier and only ever sees the raw scope text it's asked to classify —
// never pricing data, and never returns anything about price (Frozen §7:
// final price authorization is human-only).

import type { ToolDefinition } from '../tools.ts';
import { findComparableProjects, computePricingRecommendation } from '../domains/estimating/comparableHistory.ts';
import type { ScopeInterpreterClient } from '../domains/estimating/scopeInterpreter.ts';
import type {
  ReadinessCompletedProject,
  ReadinessCostEntry,
  PricingRecommendation,
  ScopeNormalizationResult,
} from '../domains/estimating/types.ts';

// ─── find_comparable_pricing (CODE tier) ────────────────────────────────────

export interface FindComparablePricingArgs {
  projectType: string;
  completedProjects: ReadinessCompletedProject[];
  costEntries: ReadinessCostEntry[];
}

export const findComparablePricingTool: ToolDefinition<FindComparablePricingArgs, PricingRecommendation> = {
  name: 'find_comparable_pricing',
  description:
    'Deterministically finds completed projects of a given type and computes a pricing range (min/max/median contract amount, average margin) from them. Pure CODE tier — never calls a model, never authorizes a price.',
  supportsDryRun: false,
  async execute(args) {
    const comparables = findComparableProjects(args.projectType, args.completedProjects, args.costEntries);
    return computePricingRecommendation(args.projectType, comparables);
  },
};

// ─── normalize_project_scope (AI tier) ──────────────────────────────────────

export function createNormalizeProjectScopeTool(
  client: ScopeInterpreterClient
): ToolDefinition<{ scopeText: string }, ScopeNormalizationResult> {
  return {
    name: 'normalize_project_scope',
    description:
      'Classifies a free-text project scope description into one of the known project-type categories. Never touches pricing — see ScopeNormalizationResult\'s type contract.',
    supportsDryRun: false,
    async execute(args) {
      return client.normalize(args.scopeText);
    },
  };
}
