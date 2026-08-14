// Voice adapter (Frozen §19) — Phase 6.
//
// hear -> transcribe -> resolve authenticated user + project/entity context
// -> classify intent -> read canonical CP360 state -> create structured
// proposed action -> policy/authority check -> (explicit confirmation if
// consequential/ambiguous) -> controlled tool -> verify result -> speak
// result -> audit.
//
// This file does not implement that flow's middle steps itself — it CALLS
// them, using the exact same WorkflowEngine, SOP handlers, Controlled Tool
// layer, and policy engine every other trigger source (UI, scheduler)
// already uses. Concretely:
//   - "read canonical CP360 state" / "controlled tool" / "verify result" /
//     "audit" all happen inside engine.run()/engine.resume() calling the
//     SAME SOP handlers Phases 1-5 built (createTomorrowReadinessHandler,
//     taskDelayCascadeHandler) — nothing here re-reads a table or re-calls
//     a tool directly.
//   - "policy/authority check" is the SOP handler's own evaluateAuthority
//     call, and "explicit confirmation if consequential" is the SAME
//     waiting_approval / ai_approvals mechanism the UI's Approve/Reject
//     buttons use — voice never bypasses it, and never auto-decides it.
//     This is what "voice does not increase authority" means structurally,
//     not just as a stated rule.
//   - Barge-in ("stop TTS and cancel/update any pending unexecuted
//     action") reuses that SAME approval-rejection path — there is no
//     separate cancellation mechanism.
//
// "Speak result" is always a short, deterministically-templated string —
// never free-form model text — so a spoken confirmation can never claim
// something happened that didn't.

import { newCorrelationId } from '../audit.ts';
import type { AuditLog } from '../audit.ts';
import type { AiBrainRepository } from '../repository.ts';
import type { WorkflowEngine, SopHandler } from '../workflow.ts';
import { emitVoiceEvent } from '../events.ts';
import { classifyVoiceIntent } from './intentClassifier.ts';
import { requiresReadBackConfirmation } from './confidenceGate.ts';
import type { VoiceSession, TranscribedUtterance, VoiceTurnResult, VoiceEntityDirectory, ClassifiedIntent } from './types.ts';
import type { TomorrowReadinessPayload } from '../sops/tomorrowReadiness.ts';
import type { TaskDelayReportedPayload } from '../sops/taskDelayCascade.ts';
import type { SweepProjectInput } from '../scheduling/sweepOrchestrator.ts';

export interface VoiceAdapterDeps {
  audit: AuditLog;
  repo: AiBrainRepository;
  engine: WorkflowEngine;
  directory: VoiceEntityDirectory;
  /** Keyed by sopId — the SAME handler instances every other trigger source uses (e.g. `{ tomorrow_readiness_v1: createTomorrowReadinessHandler(interpreter), task_delay_cascade_v1: taskDelayCascadeHandler }`). */
  handlersBySopId: Record<string, SopHandler>;
  /** Loads a project's current field-operations state — reuses Phase 4's exact SweepProjectInput shape rather than inventing a new one. */
  loadProjectSweepData: (projectId: string) => Promise<SweepProjectInput>;
}

async function runReadinessQuery(session: VoiceSession, intent: ClassifiedIntent, deps: VoiceAdapterDeps): Promise<VoiceTurnResult> {
  if (!intent.resolvedProjectId) {
    return { status: 'failed', spokenResponse: 'Which project did you mean?', workflowRunId: null, pendingApprovalId: null };
  }
  const handler = deps.handlersBySopId['tomorrow_readiness_v1'];
  if (!handler) {
    return { status: 'failed', spokenResponse: 'That capability is not available right now.', workflowRunId: null, pendingApprovalId: null };
  }

  const projectData = await deps.loadProjectSweepData(intent.resolvedProjectId);
  const ctx = { companyId: session.companyId, projectId: intent.resolvedProjectId, correlationId: newCorrelationId() };
  const payload: TomorrowReadinessPayload = {
    projectId: intent.resolvedProjectId, asOfDate: projectData.asOfDate,
    tasks: projectData.tasks, crewConfirmations: projectData.crewConfirmations,
    materials: projectData.materials, dailyUpdates: projectData.dailyUpdates,
  };
  const event = await emitVoiceEvent(deps.audit, ctx, session.userId, 'schedule.tomorrow_readiness_check', payload as unknown as Record<string, unknown>);
  const { run } = await deps.engine.run(ctx, 'tomorrow_readiness_v1', '1.0.0', event, handler);

  const calls = await deps.repo.listToolCallsByWorkflowRun(run.id);
  const readiness = calls.find((c) => c.toolName === 'compute_tomorrow_readiness')?.result as { overallStatus?: string } | null;
  const statusText = readiness?.overallStatus ?? 'unknown';

  return { status: 'completed', spokenResponse: `Tomorrow's readiness for this project is ${statusText}.`, workflowRunId: run.id, pendingApprovalId: null };
}

