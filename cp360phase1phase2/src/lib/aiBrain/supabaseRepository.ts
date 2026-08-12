// Supabase-backed implementation of AiBrainRepository.
//
// IMPORTANT: per docs/ai-brain/CP360_AI_GAP_ANALYSIS.md §1 and the migration
// comment in supabase/migrations/20260812140000_create_ai_brain_foundation.sql,
// the `ai_*` audit/registry tables have NO insert/update RLS policy for the
// `authenticated`/`anon` roles — only `service_role` (which bypasses RLS) can
// write. That means this repository is only able to WRITE when constructed
// with a Supabase client authenticated as the service role (i.e. from a
// server-side Vercel Serverless Function using SUPABASE_SERVICE_ROLE_KEY,
// never from the browser). A client constructed with the anon/browser key can
// still be used for READ operations (list/get), which remain RLS-gated by
// company/role exactly like the rest of the app.
//
// This file has not been exercised against a live Supabase project from this
// sandbox (no network path to Supabase here — see CP360_AI_COST_BASELINE.md
// environment notes). The schema and RLS behavior it relies on WAS verified
// by replaying the full real migration history plus the new migration
// against a local Postgres instance (see commit notes); this file's mapping
// logic is covered by the same unit-test suite via a thin adapter check, but
// real end-to-end verification against the deployed Supabase project is a
// prerequisite before this repository is used for anything beyond Phase 1
// review.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiBrainRepository } from './repository.ts';
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
  AgentId,
  AuthorityLevel,
  ExecutionMethod,
} from './types.ts';

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

// ─── row <-> domain mappers ─────────────────────────────────────────────────

function eventFromRow(r: Record<string, unknown>): EventEnvelope {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    source: r.source as EventEnvelope['source'],
    actor: { type: r.actor_type as EventEnvelope['actor']['type'], id: r.actor_id as string },
    eventType: r.event_type as string,
    payload: (r.payload as Record<string, unknown>) ?? {},
    payloadVersion: r.payload_version as string,
    createdAt: r.created_at as string,
  };
}

function workflowRunFromRow(r: Record<string, unknown>): WorkflowRun {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    sopId: r.sop_id as string,
    sopVersion: r.sop_version as string,
    triggerEventId: r.trigger_event_id as string,
    status: r.status as WorkflowRun['status'],
    waitingOn: (r.waiting_on as string) ?? null,
    dueAt: (r.due_at as string) ?? null,
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function agentRunFromRow(r: Record<string, unknown>): AgentRun {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    workflowRunId: r.workflow_run_id as string,
    agentId: r.agent_id as AgentId,
    provider: (r.provider as string) ?? null,
    model: (r.model as string) ?? null,
    modelVersion: (r.model_version as string) ?? null,
    structuredProposal: (r.structured_proposal as Record<string, unknown>) ?? null,
    evidenceIds: (r.evidence_ids as string[]) ?? [],
    status: r.status as AgentRun['status'],
    createdAt: r.created_at as string,
  };
}

function toolCallFromRow(r: Record<string, unknown>): ToolCallRecord {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    workflowRunId: (r.workflow_run_id as string) ?? null,
    agentRunId: (r.agent_run_id as string) ?? null,
    toolName: r.tool_name as string,
    action: r.action as string,
    authorizedActor: { type: r.authorized_actor_type as ToolCallRecord['authorizedActor']['type'], id: r.authorized_actor_id as string },
    requestHash: r.request_hash as string,
    requestPayload: (r.request_payload as Record<string, unknown>) ?? {},
    provider: (r.provider as string) ?? null,
    externalId: (r.external_id as string) ?? null,
    result: (r.result as Record<string, unknown>) ?? null,
    status: r.status as ToolCallRecord['status'],
    dryRun: Boolean(r.dry_run),
    createdAt: r.created_at as string,
  };
}

function approvalFromRow(r: Record<string, unknown>): ApprovalRecord {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    workflowRunId: r.workflow_run_id as string,
    payloadHash: r.payload_hash as string,
    payloadVersion: r.payload_version as string,
    approverUserId: (r.approver_user_id as string) ?? null,
    decision: r.decision as ApprovalRecord['decision'],
    channel: r.channel as ApprovalRecord['channel'],
    decidedAt: (r.decided_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function stateChangeFromRow(r: Record<string, unknown>): StateChangeRecord {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    workflowRunId: (r.workflow_run_id as string) ?? null,
    objectType: r.object_type as string,
    objectId: r.object_id as string,
    before: (r.before as Record<string, unknown>) ?? null,
    after: (r.after as Record<string, unknown>) ?? null,
    reason: r.reason as string,
    source: r.source as StateChangeRecord['source'],
    createdAt: r.created_at as string,
  };
}

function humanOverrideFromRow(r: Record<string, unknown>): HumanOverrideRecord {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    workflowRunId: (r.workflow_run_id as string) ?? null,
    userId: r.user_id as string,
    actionOverridden: r.action_overridden as string,
    reason: r.reason as string,
    createdAt: r.created_at as string,
  };
}

