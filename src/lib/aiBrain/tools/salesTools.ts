// Controlled Tools for the Sales (Maya) agent — Phase 9.
//
// identify_stale_leads is CODE tier and the only tool with access to raw
// cp360_leads rows. draft_lead_followup is AI tier and only ever sees the
// narrow StaleLeadFinding it's handed — see followUpDraftClient.ts's
// header for why that boundary matters.

import type { ToolDefinition } from '../tools.ts';
import { identifyStaleLeads } from '../domains/sales/staleLeadRules.ts';
import type { FollowUpDraftClient } from '../domains/sales/followUpDraftClient.ts';
import type { ReadinessLead, StaleLeadFinding, LeadFollowUpDraft } from '../domains/sales/types.ts';

// ─── identify_stale_leads (CODE tier) ───────────────────────────────────────

export interface IdentifyStaleLeadsArgs {
  asOfDate: string;
  leads: ReadinessLead[];
}

export const identifyStaleLeadsTool: ToolDefinition<IdentifyStaleLeadsArgs, StaleLeadFinding[]> = {
  name: 'identify_stale_leads',
  description:
    'Deterministically identifies cp360_leads rows that have gone stale (no status progression within a threshold of days since creation). The only tool with access to raw lead rows. Pure CODE tier — never calls a model.',
  supportsDryRun: false,
  async execute(args) {
    return identifyStaleLeads(args.asOfDate, args.leads);
  },
};

// ─── draft_lead_followup (AI tier) ──────────────────────────────────────────

export interface DraftLeadFollowupArgs {
  findings: StaleLeadFinding[];
}

export function createDraftLeadFollowupTool(
  client: FollowUpDraftClient
): ToolDefinition<DraftLeadFollowupArgs, LeadFollowUpDraft[]> {
  return {
    name: 'draft_lead_followup',
    description:
      'Drafts nuanced follow-up message text for stale leads ONLY, from the stale-lead finding — never raw lead history. Never decides whether to send; every draft requires human approval before use.',
    supportsDryRun: false,
    async execute(args) {
      const drafts: LeadFollowUpDraft[] = [];
      for (const finding of args.findings) {
        const { subject, body } = await client.draft(finding);
        drafts.push({ leadId: finding.leadId, subject, body });
      }
      return drafts;
    },
  };
}
