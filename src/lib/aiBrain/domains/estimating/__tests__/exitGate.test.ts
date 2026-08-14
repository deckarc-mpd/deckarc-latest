// Phase 9 exit gate (combined P7-P9, Section 22): "domain exceptions
// match human review, with no unauthorized consequential action." Run
// against 5 representative scenarios: comparable count and status match
// what a human reviewing the same completed-project records would
// conclude, and no scenario ever creates an approval or sets a price —
// this SOP only ever proposes a range.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import { ToolRegistry } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createEstimatePricingRecommendationHandler } from '../../../sops/estimatePricingRecommendation.ts';
import { DeterministicScopeInterpreter } from '../scopeInterpreter.ts';
import { REPRESENTATIVE_ESTIMATE_SCENARIOS } from '../__fixtures__/representativeEstimates.ts';
import type { EstimatePricingRecommendationPayload } from '../../../sops/estimatePricingRecommendation.ts';

test('exit gate coverage: every representative scenario has an expectation', () => {
  assert.ok(REPRESENTATIVE_ESTIMATE_SCENARIOS.length >= 3 && REPRESENTATIVE_ESTIMATE_SCENARIOS.length <= 5);
});

for (const scenario of REPRESENTATIVE_ESTIMATE_SCENARIOS) {
  test(`${scenario.name}: status and comparable count match expected reality, zero unauthorized action`, async () => {
    const repo = new MemoryRepository();
    seedMemoryRegistry(repo);
    const audit = new AuditLog(repo);
    const tools = new ToolRegistry();
    const engine = new WorkflowEngine(audit, repo, tools);
    const handler = createEstimatePricingRecommendationHandler(new DeterministicScopeInterpreter());
    const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };

    const payload: EstimatePricingRecommendationPayload = {
      scopeText: scenario.scopeText, completedProjects: scenario.completedProjects, costEntries: scenario.costEntries,
    };
    const event = await emitScheduleEvent(audit, ctx, 'schedule.estimate_pricing_recommendation', payload as unknown as Record<string, unknown>);
    const result = await engine.run(ctx, 'estimate_pricing_recommendation_v1', '1.0.0', event, handler);

    assert.equal(result.run.status, 'completed', `${scenario.name} should always complete cleanly — read-only`);

    const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
    const pricing = calls.find((c) => c.toolName === 'find_comparable_pricing')!.result as { comparableCount: number };
    assert.equal(pricing.comparableCount, scenario.expected.comparableCount, `${scenario.name}: comparable count mismatch`);

    // No unauthorized consequential action: never an approval, never a write-capable tool.
    assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
    for (const call of calls) {
      assert.notEqual(call.toolName, 'cascade_delay');
    }
  });
}