function verificationFromRow(r: Record<string, unknown>): VerificationRecord {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    projectId: (r.project_id as string) ?? null,
    correlationId: r.correlation_id as string,
    workflowRunId: r.workflow_run_id as string,
    expectedOutcome: (r.expected_outcome as Record<string, unknown>) ?? {},
    observedOutcome: (r.observed_outcome as Record<string, unknown>) ?? {},
    success: Boolean(r.success),
    mismatchNotes: (r.mismatch_notes as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function agentFromRow(r: Record<string, unknown>): AgentDefinition {
  return {
    id: r.id as AgentId,
    displayName: r.display_name as string,
    officialTitle: r.official_title as string,
    businessDomain: r.business_domain as string,
    mission: r.mission as string,
    responsibilities: (r.responsibilities as string[]) ?? [],
    assignedSops: (r.assigned_sops as string[]) ?? [],
    allowedTools: (r.allowed_tools as string[]) ?? [],
    dataPermissions: (r.data_permissions as string[]) ?? [],
    authorityLevel: r.authority_level as AuthorityLevel,
    escalationPolicy: r.escalation_policy as string,
    modelPolicy: r.model_policy as string,
    costBudget: {
      monthlyUsd: Number(r.cost_budget_monthly_usd ?? 0),
      perCallUsd: Number(r.cost_budget_per_call_usd ?? 0),
    },
    status: r.status as AgentDefinition['status'],
    version: r.version as string,
  };
}

function sopFromRow(r: Record<string, unknown>): SopDefinition {
  return {
    id: r.id as string,
    version: r.version as string,
    ownerAgentId: r.owner_agent_id as AgentId,
    title: r.title as string,
    description: r.description as string,
    triggerEventTypes: (r.trigger_event_types as string[]) ?? [],
    executionMethod: r.execution_method as ExecutionMethod,
    status: r.status as SopDefinition['status'],
  };
}

export function createSupabaseRepository(client: SupabaseClient): AiBrainRepository {
  return {
    async insertEvent(event: NewEvent) {
      const { data, error } = await client
        .from('ai_events')
        .insert({
          company_id: event.companyId,
          project_id: event.projectId,
          correlation_id: event.correlationId,
          source: event.source,
          actor_type: event.actor.type,
          actor_id: event.actor.id,
          event_type: event.eventType,
          payload: event.payload,
          payload_version: event.payloadVersion,
        })
        .select()
        .single();
      if (error) throw error;
      return eventFromRow(must(data, 'inserted event row'));
    },

    async getEvent(id: string) {
      const { data, error } = await client.from('ai_events').select().eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? eventFromRow(data) : null;
    },

    async insertWorkflowRun(run: NewWorkflowRun) {
      const { data, error } = await client
        .from('ai_workflow_runs')
        .insert({
          company_id: run.companyId,
          project_id: run.projectId,
          correlation_id: run.correlationId,
          sop_id: run.sopId,
          sop_version: run.sopVersion,
          trigger_event_id: run.triggerEventId,
          status: run.status,
          waiting_on: run.waitingOn,
          due_at: run.dueAt,
          started_at: run.startedAt,
          completed_at: run.completedAt ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return workflowRunFromRow(must(data, 'inserted workflow run row'));
    },

    async updateWorkflowRun(id, patch) {
      const dbPatch: Record<string, unknown> = {};
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.waitingOn !== undefined) dbPatch.waiting_on = patch.waitingOn;
      if (patch.dueAt !== undefined) dbPatch.due_at = patch.dueAt;
      if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;
      const { data, error } = await client
        .from('ai_workflow_runs')
        .update(dbPatch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return workflowRunFromRow(must(data, 'updated workflow run row'));
    },

    async getWorkflowRun(id: string) {
      const { data, error } = await client.from('ai_workflow_runs').select().eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? workflowRunFromRow(data) : null;
    },

    async listWorkflowRunsByCorrelation(correlationId: string) {
      const { data, error } = await client
        .from('ai_workflow_runs')
        .select()
        .eq('correlation_id', correlationId);
      if (error) throw error;
      return (data ?? []).map(workflowRunFromRow);
    },

    async insertAgentRun(run: NewAgentRun) {
      const { data, error } = await client
        .from('ai_agent_runs')
        .insert({
          company_id: run.companyId,
          project_id: run.projectId,
          correlation_id: run.correlationId,
          workflow_run_id: run.workflowRunId,
          agent_id: run.agentId,
          provider: run.provider,
          model: run.model,
          model_version: run.modelVersion,
          structured_proposal: run.structuredProposal,
          evidence_ids: run.evidenceIds,
          status: run.status,
        })
        .select()
        .single();
      if (error) throw error;
      return agentRunFromRow(must(data, 'inserted agent run row'));
    },

    async insertToolCall(call: NewToolCallRecord) {
      const { data, error } = await client
        .from('ai_tool_calls')
        .insert({
          company_id: call.companyId,
          project_id: call.projectId,
          correlation_id: call.correlationId,
          workflow_run_id: call.workflowRunId,
          agent_run_id: call.agentRunId,
          tool_name: call.toolName,
          action: call.action,
          authorized_actor_type: call.authorizedActor.type,
          authorized_actor_id: call.authorizedActor.id,
          request_hash: call.requestHash,
          request_payload: call.requestPayload,
          provider: call.provider,
          external_id: call.externalId,
          result: call.result,
          status: call.status,
          dry_run: call.dryRun,
        })
        .select()
        .single();
      if (error) throw error;
      return toolCallFromRow(must(data, 'inserted tool call row'));
    },

    async listToolCallsByWorkflowRun(workflowRunId: string) {
      const { data, error } = await client
        .from('ai_tool_calls')
        .select()
        .eq('workflow_run_id', workflowRunId);
      if (error) throw error;
      return (data ?? []).map(toolCallFromRow);
    },

    async insertApproval(approval: NewApprovalRecord) {
      const { data, error } = await client
        .from('ai_approvals')
        .insert({
          company_id: approval.companyId,
          project_id: approval.projectId,
          correlation_id: approval.correlationId,
          workflow_run_id: approval.workflowRunId,
          payload_hash: approval.payloadHash,
          payload_version: approval.payloadVersion,
          approver_user_id: approval.approverUserId,
          decision: approval.decision,
          channel: approval.channel,
          decided_at: approval.decidedAt,
        })
        .select()
        .single();
      if (error) throw error;
      return approvalFromRow(must(data, 'inserted approval row'));
    },

    async decideApproval(id, decision, approverUserId, decidedAt) {
      const { data, error } = await client
        .from('ai_approvals')
        .update({ decision, approver_user_id: approverUserId, decided_at: decidedAt })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return approvalFromRow(must(data, 'updated approval row'));
    },

    async getApproval(id: string) {
      const { data, error } = await client.from('ai_approvals').select().eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? approvalFromRow(data) : null;
    },

    async listApprovalsByWorkflowRun(workflowRunId: string) {
      const { data, error } = await client
        .from('ai_approvals')
        .select()
        .eq('workflow_run_id', workflowRunId);
      if (error) throw error;
      return (data ?? []).map(approvalFromRow);
    },

    async insertStateChange(change: NewStateChangeRecord) {
      const { data, error } = await client
        .from('ai_state_changes')
        .insert({
          company_id: change.companyId,
          project_id: change.projectId,
          correlation_id: change.correlationId,
          workflow_run_id: change.workflowRunId,
          object_type: change.objectType,
          object_id: change.objectId,
          before: change.before,
          after: change.after,
          reason: change.reason,
          source: change.source,
        })
        .select()
        .single();
      if (error) throw error;
      return stateChangeFromRow(must(data, 'inserted state change row'));
    },

    async insertHumanOverride(override: NewHumanOverrideRecord) {
      const { data, error } = await client
        .from('ai_human_overrides')
        .insert({
          company_id: override.companyId,
          project_id: override.projectId,
          correlation_id: override.correlationId,
          workflow_run_id: override.workflowRunId,
          user_id: override.userId,
          action_overridden: override.actionOverridden,
          reason: override.reason,
        })
        .select()
        .single();
      if (error) throw error;
      return humanOverrideFromRow(must(data, 'inserted human override row'));
    },

    async insertVerification(verification: NewVerificationRecord) {
      const { data, error } = await client
        .from('ai_verifications')
        .insert({
          company_id: verification.companyId,
          project_id: verification.projectId,
          correlation_id: verification.correlationId,
          workflow_run_id: verification.workflowRunId,
          expected_outcome: verification.expectedOutcome,
          observed_outcome: verification.observedOutcome,
          success: verification.success,
          mismatch_notes: verification.mismatchNotes,
        })
        .select()
        .single();
      if (error) throw error;
      return verificationFromRow(must(data, 'inserted verification row'));
    },

    async getAgent(id: string) {
      const { data, error } = await client.from('ai_agents').select().eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? agentFromRow(data) : null;
    },

    async listAgents() {
      const { data, error } = await client.from('ai_agents').select();
      if (error) throw error;
      return (data ?? []).map(agentFromRow);
    },

    async getSop(id: string) {
      const { data, error } = await client.from('ai_sops').select().eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? sopFromRow(data) : null;
    },

    async listSops() {
      const { data, error } = await client.from('ai_sops').select();
      if (error) throw error;
      return (data ?? []).map(sopFromRow);
    },

    async getFeatureFlag(key: string, companyId: string) {
      const { data: companyRow, error: companyErr } = await client
        .from('ai_feature_flags')
        .select()
        .eq('key', key)
        .eq('company_id', companyId)
        .maybeSingle();
      if (companyErr) throw companyErr;
      if (companyRow) {
        return { key, enabled: Boolean(companyRow.enabled), companyId } as FeatureFlagState;
      }
      const { data: globalRow, error: globalErr } = await client
        .from('ai_feature_flags')
        .select()
        .eq('key', key)
        .is('company_id', null)
        .maybeSingle();
      if (globalErr) throw globalErr;
      if (!globalRow) return null;
      return { key, enabled: Boolean(globalRow.enabled), companyId: null };
    },
  };
}
