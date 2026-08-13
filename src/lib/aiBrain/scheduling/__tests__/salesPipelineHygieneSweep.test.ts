import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { DeterministicFollowUpDraftClient } from '../../domains/sales/followUpDraftClient.ts';
import { runSalesPipelineHygieneSweep } from '../sweepOrchestrator.ts';
import type { ReadinessLead } from '../../domains/sales/types.ts';

test('runs once for the whole company (not per-project), always records a summary', async () => {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };

  const leads: ReadinessLead[] = [
    { id: 'l1', full_name: 'Sam Lee', company_name: 'Lee Builders', status: 'new', created_at: '2026-08-01T00:00:00Z' },
    { id: 'l2', full_name: 'Ada Chen', company_name: 'Chen Homes', status: 'qualified', created_at: '2026-01-01T00:00:00Z' },
  ];

  const summary = await runSalesPipelineHygieneSweep(ctx, audit, repo, engine, '2026-08-13', leads, new DeterministicFollowUpDraftClient());

  assert.equal(summary.sopId, 'sales_pipeline_hygiene_v1');
  assert.equal(summary.exceptionsFound, 1); // l1 is stale, l2 is qualified (terminal)
  const summaryEvents = repo.events.filter((e) => e.eventType === 'schedule.sales_pipeline_hygiene_completed');
  assert.equal(summaryEvents.length, 1);
});
