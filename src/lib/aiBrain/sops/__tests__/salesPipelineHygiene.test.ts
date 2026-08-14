// End-to-end proof for sales_pipeline_hygiene_v1, mirroring
// client_communication_draft_v1's proven pattern.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { emitScheduleEvent } from '../../events.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createSalesPipelineHygieneHandler, type SalesPipelineHygienePayload } from '../salesPipelineHygiene.ts';
import { DeterministicFollowUpDraftClient } from '../../domains/sales/followUpDraftClient.ts';
import type { FollowUpDraftClient } from '../../domains/sales/followUpDraftClient.ts';

function buildHarness(client: FollowUpDraftClient = new DeterministicFollowUpDraftClient()) {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createSalesPipelineHygieneHandler(client);
  return { repo, audit, engine, handler };
}

function ctx() {
  return { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
}

test('no stale leads: completes immediately, zero AI calls, no approval', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: SalesPipelineHygienePayload = { asOfDate: '2026-08-13', leads: [{ id: 'l1', full_name: 'Sam Lee', company_name: 'Lee Builders', status: 'new', created_at: '2026-08-13T00:00:00Z' }] };
  const event = await emitScheduleEvent(audit, c, 'schedule.sales_pipeline_hygiene', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'sales_pipeline_hygiene_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 0);
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
});

test('a stale lead produces a grounded follow-up draft and escalates for approval', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: SalesPipelineHygienePayload = { asOfDate: '2026-08-13', leads: [{ id: 'l1', full_name: 'Priya Nair', company_name: 'Nair Homes', status: 'new', created_at: '2026-08-08T00:00:00Z' }] };
  const event = await emitScheduleEvent(audit, c, 'schedule.sales_pipeline_hygiene', payload as unknown as Record<string, unknown>);

  const first = await engine.run(c, 'sales_pipeline_hygiene_v1', '1.0.0', event, handler);
  assert.equal(first.run.status, 'waiting_approval');
  assert.equal(repo.agentRuns.length, 1);

  const [approval] = await repo.listApprovalsByWorkflowRun(first.run.id);
  await audit.decideApproval(approval.id, 'approved', 'admin-1');
  const second = await engine.resume(c, first.run.id, event, handler);
  assert.equal(second.run.status, 'completed');
});

test('an ungrounded follow-up draft fails the run outright, never reaching an approval queue', async () => {
  const brokenClient: FollowUpDraftClient = { async draft() { return { subject: 'Checking in', body: 'Hope things are going well!' }; } };
  const { repo, audit, engine, handler } = buildHarness(brokenClient);
  const c = ctx();
  const payload: SalesPipelineHygienePayload = { asOfDate: '2026-08-13', leads: [{ id: 'l1', full_name: 'Priya Nair', company_name: 'Nair Homes', status: 'new', created_at: '2026-08-08T00:00:00Z' }] };
  const event = await emitScheduleEvent(audit, c, 'schedule.sales_pipeline_hygiene', payload as unknown as Record<string, unknown>);

  const result = await engine.run(c, 'sales_pipeline_hygiene_v1', '1.0.0', event, handler);
  assert.equal(result.run.status, 'failed');
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
});
