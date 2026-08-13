// SOP: client_communication_draft_v1 (owner: customer_success / Natalie)
//
// Frozen §4's Customer Success scope: verified client communication and
// decision/selection-input tracking and delay communication, all drafted
// from canonical CP360 state, never fabricated. Pricing authority and
// construction sequencing are explicitly out of this agent's scope (§4) —
// nothing here touches change_orders, payment_milestones amounts, or
// scheduleEngine; it only ever reads client_decisions and the client-safe
// half of project_delay_reasons.
//
// The critical safety property this handler enforces, not just documents:
// a draft can only reach a human as "ready for review" if every verified
// fact it was built from is actually present in the text (see
// domains/customerSuccess/draftClient.ts's validateDraftGroundedness). An
// ungrounded draft fails the workflow run outright — it never sits in an
// approval queue looking trustworthy.
//
// Escalation/approval reuses audit.approval() exactly like Phase 3's
// trade_material_coordination_v1 — no new schema concept. Every non-empty
// batch of drafts requires human approval before use, per customer_success's
// registry escalation policy ("All client-facing sends require company
// admin approval") — this SOP never sends anything itself; there is no
// Gmail/Calendar integration yet (ADR-CP360-AI-001), so "approved" means
// the draft is ready for a human to copy and send, not that anything was
// dispatched automatically.

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  gatherVerifiedClientFactsTool,
  createDraftClientCommunicationTool,
  type GatherVerifiedFactsArgs,
  type DraftClientCommunicationArgs,
} from '../tools/customerSuccessTools.ts';
import { validateDraftGroundedness, type DraftClient } from '../domains/customerSuccess/draftClient.ts';
import type {
  ReadinessDecision,
  ReadinessDelayReason,
  VerifiedClientFacts,
  ClientCommunicationDraft,
} from '../domains/customerSuccess/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface ClientCommunicationDraftPayload {
  projectId: string;
  asOfDate: string;
  decisions: ReadinessDecision[];
  delayReasons: ReadinessDelayReason[];
}

function payloadHashFor(facts: VerifiedClientFacts): string {
  return `client_communication:${facts.projectId}:${facts.asOfDate}:${facts.candidates.length}`;
}

export function createClientCommunicationDraftHandler(draftClient: DraftClient) {
  const draftTool = createDraftClientCommunicationTool(draftClient);

  return async function clientCommunicationDraftHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as ClientCommunicationDraftPayload;

    const agent = await getAgentOrThrow(repo, 'customer_success');

    // Gathering facts and drafting text are both reads relative to CP360's
    // core tables — no write happens until (if ever) a human sends
    // something outside this SOP entirely.
    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `customer_success authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. CODE — the only step with access to raw client_decisions/project_delay_reasons rows.
    if (!tools.has(gatherVerifiedClientFactsTool.name)) tools.register(gatherVerifiedClientFactsTool);
    const facts = await callTool<GatherVerifiedFactsArgs, VerifiedClientFacts>(tools, audit, ctx, 'gather_verified_client_facts', {
      projectId: payload.projectId,
      asOfDate: payload.asOfDate,
      decisions: payload.decisions,
      delayReasons: payload.delayReasons,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'gather',
    });

    // Deterministic pre-filter: nothing open -> zero AI calls, completes immediately.
    if (facts.result.candidates.length === 0) {
      return {
        kind: 'completed',
        expectedOutcome: { candidateCount: 0, allGrounded: true },
        observedOutcome: { candidateCount: 0, allGrounded: true },
      };
    }

    // 2. AI — drafts message text from the verified anchors ONLY.
    if (!tools.has(draftTool.name)) tools.register(draftTool);
    const drafted = await callTool<DraftClientCommunicationArgs, ClientCommunicationDraft[]>(tools, audit, ctx, 'draft_client_communication', {
      facts: facts.result,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'draft',
    });

    await audit.agentRun(ctx, workflowRunId, agent.id, {
      provider: draftClient.constructor.name,
      model: null,
      modelVersion: null,
      structuredProposal: { drafts: drafted.result },
      evidenceIds: [facts.toolCall.id, drafted.toolCall.id],
      status: 'accepted',
    });

    // 3. Groundedness verification — every draft must be traceable to its
    // candidate's verified anchors. A single ungrounded draft fails the
    // whole run rather than letting a partially-fabricated batch through.
    const groundednessResults = drafted.result.map((draft) => {
      const candidate = facts.result.candidates.find((c) => c.sourceId === draft.sourceId)!;
      return { draft, ...validateDraftGroundedness(draft, candidate) };
    });
    const ungrounded = groundednessResults.filter((r) => !r.grounded);
    if (ungrounded.length > 0) {
      return {
        kind: 'failed',
        reason: `${ungrounded.length} draft(s) missing verified facts: ${ungrounded.map((r) => `${r.draft.sourceId} (${r.missingAnchors.join(', ')})`).join('; ')}`,
      };
    }

    // 4. Escalation — every non-empty, fully-grounded batch requires human
    // approval before use (customer_success's registry escalation policy).
    const [existing] = await audit.listApprovalsByWorkflowRun(workflowRunId);
    if (!existing) {
      const approval = await audit.approval(ctx, workflowRunId, payloadHashFor(facts.result), 'ui');
      return { kind: 'waiting_approval', approvalId: approval.id, waitingOn: approval.id };
    }
    if (existing.decision === 'pending') {
      return { kind: 'waiting_approval', approvalId: existing.id, waitingOn: existing.id };
    }
    // 'approved' (drafts are ready to use) or 'rejected' (discard, needs a
    // manual redraft) both mean a human has reviewed this batch — same
    // resolution rule as trade_material_coordination_v1, for the same reason.

    return {
      kind: 'completed',
      expectedOutcome: { candidateCount: facts.result.candidates.length, allGrounded: true },
      observedOutcome: { candidateCount: drafted.result.length, allGrounded: true },
    };
  };
}
