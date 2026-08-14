import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import type { SopExecutionContext, SopOutcome } from '../../../workflow.ts';
import { ToolRegistry, callTool } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createTradeMaterialCoordinationHandler } from '../../../sops/tradeMaterialCoordination.ts';
import {
  assessTradeMaterialCoordinationTool,
  createInterpretFieldUpdateTool,
  type AssessTradeMaterialArgs,
} from '../../../tools/projectOpsTools.ts';
import { DeterministicRiskInterpreter } from '../aiInterpreter.ts';
import { REPRESENTATIVE_PROJECTS } from '../__fixtures__/representativeProjects.ts';
import type { TradeMaterialCoordinationPayload } from '../../../sops/tradeMaterialCoordination.ts';
import type { TradeMaterialCoordinationResult } from '../types.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createTradeMaterialCoordinationHandler(new DeterministicRiskInterpreter());
  return { repo, audit, tools, engine, handler };
}

function payloadFor(project: (typeof REPRESENTATIVE_PROJECTS)[number]): TradeMaterialCoordinationPayload {
  return {
    projectId: project.projectId,
    asOfDate: project.asOfDate,
    tasks: project.tasks,
    crewConfirmations: project.crewConfirmations,
    materials: project.materials,
  };
}

test('Ganesh (fully ready): no escalation, no AI call, workflow completes cleanly', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-ganesh')!;
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.trade_confirmation_cutoff', payloadFor(project) as unknown as Record<string, unknown>);

  const result = await engine.run(ctx, 'trade_material_coordination_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.approvals.length, 0);
  assert.equal(repo.agentRuns.length, 0);
});

test('Thompson (unconfirmed crew): escalates, and approving resolves it to completed', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-thompson')!;
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.trade_confirmation_cutoff', payloadFor(project) as unknown as Record<string, unknown>);

  const first = await engine.run(ctx, 'trade_material_coordination_v1', '1.0.0', event, handler);
  assert.equal(first.run.status, 'waiting_approval');
  assert.equal(repo.approvals.length, 1);
  assert.equal(repo.approvals[0].decision, 'pending');

  // Thompson's confirmation has real free text (double-booked sub) -> AI should have been invoked.
  assert.equal(repo.agentRuns.length, 1);

  await audit.decideApproval(repo.approvals[0].id, 'approved', 'admin-user-1');
  const second = await engine.resume(ctx, first.run.id, event, handler);
  assert.equal(second.run.status, 'completed');
});

test('a REJECTED escalation still resolves to completed, not failed (false alarm, correctly dismissed)', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-thompson')!;
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.trade_confirmation_cutoff', payloadFor(project) as unknown as Record<string, unknown>);

  const first = await engine.run(ctx, 'trade_material_coordination_v1', '1.0.0', event, handler);
  await audit.decideApproval(repo.approvals[0].id, 'rejected', 'admin-user-1');
  const second = await engine.resume(ctx, first.run.id, event, handler);

  assert.equal(second.run.status, 'completed');
});

test('Nguyen (unconfirmed crew + multi-hop material risk): escalates with both reasons and invokes AI', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-nguyen')!;
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.trade_confirmation_cutoff', payloadFor(project) as unknown as Record<string, unknown>);

  const result = await engine.run(ctx, 'trade_material_coordination_v1', '1.0.0', event, handler);
  assert.equal(result.run.status, 'waiting_approval');

  const toolCalls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const assessCall = toolCalls.find((c) => c.toolName === 'assess_trade_material_coordination');
  const coordination = assessCall!.result as unknown as TradeMaterialCoordinationResult;
  assert.equal(coordination.tradeConfirmationIssues.length, 1);
  assert.equal(coordination.materialScheduleRisks.length, 1);
  assert.ok(coordination.materialScheduleRisks[0].downstreamImpactedTaskIds.includes('nguyen-t3'));
  assert.equal(coordination.escalationRequired, true);

  // Nguyen's confirmation notes ("No response after three calls") is real free text -> AI invoked.
  assert.equal(repo.agentRuns.length, 1);
});

test('Miller (dependency issue but no trade/material problem): trade_material_coordination_v1 finds nothing to escalate', async () => {
  // Miller's readiness problem in Phase 2 is a task DEPENDENCY gap, which is
  // out of this SOP's scope entirely (that's tomorrow_readiness_v1's job) —
  // confirms the two SOPs don't overlap/duplicate detection.
  const { repo, audit, engine, handler } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-miller')!;
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.trade_confirmation_cutoff', payloadFor(project) as unknown as Record<string, unknown>);

  const result = await engine.run(ctx, 'trade_material_coordination_v1', '1.0.0', event, handler);
  assert.equal(result.run.status, 'completed');
  assert.equal(repo.approvals.length, 0);
});

// ─── Safety-invariant regression test ───────────────────────────────────────

test('SAFETY: a corrupted observed outcome is caught by verification and fails the run', async () => {
  const { repo, audit, engine, tools } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-nguyen')!;
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.trade_confirmation_cutoff', payloadFor(project) as unknown as Record<string, unknown>);

  const brokenHandler = async (exec: SopExecutionContext): Promise<SopOutcome> => {
    if (!tools.has(assessTradeMaterialCoordinationTool.name)) tools.register(assessTradeMaterialCoordinationTool);
    const interpretTool = createInterpretFieldUpdateTool(new DeterministicRiskInterpreter());
    if (!tools.has(interpretTool.name)) tools.register(interpretTool);

    const p = exec.triggerEvent.payload as unknown as TradeMaterialCoordinationPayload;
    const assessment = await callTool<AssessTradeMaterialArgs, TradeMaterialCoordinationResult>(
      tools, exec.audit, exec.ctx, 'assess_trade_material_coordination',
      { projectId: p.projectId, asOfDate: p.asOfDate, tasks: p.tasks, crewConfirmations: p.crewConfirmations, materials: p.materials },
      { workflowRunId: exec.workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: 'project_operations' }, action: 'assess' }
    );

    // THE BUG under test: reporting escalationRequired=false when the
    // deterministic assessment (nguyen has real issues) says true.
    return {
      kind: 'completed',
      expectedOutcome: { escalationRequired: assessment.result.escalationRequired, issueCount: 2 },
      observedOutcome: { escalationRequired: false, issueCount: 2 },
    };
  };

  const result = await engine.run(ctx, 'trade_material_coordination_v1', '1.0.0', event, brokenHandler);
  assert.equal(result.run.status, 'failed');
  assert.equal(repo.verifications[0].success, false);
});
