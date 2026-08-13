// CP360 AI Operations Brain — repository contract.
//
// Every module in this package talks to storage only through this interface.
// That is what makes the orchestration logic (policy, workflow, tools, events)
// unit-testable without a live database (see memoryRepository.ts, used by the
// test suite) while the real app wires supabaseRepository.ts. This is the
// concrete fix to the Phase 0 gap-analysis finding that `activity_log` writes
// trusted client-supplied actor fields (CP360_AI_GAP_ANALYSIS.md §1): nothing
// outside this interface may write an audit record.

import type {
  EventEnvelope,
  NewEvent,
  WorkflowRun,
  NewWorkflowRun,
  WorkflowRunStatus,
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

export interface AiBrainRepository {
  // Audit — Event
  insertEvent(event: NewEvent): Promise<EventEnvelope>;
  getEvent(id: string): Promise<EventEnvelope | null>;

  // Audit — Workflow run
  insertWorkflowRun(run: NewWorkflowRun): Promise<WorkflowRun>;
  updateWorkflowRun(
    id: string,
    patch: Partial<Pick<WorkflowRun, 'status' | 'waitingOn' | 'dueAt' | 'completedAt'>>
  ): Promise<WorkflowRun>;
  getWorkflowRun(id: string): Promise<WorkflowRun | null>;
  listWorkflowRunsByCorrelation(correlationId: string): Promise<WorkflowRun[]>;

  // Audit — Agent run
  insertAgentRun(run: NewAgentRun): Promise<AgentRun>;

  // Audit — Tool call
  insertToolCall(call: NewToolCallRecord): Promise<ToolCallRecord>;
  listToolCallsByWorkflowRun(workflowRunId: string): Promise<ToolCallRecord[]>;

  // Audit — Approval
  insertApproval(approval: NewApprovalRecord): Promise<ApprovalRecord>;
  decideApproval(
    id: string,
    decision: 'approved' | 'rejected',
    approverUserId: string,
    decidedAt: string
  ): Promise<ApprovalRecord>;
  getApproval(id: string): Promise<ApprovalRecord | null>;
  listApprovalsByWorkflowRun(workflowRunId: string): Promise<ApprovalRecord[]>;

  // Audit — State change
  insertStateChange(change: NewStateChangeRecord): Promise<StateChangeRecord>;

  // Audit — Human override
  insertHumanOverride(override: NewHumanOverrideRecord): Promise<HumanOverrideRecord>;

  // Audit — Verification
  insertVerification(verification: NewVerificationRecord): Promise<VerificationRecord>;

  // Agent / SOP registry
  getAgent(id: string): Promise<AgentDefinition | null>;
  listAgents(): Promise<AgentDefinition[]>;
  getSop(id: string): Promise<SopDefinition | null>;
  listSops(): Promise<SopDefinition[]>;

  // Feature flags
  getFeatureFlag(key: string, companyId: string): Promise<FeatureFlagState | null>;
}

/** Every workflow-run status transition considered valid by the engine. */
export const VALID_WORKFLOW_TRANSITIONS: Record<WorkflowRunStatus, WorkflowRunStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['waiting_approval', 'completed', 'failed', 'cancelled'],
  waiting_approval: ['running', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};
