// Chief of Staff (Avery) — executive compression layer, Frozen §8.
//
// Avery receives RESOLVED exceptions — outcomes other agents/sweeps already
// produced (a critical Action Board item, a needs-review item, a sweep that
// escalated) — never raw CP360 tables. Nothing in this file reads `tasks`,
// `permits`, `crew_confirmations`, etc.; the caller (sops/chiefOfStaffSynthesis.ts)
// is responsible for handing in already-categorized items, reusing
// actionBoardHelpers.ts's existing categories and the sweep orchestrator's
// escalation outcomes, not re-deriving categorization here.

export type ResolvedExceptionSource = 'critical_item' | 'needs_review_item' | 'sweep_escalation';

export interface ResolvedException {
  source: ResolvedExceptionSource;
  /** Stable id from the origin system (action-item id, or a workflow-run id for a sweep escalation). */
  id: string;
  projectId: string;
  title: string;
  detail: string;
}

export interface RankedException extends ResolvedException {
  rank: number;
}

export interface ChiefOfStaffSynthesis {
  /** Always present, always code-authored — never depends on the AI step having run. */
  headline: string;
  prioritizedItems: RankedException[];
  aiInvoked: boolean;
  /** One short paragraph of decision framing; null unless aiInvoked. */
  aiFraming: string | null;
}
