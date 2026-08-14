import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionCenterQueues, totalActionCenterItems } from '../queues.ts';
import type { ActionCenterInput } from '../queues.ts';
import type { BoardItemSummary } from '../../../../actionBoardHelpers.ts';
import type { ApprovalRecord, WorkflowRun } from '../../../types.ts';

function boardItem(overrides: Partial<BoardItemSummary>): BoardItemSummary {
  return { id: 'item-1', category: 'critical', title: 'Item', subtitle: '', projectId: 'proj-1', ...overrides };
}

function workflowRun(overrides: Partial<WorkflowRun>): WorkflowRun {
  return {
    id: 'wfr-1', companyId: 'company-1', projectId: 'proj-1', correlationId: 'corr-1',
    sopId: 'tomorrow_readiness_v1', sopVersion: '1.0.0', triggerEventId: 'evt-1',
    status: 'completed', waitingOn: null, dueAt: null,
    startedAt: '2026-08-13T00:00:00.000Z', completedAt: '2026-08-13T00:00:01.000Z',
    createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:01.000Z',
    ...overrides,
  };
}

function approval(overrides: Partial<ApprovalRecord>): ApprovalRecord {
  return {
    id: 'appr-1', companyId: 'company-1', projectId: 'proj-1', correlationId: 'corr-1',
    workflowRunId: 'wfr-1', payloadHash: 'hash', payloadVersion: '1', approverUserId: null,
    decision: 'pending', channel: 'ui', decidedAt: null, createdAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  };
}

function emptyInput(): ActionCenterInput {
  return {
    criticalItems: [], needsReviewItems: [], pendingApprovals: [],
    runningWorkflowRuns: [], completedWorkflowRuns: [], failedWorkflowRuns: [],
  };
}

test('an empty input produces six empty queues, not an error', () => {
  const queues = buildActionCenterQueues(emptyInput());
  assert.equal(totalActionCenterItems(queues), 0);
  assert.deepEqual(Object.keys(queues).sort(), [
    'aiHandling', 'blocked', 'completed', 'criticalNow', 'needsMyDecision', 'watching',
  ]);
});

test('a pending approval lands in Needs My Decision, carrying the SOP title and project id', () => {
  const run = workflowRun({ id: 'wfr-1', projectId: 'proj-thompson', status: 'waiting_approval' });
  const input: ActionCenterInput = {
    ...emptyInput(),
    pendingApprovals: [{ approval: approval({ id: 'appr-1', workflowRunId: 'wfr-1' }), run, sopTitle: 'Trade & Material Coordination' }],
  };
  const queues = buildActionCenterQueues(input);
  assert.equal(queues.needsMyDecision.length, 1);
  assert.equal(queues.needsMyDecision[0].title, 'Trade & Material Coordination');
  assert.equal(queues.needsMyDecision[0].projectId, 'proj-thompson');
});

test('a critical item whose project ALSO has a pending approval is excluded from Critical Now (no duplicate attention)', () => {
  const run = workflowRun({ id: 'wfr-1', projectId: 'proj-thompson', status: 'waiting_approval' });
  const input: ActionCenterInput = {
    ...emptyInput(),
    criticalItems: [boardItem({ id: 'c1', projectId: 'proj-thompson' }), boardItem({ id: 'c2', projectId: 'proj-other' })],
    pendingApprovals: [{ approval: approval({ workflowRunId: 'wfr-1' }), run, sopTitle: 'Trade & Material Coordination' }],
  };
  const queues = buildActionCenterQueues(input);
  assert.equal(queues.needsMyDecision.length, 1);
  // Only the OTHER project's critical item survives into Critical Now.
  assert.equal(queues.criticalNow.length, 1);
  assert.equal(queues.criticalNow[0].projectId, 'proj-other');
});

test('running/completed/failed workflow runs land in AI Handling / Completed / Blocked respectively', () => {
  const input: ActionCenterInput = {
    ...emptyInput(),
    runningWorkflowRuns: [{ run: workflowRun({ id: 'r1', status: 'running' }), sopTitle: 'Tomorrow Readiness' }],
    completedWorkflowRuns: [{ run: workflowRun({ id: 'c1', status: 'completed' }), sopTitle: 'Tomorrow Readiness' }],
    failedWorkflowRuns: [{ run: workflowRun({ id: 'f1', status: 'failed' }), sopTitle: 'Task Delay Cascade' }],
  };
  const queues = buildActionCenterQueues(input);
  assert.equal(queues.aiHandling.length, 1);
  assert.equal(queues.aiHandling[0].id, 'running-r1');
  assert.equal(queues.completed.length, 1);
  assert.equal(queues.completed[0].id, 'completed-c1');
  assert.equal(queues.blocked.length, 1);
  assert.equal(queues.blocked[0].id, 'blocked-f1');
});

test('needs-review items land in Watching, unfiltered', () => {
  const input: ActionCenterInput = {
    ...emptyInput(),
    needsReviewItems: [boardItem({ id: 'nr1', category: 'needs-review', title: 'Task needs review' })],
  };
  const queues = buildActionCenterQueues(input);
  assert.equal(queues.watching.length, 1);
  assert.equal(queues.watching[0].title, 'Task needs review');
});

test('totalActionCenterItems sums across all six queues', () => {
  const run = workflowRun({ id: 'wfr-1', status: 'waiting_approval' });
  const input: ActionCenterInput = {
    criticalItems: [boardItem({ id: 'c1', projectId: 'proj-other' })],
    needsReviewItems: [boardItem({ id: 'nr1' })],
    pendingApprovals: [{ approval: approval({ workflowRunId: 'wfr-1' }), run, sopTitle: 'x' }],
    runningWorkflowRuns: [{ run: workflowRun({ id: 'r1', status: 'running' }), sopTitle: 'x' }],
    completedWorkflowRuns: [{ run: workflowRun({ id: 'c2', status: 'completed' }), sopTitle: 'x' }],
    failedWorkflowRuns: [{ run: workflowRun({ id: 'f1', status: 'failed' }), sopTitle: 'x' }],
  };
  const queues = buildActionCenterQueues(input);
  assert.equal(totalActionCenterItems(queues), 6);
});
