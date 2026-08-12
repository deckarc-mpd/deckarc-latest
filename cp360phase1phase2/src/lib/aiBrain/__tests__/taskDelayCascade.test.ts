// End-to-end vertical slice: event -> policy -> approval/tool -> verification
// -> audit, using the real task_delay_cascade_v1 SOP handler and a mock
// cascade_delay tool standing in for the real Supabase-backed one (this
// sandbox has no live database connection — see tools/cascadeDelayTool.ts).
// The mock honors the exact same dry-run/real-run contract the real tool
// commits to, so this proves the SOP's own control flow, not the mock.
//
// This is the concrete demonstration required by
// CP360_AI_IMPLEMENTATION_PLAN.md's Phase 1 exit gate: "one event or
// scheduled trigger can run SOP -> policy -> approval/tool -> verification
// -> audit, and can be replayed."

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../audit.ts';
import { emitUiEvent } from '../events.ts';
import { WorkflowEngine } from '../workflow.ts';
import { ToolRegistry, type ToolDefinition } from '../tools.ts';
import { seedMemoryRegistry } from '../registry.ts';
import { taskDelayCascadeHandler, type TaskDelayReportedPayload } from '../sops/taskDelayCascade.ts';
import type { CascadeDelayArgs, CascadeDelayResult } from '../tools/cascadeDelayTool.ts';

function ctx() {
  return { companyId: 'company-1', projectId: 'project-1', correlationId: newCorrelationId() };
}

/** Deterministic mock standing in for the real Supabase-backed cascade tool. */
const mockCascadeDelayTool: ToolDefinition<CascadeDelayArgs, CascadeDelayResult> = {
  name: 'cascade_delay',
  description: 'mock cascade tool for testing',
  supportsDryRun: true,
  async execute(args) {
    // Deterministic function of the args only, so dry-run preview and the
    // later real execution (and any replay) agree, and two runs given the
    // same args always produce the same result.
    return {
      updatedCount: args.delayDays > 0 ? 3 : 0,
      newProjectFinish: args.delayDays >= 2 ? '2026-09-15' : null,
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
  return { repo, audit, tools, engine };
}

function delayPayload(): TaskDelayReportedPayload {
  return {
    projectId: 'project-1',
    taskId: 'task-1',
    delayDays: 2, // >=2 triggers newProjectFinish in the mock, i.e. "consequential"
    reason: 'Supplier delay',
    responsibleParty: 'Subcontractor',
    reportedByUserId: 'field-user-1',
  };
}

test('event -> policy -> approval -> tool -> verification -> audit, end to end', async () => {
  const { repo, audit, engine } = buildHarness();
  const c = ctx();

  // 1. EVENT — a field user reports a delay through the UI.
  const event = await emitUiEvent(audit, c, 'field-user-1', 'task.delay_reported', delayPayload() as unknown as Record<string, unknown>);

  // 2. SOP -> POLICY: project_operations is L2 for writes, and this cascade
  // pushes the project finish date, so the SOP must stop and require approval.
  const first = await engine.run(c, 'task_delay_cascade_v1', '1.0.0', event, taskDelayCascadeHandler);
  assert.equal(first.run.status, 'waiting_approval');
  assert.ok(first.run.waitingOn);

  // A dry-run preview tool call happened (and was audited) before any approval gate.
  const callsAfterPreview = await repo.listToolCallsByWorkflowRun(first.run.id);
  assert.equal(callsAfterPreview.length, 1);
  assert.equal(callsAfterPreview[0].dryRun, true);
  assert.equal(callsAfterPreview[0].status, 'success');

  // An approval record exists, pending, correlated to this workflow run.
  const [approval] = await repo.listApprovalsByWorkflowRun(first.run.id);
  assert.ok(approval);
  assert.equal(approval.decision, 'pending');
  assert.equal(approval.correlationId, c.correlationId);

  // 3. APPROVAL — a company admin approves it.
  await audit.decideApproval(approval.id, 'approved', 'admin-user-1');

  // 4. RESUME -> TOOL (real execution) -> VERIFICATION -> AUDIT.
  const second = await engine.resume(c, first.run.id, event, taskDelayCascadeHandler);
  assert.equal(second.run.status, 'completed');
  assert.ok(second.run.completedAt);

  // The handler re-previews on every invocation (including resume) as a
  // deliberate stale-state safety check before ever writing for real — so
  // resuming after approval adds a second dry-run preview plus the one real
  // execution: 2 dry-run calls + 1 real call = 3 total across run()+resume().
  const allCalls = await repo.listToolCallsByWorkflowRun(first.run.id);
  assert.equal(allCalls.length, 3);
  const dryRunCalls = allCalls.filter((call) => call.dryRun);
  const realCalls = allCalls.filter((call) => !call.dryRun);
  assert.equal(dryRunCalls.length, 2);
  assert.equal(realCalls.length, 1);
  assert.equal(realCalls[0].status, 'success');

  assert.equal(repo.stateChanges.length, 1);
  assert.equal(repo.stateChanges[0].objectId, 'task-1');

  assert.equal(repo.verifications.length, 1);
  assert.equal(repo.verifications[0].success, true); // expected (from preview) matched observed (from real run)

  // Everything for this run shares one correlation id, per Frozen §12.
  const allRecordCorrelationIds = [
    event.correlationId,
    first.run.correlationId,
    ...allCalls.map((tc) => tc.correlationId),
    approval.correlationId,
    repo.stateChanges[0].correlationId,
    repo.verifications[0].correlationId,
  ];
  assert.ok(allRecordCorrelationIds.every((id) => id === c.correlationId));
});

test('a rejected approval fails the workflow and records a human override, never executes the real write', async () => {
  const { repo, audit, engine } = buildHarness();
  const c = ctx();
  const event = await emitUiEvent(audit, c, 'field-user-1', 'task.delay_reported', delayPayload() as unknown as Record<string, unknown>);

  const first = await engine.run(c, 'task_delay_cascade_v1', '1.0.0', event, taskDelayCascadeHandler);
  const [approval] = await repo.listApprovalsByWorkflowRun(first.run.id);
  await audit.decideApproval(approval.id, 'rejected', 'admin-user-1');

  const second = await engine.resume(c, first.run.id, event, taskDelayCascadeHandler);
  assert.equal(second.run.status, 'failed');

  // Two dry-run previews exist (one from run(), one from resume()'s
  // stale-state re-check) but NO real (non-dry-run) call — the write never
  // happened.
  const calls = await repo.listToolCallsByWorkflowRun(first.run.id);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.dryRun));

  assert.equal(repo.humanOverrides.length, 1);
  assert.equal(repo.humanOverrides[0].actionOverridden, 'task_delay_cascade_v1 auto-execution');
});

