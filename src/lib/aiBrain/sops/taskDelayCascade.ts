// SOP: task_delay_cascade_v1 (owner: project_operations / Marcus)
//
// The Phase 1 vertical-slice SOP: event -> policy -> approval/tool ->
// verification -> audit, end to end, exactly as required by
// CP360_AI_IMPLEMENTATION_PLAN.md's Phase 1 exit gate. 100% CODE-tier — no
// LLM call anywhere in this file (Frozen §7: deterministic code handles the
// date math reliably and completely, so that's the whole routing decision).
//
// Flow:
//   1. Preview the cascade with the Controlled Tool in dry-run mode (no
//      writes yet) to learn whether it would push the project's committed
//      finish date — that is this SOP's definition of "consequential."
//   2. Ask the Policy Engine whether project_operations' registered
//      authority ceiling allows executing this write outright or requires
//      approval first.
//   3. If approval is required and none exists yet, create one and stop
//      (workflow parks in `waiting_approval`). If approval already exists
//      and was rejected, fail cleanly. If approved (or none was ever
//      required), execute the real (non-dry-run) tool call.
//   4. Report expected vs. observed outcome for the engine to verify.
//
// This file has NOT been run against a live Supabase project (see
// tools/cascadeDelayTool.ts's header note) — its control flow is proven by
// the unit test in __tests__/taskDelayCascade.test.ts using a mock tool
// standing in for the real cascade_delay tool's dry-run/real-run contract.

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';
import type { CascadeDelayArgs, CascadeDelayResult } from '../tools/cascadeDelayTool.ts';

export interface TaskDelayReportedPayload {
  projectId: string;
  taskId: string;
  delayDays: number;
  reason: string;
  responsibleParty: string;
  reportedByUserId: string;
  actorName?: string;
  actorRole?: string;
}

export async function taskDelayCascadeHandler(exec: SopExecutionContext): Promise<SopOutcome> {
  const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
  const payload = triggerEvent.payload as unknown as TaskDelayReportedPayload;

  const agent = await getAgentOrThrow(repo, 'project_operations');

  const toolArgs: CascadeDelayArgs = {
    projectId: payload.projectId,
    rootTaskId: payload.taskId,
    delayDays: payload.delayDays,
    changeType: 'Delay Reported',
    reason: payload.reason,
    responsibleParty: payload.responsibleParty,
    actorName: payload.actorName,
    actorRole: payload.actorRole,
  };

  // 1. Preview — no writes yet.
  const preview = await callTool<CascadeDelayArgs, CascadeDelayResult>(tools, audit, ctx, 'cascade_delay', toolArgs, {
    workflowRunId,
    agentRunId: null,
    authorizedActor: { type: 'agent', id: agent.id },
    action: 'preview',
    dryRun: true,
  });

  const wouldPushProjectFinish = preview.result.newProjectFinish !== null;

  // 2. Authority check. Pushing the committed finish date is this SOP's
  // "consequential" condition — everything else about a delay cascade is
  // routine schedule bookkeeping already within project_operations' L2
  // ceiling for writes, but committing to a new finish date is the kind of
  // customer-facing consequence Frozen §19 always escalates regardless of
  // ceiling.
  const decision = evaluateAuthority({
    agentAuthorityLevel: agent.authorityLevel,
    actionKind: 'write',
    consequential: wouldPushProjectFinish,
  });

  if (decision === 'denied') {
    return { kind: 'failed', reason: `project_operations authority (${agent.authorityLevel}) denies this write` };
  }

  if (decision === 'require_approval') {
    const [existing] = await audit.listApprovalsByWorkflowRun(workflowRunId);
    if (!existing) {
      const approval = await audit.approval(
        ctx,
        workflowRunId,
        preview.toolCall.requestHash,
        'ui'
      );
      return { kind: 'waiting_approval', approvalId: approval.id };
    }
    if (existing.decision === 'pending') {
      return { kind: 'waiting_approval', approvalId: existing.id };
    }
    if (existing.decision === 'rejected') {
      await audit.humanOverride(ctx, {
        workflowRunId,
        userId: existing.approverUserId ?? payload.reportedByUserId,
        actionOverridden: 'task_delay_cascade_v1 auto-execution',
        reason: 'approval rejected',
      });
      return { kind: 'failed', reason: 'cascade rejected by approver' };
    }
    // approved -> fall through to execute for real.
  }
  // decision === 'execute' or 'execute_with_confirmation' (Phase 1 seed data
  // never grants either to project_operations for a consequential write —
  // see registry.test.ts — so this path is reserved for a future non-
  // consequential fast-path; today's seed always routes non-consequential
  // writes to 'require_approval' too, since project_operations' ceiling is
  // L2. This branch exists so the SOP does not need to change shape once a
  // future promotion grants L3+.)

  // 3. Execute for real.
  const real = await callTool<CascadeDelayArgs, CascadeDelayResult>(tools, audit, ctx, 'cascade_delay', toolArgs, {
    workflowRunId,
    agentRunId: null,
    authorizedActor: { type: 'agent', id: agent.id },
    action: 'execute',
    dryRun: false,
  });

  await audit.stateChange(ctx, {
    workflowRunId,
    objectType: 'task',
    objectId: payload.taskId,
    before: { delayDays: 0 },
    after: { delayDays: payload.delayDays },
    reason: payload.reason,
    source: triggerEvent.source,
  });

  // 4. Expected outcome = what the dry-run preview predicted; observed =
  // what actually happened. A mismatch here means the underlying data
  // changed between preview and execution (e.g. a concurrent edit) — the
  // engine records that as a verification failure, not a silent success.
  return {
    kind: 'completed',
    expectedOutcome: { updatedCount: preview.result.updatedCount, newProjectFinish: preview.result.newProjectFinish },
    observedOutcome: { updatedCount: real.result.updatedCount, newProjectFinish: real.result.newProjectFinish },
  };
}
