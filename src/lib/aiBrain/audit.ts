// Thin, ergonomic façade over AiBrainRepository for writing audit records.
// This is the ONLY module the rest of aiBrain should import to write audit
// data — it exists so every caller threads correlation/company/project keys
// consistently (Frozen §12: "everything is correlated through company_id +
// project_id + workflow_id + correlation_id").

import type { AiBrainRepository } from './repository.ts';
import type {
  CorrelationKeys,
  EventEnvelope,
  EventSource,
  ActorRef,
  WorkflowRun,
  WorkflowRunStatus,
  AgentRun,
  AgentId,
  ToolCallRecord,
  ApprovalRecord,
  StateChangeRecord,
  HumanOverrideRecord,
  VerificationRecord,
} from './types.ts';

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export type AuditContext = CorrelationKeys;

export class AuditLog {
  private repo: AiBrainRepository;
  constructor(repo: AiBrainRepository) {
    this.repo = repo;
  }

  event(
    ctx: AuditContext,
    source: EventSource,
    actor: ActorRef,
    eventType: string,
    payload: Record<string, unknown>,
    payloadVersion = '1.0'
  ): Promise<EventEnvelope> {
    return this.repo.insertEvent({ ...ctx, source, actor, eventType, payload, payloadVersion });
  }

  startWorkflowRun(
    ctx: AuditContext,
    sopId: string,
    sopVersion: string,
    triggerEventId: string
  ): Promise<WorkflowRun> {
    return this.repo.insertWorkflowRun({
      ...ctx,
      sopId,
      sopVersion,
      triggerEventId,
      status: 'pending',
      waitingOn: null,
      dueAt: null,
      startedAt: new Date().toISOString(),
    });
  }

  transitionWorkflowRun(
    id: string,
    status: WorkflowRunStatus,
    extra?: { waitingOn?: string | null; dueAt?: string | null }
  ): Promise<WorkflowRun> {
    const patch: Parameters<AiBrainRepository['updateWorkflowRun']>[1] = { status };
    if (extra?.waitingOn !== undefined) patch.waitingOn = extra.waitingOn;
    if (extra?.dueAt !== undefined) patch.dueAt = extra.dueAt;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      patch.completedAt = new Date().toISOString();
    }
    return this.repo.updateWorkflowRun(id, patch);
  }

  agentRun(
    ctx: AuditContext,
    workflowRunId: string,
    agentId: AgentId,
    fields: {
      provider?: string | null;
      model?: string | null;
      modelVersion?: string | null;
      structuredProposal?: Record<string, unknown> | null;
      evidenceIds?: string[];
      status: AgentRun['status'];
    }
  ): Promise<AgentRun> {
    return this.repo.insertAgentRun({
      ...ctx,
      workflowRunId,
      agentId,
      provider: fields.provider ?? null,
      model: fields.model ?? null,
      modelVersion: fields.modelVersion ?? null,
      structuredProposal: fields.structuredProposal ?? null,
      evidenceIds: fields.evidenceIds ?? [],
      status: fields.status,
    });
  }

  toolCall(
    ctx: AuditContext,
    fields: Omit<Parameters<AiBrainRepository['insertToolCall']>[0], keyof CorrelationKeys>
  ): Promise<ToolCallRecord> {
    return this.repo.insertToolCall({ ...ctx, ...fields });
  }

  approval(
    ctx: AuditContext,
    workflowRunId: string,
    payloadHash: string,
    channel: ApprovalRecord['channel'],
    payloadVersion = '1.0'
  ): Promise<ApprovalRecord> {
    return this.repo.insertApproval({
      ...ctx,
      workflowRunId,
      payloadHash,
      payloadVersion,
      approverUserId: null,
      decision: 'pending',
      channel,
      decidedAt: null,
    });
  }

  decideApproval(id: string, decision: 'approved' | 'rejected', approverUserId: string): Promise<ApprovalRecord> {
    return this.repo.decideApproval(id, decision, approverUserId, new Date().toISOString());
  }

  listApprovalsByWorkflowRun(workflowRunId: string): Promise<ApprovalRecord[]> {
    return this.repo.listApprovalsByWorkflowRun(workflowRunId);
  }

  getWorkflowRun(id: string): Promise<WorkflowRun | null> {
    return this.repo.getWorkflowRun(id);
  }

  getEvent(id: string): Promise<EventEnvelope | null> {
    return this.repo.getEvent(id);
  }

  listToolCallsByWorkflowRun(workflowRunId: string) {
    return this.repo.listToolCallsByWorkflowRun(workflowRunId);
  }

  stateChange(
    ctx: AuditContext,
    fields: Omit<Parameters<AiBrainRepository['insertStateChange']>[0], keyof CorrelationKeys>
  ): Promise<StateChangeRecord> {
    return this.repo.insertStateChange({ ...ctx, ...fields });
  }

  humanOverride(
    ctx: AuditContext,
    fields: Omit<Parameters<AiBrainRepository['insertHumanOverride']>[0], keyof CorrelationKeys>
  ): Promise<HumanOverrideRecord> {
    return this.repo.insertHumanOverride({ ...ctx, ...fields });
  }

  verification(
    ctx: AuditContext,
    fields: Omit<Parameters<AiBrainRepository['insertVerification']>[0], keyof CorrelationKeys>
  ): Promise<VerificationRecord> {
    return this.repo.insertVerification({ ...ctx, ...fields });
  }
}
