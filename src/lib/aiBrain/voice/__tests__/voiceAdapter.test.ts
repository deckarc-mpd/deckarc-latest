// Phase 6 exit-gate proof: "voice query/update/action/correction works
// through the same tools and audit system as non-voice input." Every
// assertion below is checking that the SAME WorkflowEngine/AuditLog state
// a UI-triggered run would produce comes out the other end of a voice turn
// — not a parallel voice-only outcome.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog } from '../../audit.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry, type ToolDefinition } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createTomorrowReadinessHandler } from '../../sops/tomorrowReadiness.ts';
import { taskDelayCascadeHandler } from '../../sops/taskDelayCascade.ts';
import { DeterministicRiskInterpreter } from '../../domains/projectOps/aiInterpreter.ts';
import { handleVoiceTurn, cancelPendingVoiceAction, type VoiceAdapterDeps } from '../voiceAdapter.ts';
import type { VoiceSession, VoiceEntityDirectory } from '../types.ts';
import type { CascadeDelayArgs, CascadeDelayResult } from '../../tools/cascadeDelayTool.ts';
import type { SweepProjectInput } from '../../scheduling/sweepOrchestrator.ts';

const DIRECTORY: VoiceEntityDirectory = {
  projects: [{ id: 'proj-thompson', name: 'Thompson Deck Build' }],
  tasks: [{ id: 'thompson-t1', name: 'Deck Framing', projectId: 'proj-thompson' }],
};

const mockCascadeDelayTool: ToolDefinition<CascadeDelayArgs, CascadeDelayResult> = {
  name: 'cascade_delay',
  description: 'mock cascade tool for voice adapter tests',
  supportsDryRun: true,
  async execute(args) {
    return {
      updatedCount: args.delayDays > 0 ? 2 : 0,
      newProjectFinish: args.delayDays >= 2 ? '2026-09-10' : null, // >=2 days is "consequential" -> requires approval, matching Phase 1's fixture.
    };
  },
};

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  tools.register(mockCascadeDelayTool);
  const engine = new WorkflowEngine(audit, repo, tools);

  const sweepData: SweepProjectInput = {
    projectId: 'proj-thompson', status: 'In Progress', asOfDate: '2026-08-13',
    tasks: [{ id: 'thompson-t1', project_id: 'proj-thompson', task_name: 'Deck Framing', status: 'In Progress', planned_start_date: null, projected_start_date: null, dependency_task_id: null, schedule_locked: false, blocked_reason: '' }],
    crewConfirmations: [{ id: 'thompson-c1', project_id: 'proj-thompson', task_id: 'thompson-t1', scheduled_date: '2026-08-13', confirmation_status: 'Confirmed', crew_available: true, start_time_confirmed: true, site_access_confirmed: true, questions_before_arrival: '', confirmation_notes: '' }],
    materials: [],
    dailyUpdates: [{ id: 'thompson-u1', project_id: 'proj-thompson', task_id: 'thompson-t1', update_date: '2026-08-12', current_status: 'On track', blockers: '', delay_reason: '', delay_days: 0, materials_pending: '', weather_issue: '' }],
  };

  const deps: VoiceAdapterDeps = {
    audit, repo, engine, directory: DIRECTORY,
    handlersBySopId: {
      tomorrow_readiness_v1: createTomorrowReadinessHandler(new DeterministicRiskInterpreter()),
      task_delay_cascade_v1: taskDelayCascadeHandler,
    },
    loadProjectSweepData: async () => sweepData,
  };

  const session: VoiceSession = { userId: 'user-owner-1', companyId: 'company-1', activeProjectId: null };
  return { repo, audit, engine, deps, session };
}

test('query: a readiness question runs tomorrow_readiness_v1 through the real WorkflowEngine and speaks its actual result', async () => {
  const { repo, deps, session } = buildHarness();
  const result = await handleVoiceTurn(session, { text: "What's the readiness for the Thompson Deck Build tomorrow?", confidence: 0.9 }, null, deps);

  assert.equal(result.status, 'completed');
  assert.ok(result.workflowRunId);
  assert.match(result.spokenResponse, /ready|at risk|blocked/);

  // The SAME audit trail a scheduled sweep or UI trigger would produce exists for this run.
  const run = await repo.getWorkflowRun(result.workflowRunId!);
  assert.equal(run?.sopId, 'tomorrow_readiness_v1');
  const calls = await repo.listToolCallsByWorkflowRun(result.workflowRunId!);
  assert.ok(calls.some((c) => c.toolName === 'compute_tomorrow_readiness'));
});

