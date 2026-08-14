import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { DeterministicFinanceInterpreter } from '../../domains/finance/aiInterpreter.ts';
import { defaultScheduleConfig } from '../schedulingConfig.ts';
import { runBillingArMarginSweep, type FinanceSweepProjectInput } from '../sweepOrchestrator.ts';

test('sweeps every eligible project, skips ineligible ones, and always records a summary', async () => {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const projects: FinanceSweepProjectInput[] = [
    { projectId: 'proj-healthy', status: 'In Progress', contractAmount: 200000, milestones: [], vendorBills: [], costEntries: [{ id: 'c1', project_id: 'proj-healthy', category: 'Material', amount: 50000, source: 'material' }], changeOrders: [] },
    { projectId: 'proj-thin-margin', status: 'In Progress', contractAmount: 100000, milestones: [], vendorBills: [], costEntries: [{ id: 'c2', project_id: 'proj-thin-margin', category: 'Labor', amount: 92000, source: 'labor' }], changeOrders: [] },
    { projectId: 'proj-done', status: 'Completed', contractAmount: null, milestones: [], vendorBills: [], costEntries: [], changeOrders: [] },
  ];

  const summary = await runBillingArMarginSweep(ctx, audit, repo, engine, config, '2026-08-13', projects, new DeterministicFinanceInterpreter());

  assert.equal(summary.sopId, 'billing_ar_margin_sweep_v1');
  assert.equal(summary.projectsEvaluated, 2);
  assert.equal(summary.projectsSkippedIneligible, 1);
  assert.equal(summary.exceptionsFound, 1); // proj-thin-margin

  const summaryEvents = repo.events.filter((e) => e.eventType === 'schedule.billing_ar_margin_sweep_completed');
  assert.equal(summaryEvents.length, 1);
});