test('replaying the run reproduces the identical policy decision and preview tool-call hash, without auto-approving', async () => {
  const { repo, audit, engine } = buildHarness();
  const c = ctx();
  const event = await emitUiEvent(audit, c, 'field-user-1', 'task.delay_reported', delayPayload() as unknown as Record<string, unknown>);

  const original = await engine.run(c, 'task_delay_cascade_v1', '1.0.0', event, taskDelayCascadeHandler);
  assert.equal(original.run.status, 'waiting_approval');

  const replayResult = await engine.replay(c, original.run.id, taskDelayCascadeHandler);

  // The replay is a brand-new workflow run — the original is untouched.
  assert.notEqual(replayResult.replay.run.id, original.run.id);
  assert.equal(replayResult.replay.run.correlationId === original.run.correlationId, false);
  const originalStillWaiting = await repo.getWorkflowRun(original.run.id);
  assert.equal(originalStillWaiting?.status, 'waiting_approval');

  // The replay reached the exact same decision (waiting_approval) via the
  // exact same deterministic dry-run preview — proven by matching tool-call
  // request hashes, not just matching outcome kind.
  assert.equal(replayResult.replay.outcome.kind, 'waiting_approval');
  assert.equal(replayResult.deterministicMatch, true);
  assert.equal(replayResult.originalToolHashes.length, 1);
  assert.deepEqual(replayResult.originalToolHashes, replayResult.replayToolHashes);

  // Replay must NOT fabricate or reuse a human approval decision — the
  // replayed run has its own, independent, still-pending approval.
  const replayApprovals = await repo.listApprovalsByWorkflowRun(replayResult.replay.run.id);
  assert.equal(replayApprovals.length, 1);
  assert.equal(replayApprovals[0].decision, 'pending');
  assert.notEqual(replayApprovals[0].id, (await repo.listApprovalsByWorkflowRun(original.run.id))[0].id);
});
