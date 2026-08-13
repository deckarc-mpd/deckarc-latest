// End-to-end Phase 2 exit-gate proof: the tomorrow_readiness_v1 SOP,
// exercised against 5 representative projects covering all four readiness
// gates individually and in combination, plus a dedicated test proving the
// CODE-decides/AI-explains-only safety invariant is actually enforced by
// the verification step, not just documented.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import type { SopExecutionContext, SopOutcome } from '../../../workflow.ts';
import { ToolRegistry, callTool } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createTomorrowReadinessHandler } from '../../../sops/tomorrowReadiness.ts';
import {
  computeTomorrowReadinessTool,
  createInterpretFieldUpdateTool,
  type ComputeReadinessArgs,
} from '../../../tools/projectOpsTools.ts';
import { DeterministicRiskInterpreter } from '../aiInterpreter.ts';
import type { DeterministicReadinessResult } from '../types.ts';
import { REPRESENTATIVE_PROJECTS } from '../__fixtures__/representativeProjects.ts';
import type { TomorrowReadinessPayload } from '../../../sops/tomorrowReadiness.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createTomorrowReadinessHandler(new DeterministicRiskInterpreter());
  return { repo, audit, tools, engine, handler };
}

for (const project of REPRESENTATIVE_PROJECTS) {
  test(`${project.projectName}: readiness verdict, gate findings, and AI-invocation match expected reality`, async () => {
    const { repo, audit, engine, handler } = buildHarness();
    const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };

    const payload: TomorrowReadinessPayload = {
      projectId: project.projectId,
      asOfDate: project.asOfDate,
      tasks: project.tasks,
      crewConfirmations: project.crewConfirmations,
      materials: project.materials,
      dailyUpdates: project.dailyUpdates,
    };
    const event = await emitScheduleEvent(audit, ctx, 'schedule.tomorrow_readiness_check', payload as unknown as Record<string, unknown>);

    const result = await engine.run(ctx, 'tomorrow_readiness_v1', '1.0.0', event, handler);

    // The SOP always completes (it's read-only; nothing here should ever
    // require approval or fail) — a 'failed' status here would mean the
    // verification step caught a real bug.
    assert.equal(result.run.status, 'completed', `workflow should complete cleanly for ${project.projectName}`);

    // The deterministic verdict matches what a human reviewing this
    // project's actual data would conclude.
    const toolCalls = await repo.listToolCallsByWorkflowRun(result.run.id);
    const readinessCall = toolCalls.find((c) => c.toolName === 'compute_tomorrow_readiness');
    assert.ok(readinessCall);
    const readinessResult = readinessCall!.result as { overallStatus: string; gates: Array<{ gate: string; status: string }> };
    assert.equal(readinessResult.overallStatus, project.expected.overallStatus);

    const actualFailedGates = readinessResult.gates.filter((g) => g.status === 'not_ready').map((g) => g.gate).sort();
    assert.deepEqual(actualFailedGates, [...project.expected.failedGates].sort());

    // AI was invoked exactly when expected — never more (cost discipline),
    // never less (real ambiguity got surfaced).
    const agentRuns = repo.agentRuns.filter((r) => r.workflowRunId === result.run.id);
    assert.equal(agentRuns.length > 0, project.expected.aiShouldBeInvoked);

    // Every record from this run shares one correlation id, per Frozen §12.
    assert.ok(toolCalls.every((c) => c.correlationId === ctx.correlationId));
  });
}

test('across all 5 fixtures, AI is invoked only for the 2 projects with real ambiguity — not the 3 clean-cut ones', async () => {
  let aiInvokedCount = 0;
  for (const project of REPRESENTATIVE_PROJECTS) {
    const { audit, engine, handler, repo } = buildHarness();
    const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
    const payload: TomorrowReadinessPayload = {
      projectId: project.projectId, asOfDate: project.asOfDate, tasks: project.tasks,
      crewConfirmations: project.crewConfirmations, materials: project.materials, dailyUpdates: project.dailyUpdates,
    };
    const event = await emitScheduleEvent(audit, ctx, 'schedule.tomorrow_readiness_check', payload as unknown as Record<string, unknown>);
    const result = await engine.run(ctx, 'tomorrow_readiness_v1', '1.0.0', event, handler);
    if (repo.agentRuns.filter((r) => r.workflowRunId === result.run.id).length > 0) aiInvokedCount++;
  }
  // Matches REPRESENTATIVE_PROJECTS: ganesh(no), miller(no), thompson(no), patel(yes), nguyen(yes).
  assert.equal(aiInvokedCount, 2);
});

// ─── Safety-invariant regression test ───────────────────────────────────────

test('SAFETY: if a handler ever let AI override the deterministic verdict, verification catches it and fails the run', async () => {
  const { repo, audit, engine, tools } = buildHarness();
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === 'proj-patel')!; // has a real 'blocked' verdict to corrupt
  const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };
  const payload: TomorrowReadinessPayload = {
    projectId: project.projectId, asOfDate: project.asOfDate, tasks: project.tasks,
    crewConfirmations: project.crewConfirmations, materials: project.materials, dailyUpdates: project.dailyUpdates,
  };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.tomorrow_readiness_check', payload as unknown as Record<string, unknown>);

  // A deliberately broken handler: computes the real deterministic result
  // honestly (expectedOutcome), but then reports an observedOutcome that
  // has been overridden by AI's interpretation instead of the deterministic
  // gates — exactly the violation the real handler's design prevents. This
  // proves the verification step is a functioning safety net, not just a
  // comment: it independently catches the mismatch and fails the run.
  const brokenHandler = async (exec: SopExecutionContext): Promise<SopOutcome> => {
    if (!tools.has(computeTomorrowReadinessTool.name)) tools.register(computeTomorrowReadinessTool);
    const interpretTool = createInterpretFieldUpdateTool(new DeterministicRiskInterpreter());
    if (!tools.has(interpretTool.name)) tools.register(interpretTool);

    const p = exec.triggerEvent.payload as unknown as TomorrowReadinessPayload;
    const readiness = await callTool<ComputeReadinessArgs, DeterministicReadinessResult>(tools, exec.audit, exec.ctx, 'compute_tomorrow_readiness', {
      projectId: p.projectId, asOfDate: p.asOfDate, tasks: p.tasks,
      crewConfirmations: p.crewConfirmations, materials: p.materials, dailyUpdates: p.dailyUpdates,
    }, { workflowRunId: exec.workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: 'project_operations' }, action: 'compute' });

    const freeText = p.dailyUpdates.flatMap((u) => [u.blockers, u.materials_pending, u.weather_issue]);
    await callTool(tools, exec.audit, exec.ctx, 'interpret_field_update', {
      deterministic: readiness.result, freeText,
    }, { workflowRunId: exec.workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: 'project_operations' }, action: 'interpret' });

    // THE BUG under test: reporting an observed status that does not equal
    // the deterministic one, as would happen if AI's opinion were ever
    // wired into the final verdict.
    return {
      kind: 'completed',
      expectedOutcome: { overallStatus: readiness.result.overallStatus, gateCount: readiness.result.gates.length },
      observedOutcome: { overallStatus: 'at_risk', gateCount: readiness.result.gates.length }, // patel's real verdict is 'blocked'
    };
  };

  const result = await engine.run(ctx, 'tomorrow_readiness_v1', '1.0.0', event, brokenHandler);

  assert.equal(result.run.status, 'failed', 'verification must fail the run when observed diverges from expected');
  assert.equal(repo.verifications[0].success, false);
});
