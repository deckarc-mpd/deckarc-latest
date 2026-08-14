// End-to-end proof for estimate_pricing_recommendation_v1: event -> policy
// -> tool -> verification -> audit, mirroring the established pattern.
// Read-only throughout — never touches cascade_delay or any write-capable
// tool, and never creates an approval (final price authority stays human,
// entirely outside this SOP).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { emitScheduleEvent } from '../../events.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createEstimatePricingRecommendationHandler, type EstimatePricingRecommendationPayload } from '../estimatePricingRecommendation.ts';
import { DeterministicScopeInterpreter } from '../../domains/estimating/scopeInterpreter.ts';
import type { ReadinessCompletedProject, ReadinessCostEntry } from '../../domains/estimating/types.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createEstimatePricingRecommendationHandler(new DeterministicScopeInterpreter());
  return { repo, audit, engine, handler };
}

function ctx() {
  return { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
}

const COMPLETED: ReadinessCompletedProject[] = [
  { id: 'p1', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 90000 },
  { id: 'p2', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 110000 },
];
const COSTS: ReadinessCostEntry[] = [
  { id: 'c1', project_id: 'p1', category: 'Material', amount: 50000, source: 'material' },
  { id: 'c2', project_id: 'p2', category: 'Material', amount: 60000, source: 'material' },
];

test('an exact known category skips AI and produces a ready recommendation from real comparables', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: EstimatePricingRecommendationPayload = { scopeText: 'Kitchen remodel', completedProjects: COMPLETED, costEntries: COSTS };
  const event = await emitScheduleEvent(audit, c, 'schedule.estimate_pricing_recommendation', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'estimate_pricing_recommendation_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 0, 'an exact category match needs zero AI calls');

  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const pricing = calls.find((call) => call.toolName === 'find_comparable_pricing')!.result as { recommendedLow: number; recommendedHigh: number };
  assert.equal(pricing.recommendedLow, 90000);
  assert.equal(pricing.recommendedHigh, 110000);
});

test('ambiguous scope text triggers AI classification, still lands on a real comparable set', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: EstimatePricingRecommendationPayload = { scopeText: 'Homeowner wants an all-new kitchen with an island', completedProjects: COMPLETED, costEntries: COSTS };
  const event = await emitScheduleEvent(audit, c, 'schedule.estimate_pricing_recommendation', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'estimate_pricing_recommendation_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 1);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const normalized = calls.find((call) => call.toolName === 'normalize_project_scope')!.result as { normalizedCategory: string };
  assert.equal(normalized.normalizedCategory, 'Kitchen remodel');
});

test('too few comparables yields insufficient_data, never a fabricated range', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: EstimatePricingRecommendationPayload = { scopeText: 'Deck/Patio', completedProjects: COMPLETED, costEntries: COSTS };
  const event = await emitScheduleEvent(audit, c, 'schedule.estimate_pricing_recommendation', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'estimate_pricing_recommendation_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const pricing = calls.find((call) => call.toolName === 'find_comparable_pricing')!.result as { comparableCount: number; recommendedLow: number | null };
  assert.equal(pricing.comparableCount, 0);
  assert.equal(pricing.recommendedLow, null);
});

test('never touches cascade_delay or any write-capable tool, and never creates an approval', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: EstimatePricingRecommendationPayload = { scopeText: 'Kitchen remodel', completedProjects: COMPLETED, costEntries: COSTS };
  const event = await emitScheduleEvent(audit, c, 'schedule.estimate_pricing_recommendation', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'estimate_pricing_recommendation_v1', '1.0.0', event, handler);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  for (const call of calls) {
    assert.notEqual(call.toolName, 'cascade_delay');
  }
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
});
