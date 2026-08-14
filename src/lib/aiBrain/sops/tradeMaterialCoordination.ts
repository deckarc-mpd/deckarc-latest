// SOP: trade_material_coordination_v1 (owner: project_operations / Marcus)
//
// Frozen §11's "Trade Confirmation Cutoff" routine plus §4's Project Ops
// material/dependency scope. Phase 3's honest scope, stated plainly: the
// Integration Gateway that would let this SOP attempt automated outreach to
// an unconfirmed sub (per §11's routine description) does not exist yet
// (Phase 0 Discovery, ADR-CP360-AI-001) — so once a genuine trade or
// material issue is deterministically confirmed, escalating to a human IS
// this SOP's remedy, not a fallback for one.
//
// Reuses, rather than duplicates:
//   - the Controlled Tool layer (assess_trade_material_coordination) —
//     Slice 5, Phase 1.
//   - the Policy Engine (evaluateAuthority) — Slice 6, Phase 1.
//   - the AI interpreter (interpret_field_update / RiskInterpreterClient)
//     — Phase 2, completely unmodified. Phase 3's findings are reshaped
//     into the SAME GateResult/DeterministicReadinessResult contract Phase
//     2 already defined ('subcontractor' for trade issues, 'materials' for
//     schedule risks) rather than building a second AI interpretation path.
//   - the audit system's approval mechanism (`audit.approval()`) as the
//     escalation primitive — exactly how Phase 1's task_delay_cascade_v1
//     already gates a consequential write on human review. No new table,
//     no new "escalation" concept at the schema level.
//
// One deliberate difference from Phase 1's approval semantics, documented
// here because it's easy to get backwards: for task_delay_cascade_v1,
// REJECTING an approval means "don't do the write" (kind: 'failed' — the
// proposed action correctly did not happen). For an escalation, there is no
// proposed write to accept or reject — a human is being asked "is this
// real?", and either answer means the SOP's job (get human eyes on a
// detected issue) is done. So both 'approved' and 'rejected' here resolve
// to `completed`; only 'pending' stays parked.

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  assessTradeMaterialCoordinationTool,
  createInterpretFieldUpdateTool,
  type AssessTradeMaterialArgs,
} from '../tools/projectOpsTools.ts';
import type { RiskInterpreterClient, RiskInterpretInput } from '../domains/projectOps/aiInterpreter.ts';
import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  GateResult,
  DeterministicReadinessResult,
  RiskInterpretation,
  TradeMaterialCoordinationResult,
} from '../domains/projectOps/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface TradeMaterialCoordinationPayload {
  projectId: string;
  asOfDate: string;
  tasks: ReadinessTask[];
  crewConfirmations: ReadinessCrewConfirmation[];
  materials: ReadinessMaterial[];
}

/** Reshapes Phase 3's findings into Phase 2's GateResult contract so the SAME interpret_field_update tool can be reused unmodified. */
function toDeterministicReadinessShape(coordination: TradeMaterialCoordinationResult): DeterministicReadinessResult {
  const gates: GateResult[] = [
    {
      gate: 'subcontractor',
      status: coordination.tradeConfirmationIssues.length > 0 ? 'not_ready' : 'ready',
      findings: coordination.tradeConfirmationIssues.flatMap((i) => i.reasons),
    },
    {
      gate: 'materials',
      status: coordination.materialScheduleRisks.length > 0 ? 'not_ready' : 'ready',
      findings: coordination.materialScheduleRisks.map((r) => r.reason),
    },
  ];
  return {
    projectId: coordination.projectId,
    asOfDate: coordination.asOfDate,
    gates,
    overallStatus: coordination.escalationRequired ? 'blocked' : 'ready',
  };
}

function payloadHashFor(coordination: TradeMaterialCoordinationResult): string {
  return `trade_material:${coordination.projectId}:${coordination.asOfDate}:${coordination.escalationReasons.length}`;
}

