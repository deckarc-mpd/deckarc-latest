// CP360 AI Operations Brain — shared foundation types.
//
// These types are the contract between every Phase 1 module (audit, events,
// registry, workflow engine, controlled tools, policy engine, feature flags).
// Nothing in this file talks to Supabase or any other transport — it is pure
// data shape, per Frozen Architecture v4 §12/§23.4.

/** Stable agent identities. Never branch business logic on display name (Identity spec). */
export type AgentId =
  | 'chief_of_staff'
  | 'sales'
  | 'estimating'
  | 'project_operations'
  | 'compliance'
  | 'customer_success';

export const FROZEN_AGENT_IDS: readonly AgentId[] = [
  'chief_of_staff',
  'sales',
  'estimating',
  'project_operations',
  'compliance',
  'customer_success',
];

/** Frozen §7 CODE -> AI -> HUMAN execution routing. */
export type ExecutionMethod = 'CODE' | 'AI' | 'HUMAN';

/**
 * Authority levels an SOP/tool call can require, per
 * CP360_INTEGRATION_PERMISSION_MATRIX.md §1. L4 is never assigned by a
 * registry seed — it is only reached through the Phase 10 promotion process.
 */
export type AuthorityLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/** Frozen §9/§19/§20: every trigger surface funnels through one event shape. */
export type EventSource = 'ui' | 'schedule' | 'voice' | 'email' | 'api' | 'system';

export type ActorType = 'human' | 'agent' | 'schedule' | 'system';

export interface ActorRef {
  type: ActorType;
  /** user_profiles.id for human, AgentId for agent, 'scheduler'/'system' otherwise. */
  id: string;
}

/** Correlation keys every audit-adjacent record carries, per Frozen §12. */
export interface CorrelationKeys {
  companyId: string;
  projectId: string | null;
  correlationId: string;
}

// ─── 1. Event (the shared abstraction, Frozen §9/§23.4) ───────────────────

export interface EventEnvelope extends CorrelationKeys {
  id: string;
  source: EventSource;
  actor: ActorRef;
  eventType: string;
  payload: Record<string, unknown>;
  payloadVersion: string;
  createdAt: string;
}

export type NewEvent = Omit<EventEnvelope, 'id' | 'createdAt'>;

// ─── 2. Workflow run ────────────────────────────────────────────────────────

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowRun extends CorrelationKeys {
  id: string;
  sopId: string;
  sopVersion: string;
  triggerEventId: string;
  status: WorkflowRunStatus;
  waitingOn: string | null;
  dueAt: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewWorkflowRun = Omit<
  WorkflowRun,
  'id' | 'createdAt' | 'updatedAt' | 'completedAt'
> & { completedAt?: string | null };

// ─── 3. Agent run ───────────────────────────────────────────────────────────

export interface AgentRun extends CorrelationKeys {
  id: string;
  workflowRunId: string;
  agentId: AgentId;
  provider: string | null;
  model: string | null;
  modelVersion: string | null;
  structuredProposal: Record<string, unknown> | null;
  evidenceIds: string[];
  status: 'proposed' | 'accepted' | 'rejected';
  createdAt: string;
}

export type NewAgentRun = Omit<AgentRun, 'id' | 'createdAt'>;

// ─── 4. Tool call ───────────────────────────────────────────────────────────

export interface ToolCallRecord extends CorrelationKeys {
  id: string;
  workflowRunId: string | null;
  agentRunId: string | null;
  toolName: string;
  action: string;
  authorizedActor: ActorRef;
  requestHash: string;
  requestPayload: Record<string, unknown>;
  provider: string | null;
  externalId: string | null;
  result: Record<string, unknown> | null;
  status: 'pending' | 'success' | 'failed';
  dryRun: boolean;
  createdAt: string;
}

export type NewToolCallRecord = Omit<ToolCallRecord, 'id' | 'createdAt'>;

// ─── 5. Approval ────────────────────────────────────────────────────────────

export interface ApprovalRecord extends CorrelationKeys {
  id: string;
  workflowRunId: string;
  payloadHash: string;
  payloadVersion: string;
  approverUserId: string | null;
  decision: 'pending' | 'approved' | 'rejected';
  channel: 'ui' | 'voice' | 'email' | 'api';
  decidedAt: string | null;
  createdAt: string;
}

export type NewApprovalRecord = Omit<ApprovalRecord, 'id' | 'createdAt'>;

// ─── 6. State change ────────────────────────────────────────────────────────

export interface StateChangeRecord extends CorrelationKeys {
  id: string;
  workflowRunId: string | null;
  objectType: string;
  objectId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  source: EventSource;
  createdAt: string;
}

export type NewStateChangeRecord = Omit<StateChangeRecord, 'id' | 'createdAt'>;

// ─── 7. Human override ──────────────────────────────────────────────────────

export interface HumanOverrideRecord extends CorrelationKeys {
  id: string;
  workflowRunId: string | null;
  userId: string;
  actionOverridden: string;
  reason: string;
  createdAt: string;
}

export type NewHumanOverrideRecord = Omit<HumanOverrideRecord, 'id' | 'createdAt'>;

// ─── 8. Verification ─────────────────────────────────────────────────────────

export interface VerificationRecord extends CorrelationKeys {
  id: string;
  workflowRunId: string;
  expectedOutcome: Record<string, unknown>;
  observedOutcome: Record<string, unknown>;
  success: boolean;
  mismatchNotes: string | null;
  createdAt: string;
}

export type NewVerificationRecord = Omit<VerificationRecord, 'id' | 'createdAt'>;

// ─── Agent Registry (Frozen §3/§4, Identity spec) ──────────────────────────

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  officialTitle: string;
  businessDomain: string;
  mission: string;
  responsibilities: string[];
  assignedSops: string[];
  allowedTools: string[];
  dataPermissions: string[];
  /** Default/ceiling authority level for this agent absent a more specific SOP-level override. */
  authorityLevel: AuthorityLevel;
  escalationPolicy: string;
  modelPolicy: string;
  costBudget: { monthlyUsd: number; perCallUsd: number };
  status: 'active' | 'disabled';
  version: string;
}

// ─── SOP Registry ───────────────────────────────────────────────────────────

export interface SopDefinition {
  id: string;
  version: string;
  ownerAgentId: AgentId;
  title: string;
  description: string;
  triggerEventTypes: string[];
  /** CODE means this SOP never needs an LLM call; AI means it may. */
  executionMethod: ExecutionMethod;
  status: 'active' | 'disabled';
}

// ─── Feature flags ──────────────────────────────────────────────────────────

export interface FeatureFlagState {
  key: string;
  enabled: boolean;
  companyId: string | null; // null = global default
}
