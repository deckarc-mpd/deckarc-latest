import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../audit.ts';

function ctx() {
  return { companyId: 'company-1', projectId: 'project-1', correlationId: newCorrelationId() };
}

test('AuditLog.event writes a correlated event record', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const c = ctx();

  const event = await audit.event(
    c,
    'schedule',
    { type: 'schedule', id: 'scheduler' },
    'task.delay_reported',
    { taskId: 't1', delayDays: 2 }
  );

  assert.equal(event.companyId, c.companyId);
  assert.equal(event.correlationId, c.correlationId);
  assert.equal(event.eventType, 'task.delay_reported');
  assert.ok(event.id);
  assert.ok(event.createdAt);
});

test('workflow run status transitions are validated', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const c = ctx();
  const event = await audit.event(c, 'system', { type: 'system', id: 'system' }, 'x', {});

  const run = await audit.startWorkflowRun(c, 'sop_1', '1.0.0', event.id);
  assert.equal(run.status, 'pending');

  const running = await audit.transitionWorkflowRun(run.id, 'running');
  assert.equal(running.status, 'running');

  // pending -> completed is not a valid direct transition (must go through running).
  await assert.rejects(() => repo.updateWorkflowRun(run.id, { status: 'pending' }));

  const completed = await audit.transitionWorkflowRun(run.id, 'completed');
  assert.equal(completed.status, 'completed');
  assert.ok(completed.completedAt);

  // completed is terminal — no further transition allowed.
  await assert.rejects(() => audit.transitionWorkflowRun(run.id, 'running'));
});

test('tool call, approval, state change, human override, and verification all record correlated data', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const c = ctx();
  const event = await audit.event(c, 'ui', { type: 'human', id: 'user-1' }, 'x', {});
  const run = await audit.startWorkflowRun(c, 'sop_1', '1.0.0', event.id);

  const toolCall = await audit.toolCall(c, {
    workflowRunId: run.id,
    agentRunId: null,
    toolName: 'cascade_delay',
    action: 'execute',
    authorizedActor: { type: 'system', id: 'system' },
    requestHash: 'hash-1',
    requestPayload: { taskId: 't1' },
    provider: null,
    externalId: null,
    result: { updatedCount: 3 },
    status: 'success',
    dryRun: false,
  });
  assert.equal(toolCall.workflowRunId, run.id);
  assert.equal(toolCall.correlationId, c.correlationId);

  const approval = await audit.approval(c, run.id, 'payload-hash-1', 'ui');
  assert.equal(approval.decision, 'pending');
  const decided = await audit.decideApproval(approval.id, 'approved', 'user-1');
  assert.equal(decided.decision, 'approved');
  assert.equal(decided.approverUserId, 'user-1');

  const stateChange = await audit.stateChange(c, {
    workflowRunId: run.id,
    objectType: 'task',
    objectId: 't1',
    before: { status: 'In Progress' },
    after: { status: 'Delayed' },
    reason: 'delay reported',
    source: 'ui',
  });
  assert.equal(stateChange.objectId, 't1');

  const override = await audit.humanOverride(c, {
    workflowRunId: run.id,
    userId: 'user-1',
    actionOverridden: 'auto-cascade',
    reason: 'manual correction needed',
  });
  assert.equal(override.userId, 'user-1');

  const verification = await audit.verification(c, {
    workflowRunId: run.id,
    expectedOutcome: { newProjectFinish: '2026-09-01' },
    observedOutcome: { newProjectFinish: '2026-09-01' },
    success: true,
    mismatchNotes: null,
  });
  assert.equal(verification.success, true);

  // Every record for this workflow run carries the same correlation id.
  const allCorrelationIds = [toolCall, approval, stateChange, override, verification].map(
    (r) => r.correlationId
  );
  assert.ok(allCorrelationIds.every((id) => id === c.correlationId));
});

test('listToolCallsByWorkflowRun and listWorkflowRunsByCorrelation scope correctly', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const c1 = ctx();
  const c2 = ctx();

  const e1 = await audit.event(c1, 'ui', { type: 'human', id: 'u1' }, 'x', {});
  const run1 = await audit.startWorkflowRun(c1, 'sop_1', '1.0.0', e1.id);
  const e2 = await audit.event(c2, 'ui', { type: 'human', id: 'u2' }, 'x', {});
  const run2 = await audit.startWorkflowRun(c2, 'sop_1', '1.0.0', e2.id);

  await audit.toolCall(c1, {
    workflowRunId: run1.id,
    agentRunId: null,
    toolName: 'noop',
    action: 'execute',
    authorizedActor: { type: 'system', id: 'system' },
    requestHash: 'h1',
    requestPayload: {},
    provider: null,
    externalId: null,
    result: null,
    status: 'success',
    dryRun: false,
  });

  const run1Calls = await repo.listToolCallsByWorkflowRun(run1.id);
  const run2Calls = await repo.listToolCallsByWorkflowRun(run2.id);
  assert.equal(run1Calls.length, 1);
  assert.equal(run2Calls.length, 0);

  const runsForC1 = await repo.listWorkflowRunsByCorrelation(c1.correlationId);
  assert.equal(runsForC1.length, 1);
  assert.equal(runsForC1[0].id, run1.id);
});
