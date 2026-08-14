// In-memory implementation of AiBrainRepository, used only by tests. Lets the
// orchestration logic (policy, workflow engine, tools, events) be verified
// without a live Postgres connection — this sandbox has no network path to
// the real Supabase project, so this is the executable proof for Phase 1's
// logic; supabaseRepository.ts is the wiring for the real deployment and
// needs to be verified against the live project separately.

import type { AiBrainRepository } from './repository.ts';
import { VALID_WORKFLOW_TRANSITIONS } from './repository.ts';
import type {
  EventEnvelope,
  NewEvent,
  WorkflowRun,
  NewWorkflowRun,
  AgentRun,
  NewAgentRun,
  ToolCallRecord,
  NewToolCallRecord,
  ApprovalRecord,
  NewApprovalRecord,
  StateChangeRecord,
  NewStateChangeRecord,
  HumanOverrideRecord,
  NewHumanOverrideRecord,
  VerificationRecord,
  NewVerificationRecord,
  AgentDefinition,
  SopDefinition,
  FeatureFlagState,
} from './types.ts';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

export class MemoryRepository implements AiBrainRepository {
  events: EventEnvelope[] = [];
  workflowRuns: WorkflowRun[] = [];
  agentRuns: AgentRun[] = [];
  toolCalls: ToolCallRecord[] = [];
  approvals: ApprovalRecord[] = [];
  stateChanges: StateChangeRecord[] = [];
  humanOverrides: HumanOverrideRecord[] = [];
  verifications: VerificationRecord[] = [];
  agents = new Map<string, AgentDefinition>();
  sops = new Map<string, SopDefinition>();
  featureFlags = new Map<string, FeatureFlagState>();

  async insertEvent(event: NewEvent): Promise<EventEnvelope> {
    const row: EventEnvelope = { ...event, id: nextId('evt'), createdAt: new Date().toISOString() };
    this.events.push(row);
    return row;
  }

  async getEvent(id: string): Promise<EventEnvelope | null> {
    return this.events.find((e) => e.id === id) ?? null;
  }

  async insertWorkflowRun(run: NewWorkflowRun): Promise<WorkflowRun> {
    const now = new Date().toISOString();
    const row: WorkflowRun = {
      ...run,
      completedAt: run.completedAt ?? null,
      id: nextId('wfr'),
      createdAt: now,
      updatedAt: now,
    };
    this.workflowRuns.push(row);
    return row;
  }

  async updateWorkflowRun(
    id: string,
    patch: Partial<Pick<WorkflowRun, 'status' | 'waitingOn' | 'dueAt' | 'completedAt'>>
  ): Promise<WorkflowRun> {
    const row = this.workflowRuns.find((w) => w.id === id);
    if (!row) throw new Error(`workflow run not found: ${id}`);
    if (patch.status && patch.status !== row.status) {
      const allowed = VALID_WORKFLOW_TRANSITIONS[row.status];
      if (!allowed.includes(patch.status)) {
        throw new Error(`invalid workflow transition ${row.status} -> ${patch.status}`);
      }
    }
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    return row;
  }

  async getWorkflowRun(id: string): Promise<WorkflowRun | null> {
    return this.workflowRuns.find((w) => w.id === id) ?? null;
  }

  async listWorkflowRunsByCorrelation(correlationId: string): Promise<WorkflowRun[]> {
    return this.workflowRuns.filter((w) => w.correlationId === correlationId);
  }

  async insertAgentRun(run: NewAgentRun): Promise<AgentRun> {
    const row: AgentRun = { ...run, id: nextId('agr'), createdAt: new Date().toISOString() };
    this.agentRuns.push(row);
    return row;
  }

  async insertToolCall(call: NewToolCallRecord): Promise<ToolCallRecord> {
    const row: ToolCallRecord = { ...call, id: nextId('tc'), createdAt: new Date().toISOString() };
    this.toolCalls.push(row);
    return row;
  }

  async listToolCallsByWorkflowRun(workflowRunId: string): Promise<ToolCallRecord[]> {
    return this.toolCalls.filter((t) => t.workflowRunId === workflowRunId);
  }

  async insertApproval(approval: NewApprovalRecord): Promise<ApprovalRecord> {
    const row: ApprovalRecord = { ...approval, id: nextId('appr'), createdAt: new Date().toISOString() };
    this.approvals.push(row);
    return row;
  }

  async decideApproval(
    id: string,
    decision: 'approved' | 'rejected',
    approverUserId: string,
    decidedAt: string
  ): Promise<ApprovalRecord> {
    const row = this.approvals.find((a) => a.id === id);
    if (!row) throw new Error(`approval not found: ${id}`);
    row.decision = decision;
    row.approverUserId = approverUserId;
    row.decidedAt = decidedAt;
    return row;
  }

  async getApproval(id: string): Promise<ApprovalRecord | null> {
    return this.approvals.find((a) => a.id === id) ?? null;
  }

  async listApprovalsByWorkflowRun(workflowRunId: string): Promise<ApprovalRecord[]> {
    return this.approvals.filter((a) => a.workflowRunId === workflowRunId);
  }

  async insertStateChange(change: NewStateChangeRecord): Promise<StateChangeRecord> {
    const row: StateChangeRecord = { ...change, id: nextId('sc'), createdAt: new Date().toISOString() };
    this.stateChanges.push(row);
    return row;
  }

  async insertHumanOverride(override: NewHumanOverrideRecord): Promise<HumanOverrideRecord> {
    const row: HumanOverrideRecord = { ...override, id: nextId('ho'), createdAt: new Date().toISOString() };
    this.humanOverrides.push(row);
    return row;
  }

  async insertVerification(verification: NewVerificationRecord): Promise<VerificationRecord> {
    const row: VerificationRecord = { ...verification, id: nextId('vf'), createdAt: new Date().toISOString() };
    this.verifications.push(row);
    return row;
  }

  async getAgent(id: string): Promise<AgentDefinition | null> {
    return this.agents.get(id) ?? null;
  }

  async listAgents(): Promise<AgentDefinition[]> {
    return [...this.agents.values()];
  }

  async getSop(id: string): Promise<SopDefinition | null> {
    return this.sops.get(id) ?? null;
  }

  async listSops(): Promise<SopDefinition[]> {
    return [...this.sops.values()];
  }

  async getFeatureFlag(key: string, companyId: string): Promise<FeatureFlagState | null> {
    return this.featureFlags.get(`${companyId}:${key}`) ?? this.featureFlags.get(`global:${key}`) ?? null;
  }

  /** Test/seed helper — not part of the interface. */
  seedAgent(agent: AgentDefinition) {
    this.agents.set(agent.id, agent);
  }
  seedSop(sop: SopDefinition) {
    this.sops.set(sop.id, sop);
  }
  seedFlag(key: string, companyId: string | null, enabled: boolean) {
    const scope = companyId ?? 'global';
    this.featureFlags.set(`${scope}:${key}`, { key, enabled, companyId });
  }
}