async function runDelayReport(session: VoiceSession, intent: ClassifiedIntent, deps: VoiceAdapterDeps): Promise<VoiceTurnResult> {
  if (!intent.resolvedProjectId || !intent.resolvedTaskId) {
    return { status: 'failed', spokenResponse: 'Which task did you mean?', workflowRunId: null, pendingApprovalId: null };
  }
  if (intent.delayDays === null) {
    return { status: 'failed', spokenResponse: 'How many days is that task delayed?', workflowRunId: null, pendingApprovalId: null };
  }
  const handler = deps.handlersBySopId['task_delay_cascade_v1'];
  if (!handler) {
    return { status: 'failed', spokenResponse: 'That capability is not available right now.', workflowRunId: null, pendingApprovalId: null };
  }

  const ctx = { companyId: session.companyId, projectId: intent.resolvedProjectId, correlationId: newCorrelationId() };
  const payload: TaskDelayReportedPayload = {
    projectId: intent.resolvedProjectId, taskId: intent.resolvedTaskId, delayDays: intent.delayDays,
    reason: intent.reasonText, responsibleParty: 'Subcontractor', reportedByUserId: session.userId,
  };
  const event = await emitVoiceEvent(deps.audit, ctx, session.userId, 'task.delay_reported', payload as unknown as Record<string, unknown>);
  const { run } = await deps.engine.run(ctx, 'task_delay_cascade_v1', '1.0.0', event, handler);

  if (run.status === 'waiting_approval') {
    const [approval] = await deps.repo.listApprovalsByWorkflowRun(run.id);
    return {
      status: 'waiting_confirmation',
      spokenResponse: `That delay would push your committed finish date. Should I confirm it?`,
      workflowRunId: run.id, pendingApprovalId: approval.id,
    };
  }
  return {
    status: run.status === 'completed' ? 'completed' : 'failed',
    spokenResponse: run.status === 'completed' ? `Got it — I've logged the ${intent.delayDays}-day delay.` : "I couldn't complete that.",
    workflowRunId: run.id, pendingApprovalId: null,
  };
}

async function resolvePendingApproval(
  session: VoiceSession,
  approvalId: string,
  decision: 'approved' | 'rejected',
  deps: VoiceAdapterDeps
): Promise<VoiceTurnResult> {
  const decided = await deps.audit.decideApproval(approvalId, decision, session.userId);
  const run = await deps.repo.getWorkflowRun(decided.workflowRunId);
  if (!run) return { status: 'failed', spokenResponse: "I couldn't find that request anymore.", workflowRunId: null, pendingApprovalId: null };

  const triggerEvent = await deps.audit.getEvent(run.triggerEventId);
  const handler = deps.handlersBySopId[run.sopId];
  if (!triggerEvent || !handler) {
    return { status: 'failed', spokenResponse: "I couldn't find the original request.", workflowRunId: run.id, pendingApprovalId: null };
  }

  const ctx = { companyId: run.companyId, projectId: run.projectId, correlationId: run.correlationId };
  const result = await deps.engine.resume(ctx, run.id, triggerEvent, handler);

  const spokenResponse =
    decision === 'rejected'
      ? "Okay, I've cancelled that."
      : result.run.status === 'completed'
        ? "Done — I've confirmed that."
        : "I heard your approval, but that didn't complete cleanly — please check the Action Center.";

  return { status: result.run.status === 'completed' ? 'completed' : 'failed', spokenResponse, workflowRunId: run.id, pendingApprovalId: null };
}

/**
 * Barge-in ("stop TTS and cancel/update any pending unexecuted action"):
 * reuses resolvePendingApproval's SAME 'rejected' path a spoken "no,
 * cancel" or a UI Reject button would take — no separate cancellation
 * mechanism, per the hard constraint against parallel voice logic.
 */
export async function cancelPendingVoiceAction(
  session: VoiceSession,
  pendingApprovalId: string,
  deps: VoiceAdapterDeps
): Promise<VoiceTurnResult> {
  return resolvePendingApproval(session, pendingApprovalId, 'rejected', deps);
}

export async function handleVoiceTurn(
  session: VoiceSession,
  utterance: TranscribedUtterance,
  pendingApprovalId: string | null,
  deps: VoiceAdapterDeps
): Promise<VoiceTurnResult> {
  // Hard constraint: authenticated session required; speaker recognition
  // alone is never authorization.
  if (!session.userId) {
    return { status: 'failed', spokenResponse: "I couldn't verify who you are — please sign in and try again.", workflowRunId: null, pendingApprovalId: null };
  }

  const intent = classifyVoiceIntent(utterance.text, deps.directory);

  // A follow-up turn deciding a PENDING approval always takes this path —
  // this covers both "update" (approve) and "correction" (reject) from
  // the exit gate, regardless of anything else the classifier heard.
  if (pendingApprovalId && intent.kind === 'decide_pending_approval' && intent.decision) {
    return resolvePendingApproval(session, pendingApprovalId, intent.decision, deps);
  }

  if (requiresReadBackConfirmation(utterance, intent)) {
    return {
      status: 'needs_readback',
      spokenResponse: `I want to make sure I heard that right — did you say: "${utterance.text}"?`,
      workflowRunId: null, pendingApprovalId: null,
    };
  }

  switch (intent.kind) {
    case 'query_tomorrow_readiness':
      return runReadinessQuery(session, intent, deps);
    case 'report_task_delay':
      return runDelayReport(session, intent, deps);
    case 'decide_pending_approval':
      return { status: 'failed', spokenResponse: "I don't have anything waiting for your decision right now.", workflowRunId: null, pendingApprovalId: null };
    default:
      return { status: 'unrecognized', spokenResponse: "I didn't catch an action I can take from that — try asking about tomorrow's readiness or reporting a delay.", workflowRunId: null, pendingApprovalId: null };
  }
}
