// End-to-end proof for client_communication_draft_v1: event -> policy ->
// tool -> groundedness verification -> approval -> audit, mirroring the
// pattern proven for every prior phase's SOPs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { emitScheduleEvent } from '../../events.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createClientCommunicationDraftHandler, type ClientCommunicationDraftPayload } from '../clientCommunicationDraft.ts';
import { DeterministicDraftClient } from '../../domains/customerSuccess/draftClient.ts';
import type { DraftClient } from '../../domains/customerSuccess/draftClient.ts';
import type { ReadinessDecision, ReadinessDelayReason } from '../../domains/customerSuccess/types.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  return { repo, audit, tools, engine };
}

function ctx() {
  return { companyId: 'company-1', projectId: 'proj-patel', correlationId: newCorrelationId() };
}

test('nothing open: workflow completes immediately, zero AI (agent) runs, no approval created', async () => {
  const { repo, audit, engine } = buildHarness();
  const handler = createClientCommunicationDraftHandler(new DeterministicDraftClient());
  const c = ctx();
  const payload: ClientCommunicationDraftPayload = { projectId: 'proj-patel', asOfDate: '2026-08-13', decisions: [], delayReasons: [] };

  const event = await emitScheduleEvent(audit, c, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'client_communication_draft_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 0);
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
});

test('an open decision produces a grounded draft and escalates for human approval', async () => {
  const { repo, audit, engine } = buildHarness();
  const handler = createClientCommunicationDraftHandler(new DeterministicDraftClient());
  const c = ctx();
  const decisions: ReadinessDecision[] = [
    { id: 'dec-1', project_id: 'proj-patel', decision_title: 'Vanity finish selection', needed_by_date: '2026-08-18', status: 'Needed' },
  ];
  const payload: ClientCommunicationDraftPayload = { projectId: 'proj-patel', asOfDate: '2026-08-13', decisions, delayReasons: [] };
  const event = await emitScheduleEvent(audit, c, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);

  const first = await engine.run(c, 'client_communication_draft_v1', '1.0.0', event, handler);
  assert.equal(first.run.status, 'waiting_approval');
  assert.equal(repo.agentRuns.length, 1);

  const calls = await repo.listToolCallsByWorkflowRun(first.run.id);
  const draftCall = calls.find((call) => call.toolName === 'draft_client_communication')!;
  const drafts = draftCall.result as unknown as Array<{ subject: string; body: string }>;
  assert.equal(drafts.length, 1);
  assert.match(drafts[0].body, /Vanity finish selection/);
  assert.match(drafts[0].body, /2026-08-18/);

  const [approval] = await repo.listApprovalsByWorkflowRun(first.run.id);
  assert.equal(approval.decision, 'pending');

  await audit.decideApproval(approval.id, 'approved', 'admin-user-1');
  const second = await engine.resume(c, first.run.id, event, handler);
  assert.equal(second.run.status, 'completed');
});

test('a rejected draft batch still resolves the workflow to completed (human reviewed it either way)', async () => {
  const { repo, audit, engine } = buildHarness();
  const handler = createClientCommunicationDraftHandler(new DeterministicDraftClient());
  const c = ctx();
  const delayReasons: ReadinessDelayReason[] = [
    { id: 'del-1', project_id: 'proj-patel', delay_category: 'Access', client_safe_reason: 'A site-access issue delayed a subcontractor by one day', revised_projected_completion: null, client_visible: true },
  ];
  const payload: ClientCommunicationDraftPayload = { projectId: 'proj-patel', asOfDate: '2026-08-13', decisions: [], delayReasons };
  const event = await emitScheduleEvent(audit, c, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);

  const first = await engine.run(c, 'client_communication_draft_v1', '1.0.0', event, handler);
  assert.equal(first.run.status, 'waiting_approval');
  const [approval] = await repo.listApprovalsByWorkflowRun(first.run.id);
  await audit.decideApproval(approval.id, 'rejected', 'admin-user-1');

  const second = await engine.resume(c, first.run.id, event, handler);
  assert.equal(second.run.status, 'completed');
});

test('an ungrounded draft fails the workflow run outright and never reaches an approval queue', async () => {
  const { repo, audit, engine } = buildHarness();
  // A deliberately-broken client that ignores its anchors — proves the
  // verification step actually enforces groundedness, not just documents it.
  const brokenClient: DraftClient = {
    async draft() {
      return { subject: 'Please respond', body: 'We would like your input on an upcoming selection.' };
    },
  };
  const handler = createClientCommunicationDraftHandler(brokenClient);
  const c = ctx();
  const decisions: ReadinessDecision[] = [
    { id: 'dec-2', project_id: 'proj-patel', decision_title: 'Backsplash tile pattern', needed_by_date: null, status: 'Needs Decision' },
  ];
  const payload: ClientCommunicationDraftPayload = { projectId: 'proj-patel', asOfDate: '2026-08-13', decisions, delayReasons: [] };
  const event = await emitScheduleEvent(audit, c, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);

  const result = await engine.run(c, 'client_communication_draft_v1', '1.0.0', event, handler);
  assert.equal(result.run.status, 'failed');
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0, 'an ungrounded draft must never reach the approval queue');
});

test('a decision with a client-hidden delay reason (client_visible=false) never gets drafted, even with a populated client_safe_reason', async () => {
  const { audit, engine } = buildHarness();
  const handler = createClientCommunicationDraftHandler(new DeterministicDraftClient());
  const c = ctx();
  const delayReasons: ReadinessDelayReason[] = [
    { id: 'del-2', project_id: 'proj-patel', delay_category: 'Labor', client_safe_reason: 'A scheduling conflict pushed the crew by a day', revised_projected_completion: '2026-08-20', client_visible: false },
  ];
  const payload: ClientCommunicationDraftPayload = { projectId: 'proj-patel', asOfDate: '2026-08-13', decisions: [], delayReasons };
  const event = await emitScheduleEvent(audit, c, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);

  const result = await engine.run(c, 'client_communication_draft_v1', '1.0.0', event, handler);
  assert.equal(result.run.status, 'completed'); // nothing to draft -> completes immediately, no escalation
});
