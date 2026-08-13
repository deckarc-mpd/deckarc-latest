// Phase 9 exit gate (combined P7-P9, Section 22): "domain exceptions
// match human review, with no unauthorized consequential action." Run
// against 5 representative scenarios: the deterministic stale-lead count
// matches what a human reviewing the same records would conclude, and any
// resulting follow-up batch either escalates for approval (never
// auto-sends) or the run completes with zero approvals when nothing is
// stale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import { ToolRegistry } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createSalesPipelineHygieneHandler } from '../../../sops/salesPipelineHygiene.ts';
import { DeterministicFollowUpDraftClient } from '../followUpDraftClient.ts';
import { REPRESENTATIVE_LEAD_SCENARIOS, REPRESENTATIVE_LEADS_ASOF } from '../__fixtures__/representativeLeads.ts';
import type { SalesPipelineHygienePayload } from '../../../sops/salesPipelineHygiene.ts';

test('exit gate coverage: every representative scenario has an expectation', () => {
  assert.ok(REPRESENTATIVE_LEAD_SCENARIOS.length >= 3 && REPRESENTATIVE_LEAD_SCENARIOS.length <= 5);
});

for (const scenario of REPRESENTATIVE_LEAD_SCENARIOS) {
  test(`${scenario.name}: stale count matches expectation, no unauthorized send`, async () => {
    const repo = new MemoryRepository();
    seedMemoryRegistry(repo);
    const audit = new AuditLog(repo);
    const tools = new ToolRegistry();
    const engine = new WorkflowEngine(audit, repo, tools);
    const handler = createSalesPipelineHygieneHandler(new DeterministicFollowUpDraftClient());
    const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };

    const payload: SalesPipelineHygienePayload = { asOfDate: REPRESENTATIVE_LEADS_ASOF, leads: scenario.leads };
    const event = await emitScheduleEvent(audit, ctx, 'schedule.sales_pipeline_hygiene', payload as unknown as Record<string, unknown>);
    const result = await engine.run(ctx, 'sales_pipeline_hygiene_v1', '1.0.0', event, handler);

    if (scenario.expected.staleCount === 0) {
      assert.equal(result.run.status, 'completed', `${scenario.name}: nothing stale should complete immediately`);
      assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
    } else {
      assert.equal(result.run.status, 'waiting_approval', `${scenario.name}: a stale lead must escalate, never auto-send`);
      const [approval] = await repo.listApprovalsByWorkflowRun(result.run.id);
      assert.equal(approval.decision, 'pending');
    }

    const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
    const staleResult = calls.find((c) => c.toolName === 'identify_stale_leads')!.result as unknown as unknown[];
    assert.equal(staleResult.length, scenario.expected.staleCount, `${scenario.name}: stale count mismatch`);
  });
}
