// CP360 AI Operations Brain — Workflow state/persistence engine (Slice 4).
//
// The engine's job is narrow and deliberately dumb: given a registered SOP
// id and a trigger event, it (1) persists a workflow run, (2) invokes the
// SOP's handler function, (3) persists whatever the handler decides
// happened (completed/waiting_approval/failed) as a valid state transition,
// and (4) can replay a past run by re-invoking the same handler with the
// same trigger event and comparing the resulting decisions. All actual
// business logic (what the SOP does, whether it needs approval, which tools
// it calls) lives in the handler — the engine never contains SOP-specific
// logic, so it is the same for every SOP the platform will ever register
// (Frozen §23.4: "one SOP/workflow system for UI, scheduler, voice, email
// and API triggers").

import type { AuditLog, AuditContext } from './audit.ts';
import type { AiBrainRepository } from './repository.ts';
import type { ToolRegistry } from './tools.ts';
import type { EventEnvelope, WorkflowRun } from './types.ts';

export interface SopExecutionContext {
  ctx: AuditContext;
  workflowRunId: string;
  triggerEvent: EventEnvelope;
  audit: AuditLog;
  repo: AiBrainRepository;
  tools: ToolRegistry;
}

export type SopOutcome =
  | { kind: 'completed'; expectedOutcome: Record<string, unknown>; observedOutcome: Record<string, unknown> }
  | { kind: 'waiting_approval'; approvalId: string; waitingOn?: string }
  | { kind: 'failed'; reason: string };

export type SopHandler = (execCtx: SopExecutionContext) => Promise<SopOutcome>;

export interface WorkflowRunResult {
  run: WorkflowRun;
  outcome: SopOutcome;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class WorkflowEngine {
  private audit: AuditLog;
  private repo: AiBrainRepository;
  private tools: ToolRegistry;

  constructor(audit: AuditLog, repo: AiBrainRepository, tools: ToolRegistry) {
    this.audit = audit;
    this.repo = repo;
    this.tools = tools;
  }

  private execContext(ctx: AuditContext, workflowRunId: string, triggerEvent: EventEnvelope): SopExecutionContext {
    return { ctx, workflowRunId, triggerEvent, audit: this.audit, repo: this.repo, tools: this.tools };
  }

  /** Runs a SOP against a trigger event, from a fresh pending run through to its first stopping point. */
  async run(
    ctx: AuditContext,
    sopId: string,
    sopVersion: string,
    triggerEvent: EventEnvelope,
    handler: SopHandler
  ): Promise<WorkflowRunResult> {
    const run = await this.audit.startWorkflowRun(ctx, sopId, sopVersion, triggerEvent.id);
    await this.audit.transitionWorkflowRun(run.id, 'running');

    let outcome: SopOutcome;
    try {
      outcome = await handler(this.execContext(ctx, run.id, triggerEvent));
    } catch (err) {
      await this.audit.transitionWorkflowRun(run.id, 'failed');
      throw err;
    }

    const finalRun = await this.applyOutcome(run.id, ctx, outcome);
    return { run: finalRun, outcome };
  }

  /**
   * Resumes a workflow run sitting in `waiting_approval` by re-invoking the
   * same handler. The handler is expected to check the approval's decision
   * (via `audit.listApprovalsByWorkflowRun`) and either proceed (returning
   * `completed`/`failed`) or, if still pending, return `waiting_approval`
   * again unchanged — the engine does not guess at SOP-specific logic.
   */
  async resume(
    ctx: AuditContext,
    workflowRunId: string,
    triggerEvent: EventEnvelope,
    handler: SopHandler
  ): Promise<WorkflowRunResult> {
    const existing = await this.audit.getWorkflowRun(workflowRunId);
    if (!existing) throw new Error(`workflow run not found: ${workflowRunId}`);
    if (existing.status !== 'waiting_approval') {
      throw new Error(`cannot resume workflow run in status ${existing.status}`);
    }
    await this.audit.transitionWorkflowRun(workflowRunId, 'running');
    let outcome: SopOutcome;
    try {
      outcome = await handler(this.execContext(ctx, workflowRunId, triggerEvent));
    } catch (err) {
      await this.audit.transitionWorkflowRun(workflowRunId, 'failed');
      throw err;
    }
    const finalRun = await this.applyOutcome(workflowRunId, ctx, outcome);
    return { run: finalRun, outcome };
  }

  /**
   * Replay: re-runs the SAME SOP handler against the SAME trigger event
   * payload as a brand-new, separate workflow run (never mutates the
   * original — audit history is append-only). Returns both runs' tool-call
   * request hashes so a caller can confirm the SOP made identical decisions
   * both times, proving the run is deterministic and replayable end to end
   * (Frozen §12: "support workflow replay").
   */
  async replay(
    ctx: AuditContext,
    originalWorkflowRunId: string,
    handler: SopHandler
  ): Promise<{
    original: WorkflowRun;
    replay: WorkflowRunResult;
    deterministicMatch: boolean;
    originalToolHashes: string[];
    replayToolHashes: string[];
  }> {
    const original = await this.audit.getWorkflowRun(originalWorkflowRunId);
    if (!original) throw new Error(`workflow run not found: ${originalWorkflowRunId}`);
    const triggerEvent = await this.audit.getEvent(original.triggerEventId);
    if (!triggerEvent) throw new Error(`trigger event not found: ${original.triggerEventId}`);

    // A fresh correlation id keeps the replay's audit trail distinct from
    // the original's — replay produces new evidence, it does not rewrite
    // history under the same correlation id.
    const replayCtx: AuditContext = { ...ctx, correlationId: crypto.randomUUID() };
    const replay = await this.run(replayCtx, original.sopId, original.sopVersion, triggerEvent, handler);

    const originalCalls = await this.audit.listToolCallsByWorkflowRun(original.id);
    const replayCalls = await this.audit.listToolCallsByWorkflowRun(replay.run.id);
    const originalToolHashes = originalCalls.map((c) => c.requestHash).sort();
    const replayToolHashes = replayCalls.map((c) => c.requestHash).sort();

    return {
      original,
      replay,
      deterministicMatch: deepEqual(originalToolHashes, replayToolHashes),
      originalToolHashes,
      replayToolHashes,
    };
  }

  private async applyOutcome(
    workflowRunId: string,
    ctx: AuditContext,
    outcome: SopOutcome
  ): Promise<WorkflowRun> {
    if (outcome.kind === 'completed') {
      const success = deepEqual(outcome.expectedOutcome, outcome.observedOutcome);
      await this.audit.verification(ctx, {
        workflowRunId,
        expectedOutcome: outcome.expectedOutcome,
        observedOutcome: outcome.observedOutcome,
        success,
        mismatchNotes: success ? null : 'expected and observed outcomes differ',
      });
      return this.audit.transitionWorkflowRun(workflowRunId, success ? 'completed' : 'failed');
    }
    if (outcome.kind === 'waiting_approval') {
      return this.audit.transitionWorkflowRun(workflowRunId, 'waiting_approval', {
        waitingOn: outcome.waitingOn ?? outcome.approvalId,
      });
    }
    return this.audit.transitionWorkflowRun(workflowRunId, 'failed');
  }
}
