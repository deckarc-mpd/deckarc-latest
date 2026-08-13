// SOP: sales_pipeline_hygiene_v1 (owner: sales / Maya)
//
// Frozen §4's Sales scope (lead intake, qualification, follow-up, pipeline
// progression) and §11's Sales Pipeline Hygiene routine. Rules identify
// stale leads deterministically (staleLeadRules.ts); AI handles nuanced
// follow-up drafting only, for stale leads specifically — never a
// blanket message to the whole pipeline.
//
// Same groundedness-then-approval structure as Phase 5's
// client_communication_draft_v1: a drafted follow-up that never names the
// lead fails the run outright rather than reaching a human looking
// trustworthy, and every non-empty, fully-grounded batch requires company
// admin approval before use — this SOP never sends anything itself; no
// email/CRM integration exists yet (ADR-CP360-AI-001).

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  identifyStaleLeadsTool,
  createDraftLeadFollowupTool,
  type IdentifyStaleLeadsArgs,
  type DraftLeadFollowupArgs,
} from '../tools/salesTools.ts';
import { validateFollowUpGroundedness, type FollowUpDraftClient } from '../domains/sales/followUpDraftClient.ts';
import type { ReadinessLead, StaleLeadFinding, LeadFollowUpDraft } from '../domains/sales/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface SalesPipelineHygienePayload {
  asOfDate: string;
  leads: ReadinessLead[];
}

function payloadHashFor(findings: StaleLeadFinding[]): string {
  return `sales_pipeline_hygiene:${findings.length}:${findings.map((f) => f.leadId).sort().join(',')}`;
}

export function createSalesPipelineHygieneHandler(draftClient: FollowUpDraftClient) {
  const draftTool = createDraftLeadFollowupTool(draftClient);

  return async function salesPipelineHygieneHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as SalesPipelineHygienePayload;

    const agent = await getAgentOrThrow(repo, 'sales');

    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `sales authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. CODE — the only step with access to raw cp360_leads rows.
    if (!tools.has(identifyStaleLeadsTool.name)) tools.register(identifyStaleLeadsTool);
    const stale = await callTool<IdentifyStaleLeadsArgs, StaleLeadFinding[]>(tools, audit, ctx, 'identify_stale_leads', {
      asOfDate: payload.asOfDate,
      leads: payload.leads,
    }, {
      workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: agent.id }, action: 'identify',
    });

    if (stale.result.length === 0) {
      return {
        kind: 'completed',
        expectedOutcome: { staleCount: 0, allGrounded: true },
        observedOutcome: { staleCount: 0, allGrounded: true },
      };
    }

    // 2. AI — drafts follow-up text for stale leads ONLY.
    if (!tools.has(draftTool.name)) tools.register(draftTool);
    const drafted = await callTool<DraftLeadFollowupArgs, LeadFollowUpDraft[]>(tools, audit, ctx, 'draft_lead_followup', {
      findings: stale.result,
    }, {
      workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: agent.id }, action: 'draft',
    });

    await audit.agentRun(ctx, workflowRunId, agent.id, {
      provider: draftClient.constructor.name,
      model: null,
      modelVersion: null,
      structuredProposal: { drafts: drafted.result },
      evidenceIds: [stale.toolCall.id, drafted.toolCall.id],
      status: 'accepted',
    });

    // 3. Groundedness verification.
    const ungrounded = drafted.result.filter((draft) => {
      const finding = stale.result.find((f) => f.leadId === draft.leadId)!;
      return !validateFollowUpGroundedness(draft, finding).grounded;
    });
    if (ungrounded.length > 0) {
      return { kind: 'failed', reason: `${ungrounded.length} follow-up draft(s) never named the lead: ${ungrounded.map((d) => d.leadId).join(', ')}` };
    }

    // 4. Escalation — every non-empty, fully-grounded batch requires human approval.
    const [existing] = await audit.listApprovalsByWorkflowRun(workflowRunId);
    if (!existing) {
      const approval = await audit.approval(ctx, workflowRunId, payloadHashFor(stale.result), 'ui');
      return { kind: 'waiting_approval', approvalId: approval.id, waitingOn: approval.id };
    }
    if (existing.decision === 'pending') {
      return { kind: 'waiting_approval', approvalId: existing.id, waitingOn: existing.id };
    }

    return {
      kind: 'completed',
      expectedOutcome: { staleCount: stale.result.length, allGrounded: true },
      observedOutcome: { staleCount: drafted.result.length, allGrounded: true },
    };
  };
}