test('action: a consequential delay report runs task_delay_cascade_v1 and stops for confirmation exactly like a UI trigger would', async () => {
  const { deps, session } = buildHarness();
  const result = await handleVoiceTurn(session, { text: 'Push back the Deck Framing task by 3 days, supplier delay', confidence: 0.92 }, null, deps);

  assert.equal(result.status, 'waiting_confirmation');
  assert.ok(result.pendingApprovalId, 'a consequential cascade must produce the same approval gate a UI trigger would hit');
  assert.match(result.spokenResponse, /confirm/i);
});

test('update: approving the pending action by voice resumes the SAME workflow run and completes it via the real approval mechanism', async () => {
  const { repo, deps, session } = buildHarness();
  const first = await handleVoiceTurn(session, { text: 'Push back the Deck Framing task by 3 days, supplier delay', confidence: 0.92 }, null, deps);
  assert.equal(first.status, 'waiting_confirmation');

  const second = await handleVoiceTurn(session, { text: 'Marcus, approve that', confidence: 0.9 }, first.pendingApprovalId, deps);
  assert.equal(second.status, 'completed');
  assert.match(second.spokenResponse, /confirmed/i);

  const [approval] = await repo.listApprovalsByWorkflowRun(first.workflowRunId!);
  assert.equal(approval.decision, 'approved');
  assert.equal(approval.approverUserId, 'user-owner-1'); // the authenticated voice session's user, never a guessed "voice" actor
});

test('correction (barge-in): cancelling the pending action rejects the SAME approval a UI Reject button would, never a parallel cancel path', async () => {
  const { repo, deps, session } = buildHarness();
  const first = await handleVoiceTurn(session, { text: 'Push back the Deck Framing task by 3 days, supplier delay', confidence: 0.92 }, null, deps);
  assert.equal(first.status, 'waiting_confirmation');

  const cancelled = await cancelPendingVoiceAction(session, first.pendingApprovalId!, deps);
  assert.match(cancelled.spokenResponse, /cancelled/i);

  const [approval] = await repo.listApprovalsByWorkflowRun(first.workflowRunId!);
  assert.equal(approval.decision, 'rejected');
  const run = await repo.getWorkflowRun(first.workflowRunId!);
  assert.equal(run?.status, 'failed'); // same outcome Phase 1's UI-rejected test asserts — the proposed write correctly never happened.
});

test('low confidence on a consequential utterance requires read-back BEFORE any workflow run is created', async () => {
  const { repo, deps, session } = buildHarness();
  const before = repo.workflowRuns.length;
  const result = await handleVoiceTurn(session, { text: 'Push back the Deck Framing task by 3 days', confidence: 0.7 }, null, deps);

  assert.equal(result.status, 'needs_readback');
  assert.equal(repo.workflowRuns.length, before, 'no workflow run should be created until confidence clears the consequential threshold');
});

test('an unauthenticated session is rejected outright — speaker recognition alone is never authorization', async () => {
  const { deps } = buildHarness();
  const unauthenticated: VoiceSession = { userId: '', companyId: 'company-1', activeProjectId: null };
  const result = await handleVoiceTurn(unauthenticated, { text: 'Approve that', confidence: 0.95 }, 'appr-1', deps);
  assert.equal(result.status, 'failed');
  assert.match(result.spokenResponse, /sign in/i);
});

test('unrecognized speech never invokes any tool or workflow', async () => {
  const { repo, deps, session } = buildHarness();
  const before = repo.workflowRuns.length;
  const result = await handleVoiceTurn(session, { text: 'Tell me a joke', confidence: 0.95 }, null, deps);
  assert.equal(result.status, 'unrecognized');
  assert.equal(repo.workflowRuns.length, before);
});
