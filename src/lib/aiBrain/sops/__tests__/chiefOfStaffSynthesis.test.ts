// End-to-end proof for chief_of_staff_daily_synthesis_v1: event -> policy
// -> tool -> verification -> audit, mirroring the pattern already proven
// for tomorrow_readiness_v1 (Phase 2) and trade_material_coordination_v1
// (Phase 3). Avery never touches a raw table here — only the resolved
// exceptions handed in via the trigger event payload.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { emitScheduleEvent } from '../../events.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createChiefOfStaffSynthesisHandler, type ChiefOfStaffSynthesisPayload } from '../chiefOfStaffSynthesis.ts';
import { DeterministicSynthesisClient } from '../../domains/chiefOfStaff/synthesis.ts';
import type { ResolvedException } from '../../domains/chiefOfStaff/types.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createChiefOfStaffSynthesisHandler(new DeterministicSynthesisClient());
  return { repo, audit, tools, engine, handler };
}

test('zero exceptions: workflow completes, zero AI calls, all-clear synthesis recorded', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const payload: ChiefOfStaffSynthesisPayload = { asOfDate: '2026-08-13', exceptions: [] };

  const event = await emitScheduleEvent(audit, ctx, 'schedule.chief_of_staff_synthesis', payload as unknown as Record<string, unknown>);
  const result = await engine.run(ctx, 'chief_of_staff_daily_synthesis_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 0, 'zero exceptions must mean zero AI (agent) runs');

  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolName, 'synthesize_daily_brief');
  const toolResult = calls[0].result as { headline: string; aiInvoked: boolean };
  assert.equal(toolResult.aiInvoked, false);
  assert.match(toolResult.headline, /all clear/i);
});

test('resolved exceptions present: workflow completes, ranked correctly, one AI (agent) run recorded', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const exceptions: ResolvedException[] = [
    { source: 'needs_review_item', id: 'nr1', projectId: 'proj-thompson', title: 'Task needs review', detail: '' },
    { source: 'sweep_escalation', id: 'wfr-1', projectId: 'proj-nguyen', title: 'Trade/material escalation', detail: '' },
    { source: 'critical_item', id: 'ci1', projectId: 'proj-patel', title: 'Permit rejected', detail: '' },
  ];
  const payload: ChiefOfStaffSynthesisPayload = { asOfDate: '2026-08-13', exceptions };

  const event = await emitScheduleEvent(audit, ctx, 'schedule.chief_of_staff_synthesis', payload as unknown as Record<string, unknown>);
  const result = await engine.run(ctx, 'chief_of_staff_daily_synthesis_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 1, 'a non-empty ranked list must produce exactly one agent run');
  assert.equal(repo.agentRuns[0].agentId, 'chief_of_staff');

  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const toolResult = calls[0].result as { prioritizedItems: Array<{ id: string; source: string }>; aiInvoked: boolean };
  assert.equal(toolResult.aiInvoked, true);
  assert.deepEqual(toolResult.prioritizedItems.map((i) => i.source), ['critical_item', 'sweep_escalation', 'needs_review_item']);

  // Every record from this run shares the workflow run's correlation id.
  assert.equal(repo.verifications.length, 1);
  assert.equal(repo.verifications[0].success, true);
});

test('a disabled/L0 chief_of_staff agent is denied, not silently allowed through', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  repo.seedAgent({
    id: 'chief_of_staff',
    displayName: 'Avery', officialTitle: 'AI Chief of Staff', businessDomain: 'Executive Operations',
    mission: 'x', responsibilities: [], assignedSops: [], allowedTools: [],
    dataPermissions: [], authorityLevel: 'L0', escalationPolicy: 'x', modelPolicy: 'x',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 }, status: 'active', version: '1.0.0',
  });
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const payload: ChiefOfStaffSynthesisPayload = { asOfDate: '2026-08-13', exceptions: [] };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.chief_of_staff_synthesis', payload as unknown as Record<string, unknown>);

  const result = await engine.run(ctx, 'chief_of_staff_daily_synthesis_v1', '1.0.0', event, handler);
  assert.equal(result.run.status, 'failed');
});
