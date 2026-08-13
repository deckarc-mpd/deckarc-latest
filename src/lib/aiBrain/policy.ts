// CP360 AI Operations Brain — Policy / Authority Engine (Slice 6).
//
// Two independent questions, both answered here, matching Frozen
// Architecture v4 §7 (Figure 4: CODE -> AI -> HUMAN routing) and §4 /
// CP360_INTEGRATION_PERMISSION_MATRIX.md §1 (L0-L4 authority levels):
//
//   1. routeExecutionMethod() — WHO COMPUTES the answer: deterministic
//      CODE, an AI interpretation, or does it require a HUMAN outright.
//   2. evaluateAuthority() — WHO AUTHORIZES the resulting action, given the
//      acting agent's ceiling authority level for that tool/domain.
//
// These are deliberately kept separate: a SOP can be 100% CODE-tier (no
// LLM call at all, e.g. this Phase 1 vertical slice's delay cascade) and
// STILL require human approval, because authority is about consequence and
// permission, not about whether AI was involved. Conflating the two would
// make "the AI is not making this decision" wrongly imply "so it's safe to
// auto-execute," which is exactly the mistake Frozen §7 draws two separate
// branches to prevent.

import type { AuthorityLevel, ExecutionMethod } from './types.ts';

const AUTHORITY_ORDER: AuthorityLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4'];

export function authorityAtLeast(level: AuthorityLevel, minimum: AuthorityLevel): boolean {
  return AUTHORITY_ORDER.indexOf(level) >= AUTHORITY_ORDER.indexOf(minimum);
}

// ─── 1. CODE -> AI -> HUMAN routing (Frozen §7 Figure 4) ───────────────────

export interface RoutingInput {
  /** Can deterministic code answer this reliably and completely? */
  canDeterministicCodeHandle: boolean;
  /** Only asked if code cannot handle it: does this need interpretation? */
  requiresInterpretation: boolean;
  /** Only asked if it requires interpretation: does the judgment/authority needed exceed what AI may decide? */
  exceedsAiPermission: boolean;
}

export function routeExecutionMethod(input: RoutingInput): ExecutionMethod {
  if (input.canDeterministicCodeHandle) return 'CODE';
  if (!input.requiresInterpretation) return 'CODE'; // Frozen's WORKFLOW branch: still no LLM call.
  return input.exceedsAiPermission ? 'HUMAN' : 'AI';
}

// ─── 2. Authority-level enforcement (Permission Matrix §1) ─────────────────

export type AuthorityDecision = 'denied' | 'execute' | 'execute_with_confirmation' | 'require_approval';

export interface AuthorityInput {
  /** The acting agent's ceiling authority level for this tool/domain (from the Agent Registry / Permission Matrix). */
  agentAuthorityLevel: AuthorityLevel;
  /** Whether the specific action being attempted is a read or a write. */
  actionKind: 'read' | 'write';
  /**
   * True for actions the Permission Matrix and Frozen §19 always treat as
   * consequential regardless of ceiling — amounts, dates, commitments,
   * anything client/vendor-facing. Forces require_approval even under an
   * L3/L4 ceiling; never relaxes a lower ceiling.
   */
  consequential?: boolean;
}

/**
 * Never returns 'execute' for an L4 ceiling from a registry seed in this
 * codebase, because no agent starts at L4 (Frozen §24 — see registry.ts's
 * test asserting this). L4 is reachable only after a future, explicit
 * per-SOP promotion this engine has no part in granting.
 */
export function evaluateAuthority(input: AuthorityInput): AuthorityDecision {
  const { agentAuthorityLevel, actionKind, consequential = false } = input;

  if (agentAuthorityLevel === 'L0') return 'denied';

  if (actionKind === 'read') {
    // Any granted level (L1+) can read; reads are never consequential in
    // the sense this engine gates, so no approval requirement even if a
    // caller mistakenly marks a read consequential.
    return 'execute';
  }

  // Write action.
  if (agentAuthorityLevel === 'L1') return 'denied'; // read-only ceiling, no write authority at all.
  if (consequential) return 'require_approval'; // overrides L3/L4 — Frozen §19.
  if (agentAuthorityLevel === 'L2') return 'require_approval';
  if (agentAuthorityLevel === 'L3') return 'execute_with_confirmation';
  return 'execute'; // L4 — never assigned by default seed data, see note above.
}
