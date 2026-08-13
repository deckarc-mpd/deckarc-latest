// Controlled Tools for the Customer Success (Natalie) agent — Phase 5.
//
// gather_verified_client_facts is CODE tier and the ONLY tool with access
// to client_decisions/project_delay_reasons rows. draft_client_communication
// is AI tier and only ever sees the narrow VerifiedClientFacts it's handed —
// see domains/customerSuccess/draftClient.ts's header for why that boundary
// matters (Frozen §4: "never fabricated status").

import type { ToolDefinition } from '../tools.ts';
import { gatherVerifiedClientFacts } from '../domains/customerSuccess/verifiedFacts.ts';
import type { DraftClient } from '../domains/customerSuccess/draftClient.ts';
import type {
  ReadinessDecision,
  ReadinessDelayReason,
  VerifiedClientFacts,
  ClientCommunicationDraft,
} from '../domains/customerSuccess/types.ts';

// ─── gather_verified_client_facts (CODE tier) ───────────────────────────────

export interface GatherVerifiedFactsArgs {
  projectId: string;
  asOfDate: string;
  decisions: ReadinessDecision[];
  delayReasons: ReadinessDelayReason[];
}

export const gatherVerifiedClientFactsTool: ToolDefinition<GatherVerifiedFactsArgs, VerifiedClientFacts> = {
  name: 'gather_verified_client_facts',
  description:
    'Deterministically reads open client_decisions and client-visible project_delay_reasons for a project and reduces them to verified fact anchors. The only tool with access to those raw tables. Pure CODE tier — never calls a model.',
  supportsDryRun: false,
  async execute(args) {
    return gatherVerifiedClientFacts(args.projectId, args.asOfDate, args.decisions, args.delayReasons);
  },
};

// ─── draft_client_communication (AI tier) ───────────────────────────────────

export interface DraftClientCommunicationArgs {
  facts: VerifiedClientFacts;
}

/**
 * A factory, not a fixed export, for the same reason every other AI-tier
 * tool in this codebase is one: which DraftClient backs it (deterministic
 * test double vs. real model) is a deployment/test decision.
 */
export function createDraftClientCommunicationTool(
  client: DraftClient
): ToolDefinition<DraftClientCommunicationArgs, ClientCommunicationDraft[]> {
  return {
    name: 'draft_client_communication',
    description:
      'Drafts client-facing message text from verified fact anchors ONLY — receives no raw CP360 rows. Never decides whether to send; every draft requires human approval before use (Frozen §4).',
    supportsDryRun: false,
    async execute(args) {
      const drafts: ClientCommunicationDraft[] = [];
      for (const candidate of args.facts.candidates) {
        const { subject, body } = await client.draft(candidate);
        drafts.push({ occasion: candidate.occasion, sourceId: candidate.sourceId, subject, body });
      }
      return drafts;
    },
  };
}