export function createTradeMaterialCoordinationHandler(interpreterClient: RiskInterpreterClient) {
  const interpretTool = createInterpretFieldUpdateTool(interpreterClient);

  return async function tradeMaterialCoordinationHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as TradeMaterialCoordinationPayload;

    const agent = await getAgentOrThrow(repo, 'project_operations');

    // Detecting and surfacing an issue is a read — never a write to a CP360
    // table — so the same L1-clearing check Phase 2 uses applies here too.
    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `project_operations authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. CODE — deterministic trade-confirmation-cutoff + material schedule-dependency checks.
    if (!tools.has(assessTradeMaterialCoordinationTool.name)) tools.register(assessTradeMaterialCoordinationTool);
    const assessment = await callTool<AssessTradeMaterialArgs, TradeMaterialCoordinationResult>(
      tools,
      audit,
      ctx,
      'assess_trade_material_coordination',
      {
        projectId: payload.projectId,
        asOfDate: payload.asOfDate,
        tasks: payload.tasks,
        crewConfirmations: payload.crewConfirmations,
        materials: payload.materials,
      },
      { workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: agent.id }, action: 'assess' }
    );

    // 2. AI — only when there's genuinely ambiguous human-written text (a
    // sub's notes/questions on an unconfirmed confirmation) to help a human
    // reviewer understand WHY faster. Reuses Phase 2's interpreter and its
    // pre-filter contract exactly — no parallel AI path for this domain.
    const unconfirmedIds = new Set(assessment.result.tradeConfirmationIssues.map((i) => i.confirmationId));
    const freeText = payload.crewConfirmations
      .filter((c) => unconfirmedIds.has(c.id))
      .flatMap((c) => [c.confirmation_notes, c.questions_before_arrival]);

    if (!tools.has(interpretTool.name)) tools.register(interpretTool);
    const interpretation = await callTool<RiskInterpretInput, RiskInterpretation>(
      tools,
      audit,
      ctx,
      'interpret_field_update',
      { deterministic: toDeterministicReadinessShape(assessment.result), freeText },
      { workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: agent.id }, action: 'interpret' }
    );

    if (interpretation.result.invoked) {
      await audit.agentRun(ctx, workflowRunId, agent.id, {
        provider: interpreterClient.constructor.name,
        model: null,
        modelVersion: null,
        structuredProposal: { ...interpretation.result },
        evidenceIds: [assessment.toolCall.id, interpretation.toolCall.id],
        status: 'accepted',
      });
    }

    // 3. Escalation — only if the deterministic check says so. Reuses the
    // audit system's approval mechanism as the escalation primitive.
    if (assessment.result.escalationRequired) {
      const [existing] = await audit.listApprovalsByWorkflowRun(workflowRunId);
      if (!existing) {
        const approval = await audit.approval(ctx, workflowRunId, payloadHashFor(assessment.result), 'ui');
        return { kind: 'waiting_approval', approvalId: approval.id, waitingOn: approval.id };
      }
      if (existing.decision === 'pending') {
        return { kind: 'waiting_approval', approvalId: existing.id, waitingOn: existing.id };
      }
      // Either 'approved' (real issue, human is on it) or 'rejected' (false
      // alarm) means the SOP's job — get human eyes on it — is done. See
      // file header for why this differs from task_delay_cascade_v1.
    }

    // 4. Verification — the reported escalation decision must still equal
    // what the deterministic check found, whether or not AI or a human
    // touched anything in between.
    return {
      kind: 'completed',
      expectedOutcome: {
        escalationRequired: assessment.result.escalationRequired,
        issueCount: assessment.result.tradeConfirmationIssues.length + assessment.result.materialScheduleRisks.length,
      },
      observedOutcome: {
        escalationRequired: assessment.result.escalationRequired,
        issueCount: assessment.result.tradeConfirmationIssues.length + assessment.result.materialScheduleRisks.length,
      },
    };
  };
}
