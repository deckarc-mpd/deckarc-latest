import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../audit.ts';
import { emitScheduleEvent } from '../events.ts';
import { WorkflowEngine, type SopHandler } from '../workflow.ts';
import { ToolRegistry } from '../tools.ts';

function ctx() {
  return { companyId: 'company-1', projectId: 'project-1', correlationId: newCorrelationId() };
}

test('run() completing with matching expected/observed outcome transitions to completed', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const engine = new WorkflowEngine(audit, repo, new ToolRegistry());
  const c = ctx();
  const trigger = await emitScheduleEvent(audit, c, 'task.delay_reported', { taskId: 't1' });

  const handler: SopHandler = async () => ({
    kind: 'completed',
    expectedOutcome: { updatedCount: 1 },
    observedOutcome: { updatedCount: 1 },
  });

  const result = await engine.run(c, 'sop_x', '1.0.0', trigger, handler);
  assert.equal(result.run.status, 'completed');
  assert.ok(result.run.completedAt);
  assert.equal(repo.verifications.length, 1);
  assert.equal(repo.verifications[0].success, true);
});

test('run() completing with mismatched outcome transitions to failed, not completed', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const engine = new WorkflowEngine(audit, repo, new ToolRegistry());
  const c = ctx();
  const trigger = await emitScheduleEvent(audit, c, 'task.delay_reported', { taskId: 't1' });

  const handler: SopHandler = async () => ({
    kind: 'completed',
    expectedOutcome: { updatedCount: 1 },
    observedOutcome: { updatedCount: 2 }, // mismatch
  });

  const result = await engine.run(c, 'sop_x', '1.0.0', trigger, handler);
  assert.equal(result.run.status, 'failed');
  assert.equal(repo.verifications[0].success, false);
});

test('run() returning waiting_approval parks the workflow run correctly', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const engine = new WorkflowEngine(audit, repo, new ToolRegistry());
  const c = ctx();
  const trigger = await emitScheduleEvent(audit, c, 'task.delay_reported', { taskId: 't1' });

  const handler: SopHandler = async ({ workflowRunId, audit: a }) => {
    const approval = await a.approval(c, workflowRunId, 'hash-1', 'ui');
    return { kind: 'waiting_approval', approvalId: approval.id };
  };

  const result = await engine.run(c, 'sop_x', '1.0.0', trigger, handler);
  assert.equal(result.run.status, 'waiting_approval');
  assert.ok(result.run.waitingOn);
  assert.equal(result.run.completedAt, null);
});

test('resume() only works from waiting_approval and can complete after approval decided', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const engine = new WorkflowEngine(audit, repo, new ToolRegistry());
  const c = ctx();
  const trigger = await emitScheduleEvent(audit, c, 'task.delay_reported', { taskId: 't1' });

  const handler: SopHandler = async ({ workflowRunId, audit: a }) => {
    const [existing] = await a.listApprovalsByWorkflowRun(workflowRunId);
    if (!existing) {
      const approval = await a.approval(c, workflowRunId, 'hash-1', 'ui');
      return { kind: 'waiting_approval', approvalId: approval.id };
    }
    if (existing.decision === 'pending') {
      return { kind: 'waiting_approval', approvalId: existing.id };
    }
    if (existing.decision === 'rejected') {
      return { kind: 'failed', reason: 'approval rejected' };
    }
    return { kind: 'completed', expectedOutcome: { ok: true }, observedOutcome: { ok: true } };
  };

  const first = await engine.run(c, 'sop_x', '1.0.0', trigger, handler);
  assert.equal(first.run.status, 'waiting_approval');

  // Cannot resume a run that isn't waiting.
  const otherTrigger = await emitScheduleEvent(audit, c, 'x', {});
  const completedRun = await engine.run(c, 'sop_y', '1.0.0', otherTrigger, async () => ({
    kind: 'completed',
    expectedOutcome: {},
    observedOutcome: {},
  }));
  await assert.rejects(() => engine.resume(c, completedRun.run.id, trigger, handler));

  // Approve, then resume — should complete now.
  const [approval] = await audit.listApprovalsByWorkflowRun(first.run.id);
  await audit.decideApproval(approval.id, 'approved', 'user-1');
  const resumed = await engine.resume(c, first.run.id, trigger, handler);
  assert.equal(resumed.run.status, 'completed');
});

test('a handler that throws leaves the workflow run failed and propagates the error', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const engine = new WorkflowEngine(audit, repo, new ToolRegistry());
  const c = ctx();
  const trigger = await emitScheduleEvent(audit, c, 'task.delay_reported', { taskId: 't1' });

  const handler: SopHandler = async () => {
    throw new Error('boom');
  };

  await assert.rejects(() => engine.run(c, 'sop_x', '1.0.0', trigger, handler), /boom/);
  const runs = await repo.listWorkflowRunsByCorrelation(c.correlationId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'failed');
});

test('replay() re-runs the same SOP against the same trigger and produces matching tool-call decisions', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const engine = new WorkflowEngine(audit, repo, new ToolRegistry());
  const c = ctx();
  const trigger = await emitScheduleEvent(audit, c, 'task.delay_reported', { taskId: 't1', delayDays: 2 });

  // A deterministic handler: the "request hash" it records is derived purely
  // from the trigger event payload, so replaying with the same trigger event
  // must produce the identical hash.
  const handler: SopHandler = async ({ workflowRunId, audit: a, triggerEvent }) => {
    const hash = `hash:${JSON.stringify(triggerEvent.payload)}`;
    await a.toolCall(c, {
      workflowRunId,
      agentRunId: null,
      toolName: 'cascade_delay',
      action: 'execute',
      authorizedActor: { type: 'system', id: 'system' },
      requestHash: hash,
      requestPayload: triggerEvent.payload,
      provider: null,
      externalId: null,
      result: { ok: true },
      status: 'success',
      dryRun: false,
    });
    return { kind: 'completed', expectedOutcome: { ok: true }, observedOutcome: { ok: true } };
  };

  const original = await engine.run(c, 'sop_x', '1.0.0', trigger, handler);
  const replayResult = await engine.replay(c, original.run.id, handler);

  assert.equal(replayResult.deterministicMatch, true);
  assert.equal(replayResult.originalToolHashes.length, 1);
  assert.deepEqual(replayResult.originalToolHashes, replayResult.replayToolHashes);
  // Replay must be a distinct, new workflow run — never a mutation of the original.
  assert.notEqual(replayResult.replay.run.id, original.run.id);
  assert.notEqual(replayResult.replay.run.correlationId, original.run.correlationId);
  assert.equal(replayResult.replay.run.status, 'completed');
});
