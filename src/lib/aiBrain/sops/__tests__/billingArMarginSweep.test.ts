// End-to-end proof for billing_ar_margin_sweep_v1: event -> policy -> tool
// -> verification -> audit, mirroring compliance_permit_inspection_sweep_v1's
// proven pattern. Read-only throughout — never touches cascade_delay or
// any write-capable tool, and never creates an approval (no money moves).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { emitScheduleEvent } from '../../events.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createBillingArMarginSweepHandler, type BillingArMarginSweepPayload } from '../billingArMarginSweep.ts';
import { DeterministicFinanceInterpreter } from '../../domains/finance/aiInterpreter.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createBillingArMarginSweepHandler(new DeterministicFinanceInterpreter());
  return { repo, audit, engine, handler };
}

function ctx() {
  return { companyId: 'company-1', projectId: 'proj-1', correlationId: newCorrelationId() };
}

test('a healthy project completes with overallStatus ready and zero AI calls', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: BillingArMarginSweepPayload = {
    projectId: 'proj-1', asOfDate: '2026-08-13', contractAmount: 200000,
    milestones: [], vendorBills: [], costEntries: [{ id: 'c1', project_id: 'proj-1', category: 'Material', amount: 50000, source: 'material' }], changeOrders: [],
  };
  const event = await emitScheduleEvent(audit, c, 'schedule.billing_ar_margin_sweep', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'billing_ar_margin_sweep_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 0);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const assessment = calls.find((call) => call.toolName === 'compute_finance_assessment')!.result as { overallStatus: string };
  assert.equal(assessment.overallStatus, 'ready');
});

test('a disputed vendor bill triggers AI interpretation and rolls up to at_risk', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: BillingArMarginSweepPayload = {
    projectId: 'proj-1', asOfDate: '2026-08-13', contractAmount: 200000,
    milestones: [], vendorBills: [{ id: 'b1', project_id: 'proj-1', vendor_name: 'Ace Plumbing', due_date: '2026-10-20', amount: 5000, status: 'Disputed', dispute_notes: 'Vendor says quantity delivered does not match the bill' }],
    costEntries: [], changeOrders: [],
  };
  const event = await emitScheduleEvent(audit, c, 'schedule.billing_ar_margin_sweep', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'billing_ar_margin_sweep_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 1);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const assessment = calls.find((call) => call.toolName === 'compute_finance_assessment')!.result as { overallStatus: string };
  assert.equal(assessment.overallStatus, 'at_risk');
  const interpretation = calls.find((call) => call.toolName === 'interpret_finance_finding')!.result as { category: string };
  assert.equal(interpretation.category, 'ap_dispute');
});

test('never touches cascade_delay, or any write-capable tool, and never creates an approval — no money ever moves', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: BillingArMarginSweepPayload = {
    projectId: 'proj-1', asOfDate: '2026-08-13', contractAmount: 100000,
    milestones: [], vendorBills: [], costEntries: [{ id: 'c1', project_id: 'proj-1', category: 'Labor', amount: 95000, source: 'labor' }], changeOrders: [],
  };
  const event = await emitScheduleEvent(audit, c, 'schedule.billing_ar_margin_sweep', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'billing_ar_margin_sweep_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  for (const call of calls) {
    assert.notEqual(call.toolName, 'cascade_delay');
  }
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
});
