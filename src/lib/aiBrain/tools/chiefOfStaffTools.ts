// Controlled Tool for the Chief of Staff (Avery) agent — Phase 4.
//
// Read-only, like every Project Ops tool in projectOpsTools.ts: it never
// writes to a CP360 table, and it never resolves or routes the exceptions
// it's handed — see domains/chiefOfStaff/synthesis.ts's file header for why
// that boundary matters (Frozen §8: "prioritization and decision framing,
// not routing logic").

import type { ToolDefinition } from '../tools.ts';
import { synthesizeChiefOfStaffBrief } from '../domains/chiefOfStaff/synthesis.ts';
import type { SynthesisClient } from '../domains/chiefOfStaff/synthesis.ts';
import type { ResolvedException, ChiefOfStaffSynthesis } from '../domains/chiefOfStaff/types.ts';

export interface SynthesizeDailyBriefArgs {
  exceptions: ResolvedException[];
}

/**
 * A factory, not a fixed export, for the same reason
 * createInterpretFieldUpdateTool is one: which SynthesisClient backs it
 * (deterministic test double vs. real model) is a deployment/test decision,
 * not something the tool should hardcode.
 */
export function createSynthesizeDailyBriefTool(
  client: SynthesisClient
): ToolDefinition<SynthesizeDailyBriefArgs, ChiefOfStaffSynthesis> {
  return {
    name: 'synthesize_daily_brief',
    description:
      'Ranks resolved exceptions/action items by a fixed, code-owned priority and, only if any exist, adds a short AI-authored framing paragraph. Never resolves, reassigns, or routes any item. Pure read+synthesize — no dry-run distinction, it never writes.',
    supportsDryRun: false,
    async execute(args) {
      return synthesizeChiefOfStaffBrief(args.exceptions, client);
    },
  };
}
