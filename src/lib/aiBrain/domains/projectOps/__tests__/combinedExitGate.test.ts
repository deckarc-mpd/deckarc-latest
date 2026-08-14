// Combined P2-P3 exit gate (Frozen §22): "3-5 live projects produce accurate
// status/readiness/trade workflows in L1-L3 (human-reviewed, not
// autonomous)." This is the single test the user's Phase 3 instructions
// asked to be able to point at for that confirmation: both SOPs, run
// against the SAME 5 representative projects, both landing on the correct,
// human-reviewed (never autonomous) outcome for each.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import { ToolRegistry } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createTomorrowReadinessHandler } from '../../../sops/tomorrowReadiness.ts';
import { createTradeMaterialCoordinationHandler } from '../../../sops/tradeMaterialCoordination.ts';
import { DeterministicRiskInterpreter } from '../aiInterpreter.ts';
import { REPRESENTATIVE_PROJECTS } from '../__fixtures__/representativeProjects.ts';
import type { TomorrowReadinessPayload } from '../../../sops/tomorrowReadiness.ts';
import type { TradeMaterialCoordinationPayload } from '../../../sops/tradeMaterialCoordination.ts';

interface CombinedExpectation {
  projectId: string;
  readinessStatus: 'ready' | 'at_risk' | 'blocked';
  tradeMaterialEscalates: boolean;
}

// The independently-established expectations from tomorrowReadiness.test.ts
// and tradeMaterialCoordinationSop.test.ts, restated together as the single
// source of truth for "is this project's combined P2+P3 assessment right."
const COMBINED_EXPECTATIONS: CombinedExpectation[] = [
  { projectId: 'proj-ganesh', readinessStatus: 'ready', tradeMaterialEscalates: false },
  { projectId: 'proj-miller', readinessStatus: 'blocked', tradeMaterialEscalates: false },
  { projectId: 'proj-thompson', readinessStatus: 'at_risk', tradeMaterialEscalates: true },
  { projectId: 'proj-patel', readinessStatus: 'blocked', tradeMaterialEscalates: false },
  { projectId: 'proj-nguyen', readinessStatus: 'blocked', tradeMaterialEscalates: true },
];

test('exit gate coverage: every representative project has a combined expectation, and vice versa', () => {
  const fixtureIds = REPRESENTATIVE_PROJECTS.map((p) => p.projectId).sort();
  const expectationIds = COMBINED_EXPECTATIONS.map((e) => e.projectId).sort();
  assert.deepEqual(fixtureIds, expectationIds);
  assert.ok(fixtureIds.length >= 3 && fixtureIds.length <= 5, 'Frozen §22 asks for 3-5 projects');
});

for (const expectation of COMBINED_EXPECTATIONS) {
  const project = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === expectation.projectId)!;

  test(`combined P2+P3, ${project.projectName}: both SOPs land on the correct, human-reviewed outcome`, async () => {
    const repo = new MemoryRepository();
    seedMemoryRegistry(repo);
    const audit = new AuditLog(repo);
    const tools = new ToolRegistry();
    const engine = new WorkflowEngine(audit, repo, tools);
    const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };

    // P2: Tomorrow Readiness.
    const readinessHandler = createTomorrowReadinessHandler(new DeterministicRiskInterpreter());
    const readinessPayload: TomorrowReadinessPayload = {
      projectId: project.projectId, asOfDate: project.asOfDate, tasks: project.tasks,
      crewConfirmations: project.crewConfirmations, materials: project.materials, dailyUpdates: project.dailyUpdates,
    };
    const readinessEvent = await emitScheduleEvent(audit, ctx, 'schedule.tomorrow_readiness_check', readinessPayload as unknown as Record<string, unknown>);
    const readinessRun = await engine.run(ctx, 'tomorrow_readiness_v1', '1.0.0', readinessEvent, readinessHandler);

    assert.equal(readinessRun.run.status, 'completed', 'readiness SOP never writes, so it always completes cleanly');
    const readinessCalls = await repo.listToolCallsByWorkflowRun(readinessRun.run.id);
    const readinessResult = readinessCalls.find((c) => c.toolName === 'compute_tomorrow_readiness')!.result as { overallStatus: string };
    assert.equal(readinessResult.overallStatus, expectation.readinessStatus);

    // P3: Trade & Material Coordination.
    const tradeMaterialCtx = { ...ctx, correlationId: newCorrelationId() };
    const coordinationHandler = createTradeMaterialCoordinationHandler(new DeterministicRiskInterpreter());
    const coordinationPayload: TradeMaterialCoordinationPayload = {
      projectId: project.projectId, asOfDate: project.asOfDate, tasks: project.tasks,
      crewConfirmations: project.crewConfirmations, materials: project.materials,
    };
    const coordinationEvent = await emitScheduleEvent(audit, tradeMaterialCtx, 'schedule.trade_confirmation_cutoff', coordinationPayload as unknown as Record<string, unknown>);
    const coordinationRun = await engine.run(tradeMaterialCtx, 'trade_material_coordination_v1', '1.0.0', coordinationEvent, coordinationHandler);

    if (expectation.tradeMaterialEscalates) {
      assert.equal(coordinationRun.run.status, 'waiting_approval', `${project.projectName} should escalate for human review`);
      const [approval] = await repo.listApprovalsByWorkflowRun(coordinationRun.run.id);
      assert.equal(approval.decision, 'pending', 'escalated but NOT autonomously resolved — a human must decide');
    } else {
      assert.equal(coordinationRun.run.status, 'completed', `${project.projectName} has nothing trade/material-related to escalate`);
      assert.equal((await repo.listApprovalsByWorkflowRun(coordinationRun.run.id)).length, 0);
    }

    // Neither SOP ever wrote to a CP360 core table or executed anything
    // autonomously — every completed/escalated outcome came from a read +
    // (optionally) a human-gated approval, matching L1-L3 exactly.
    const allCalls = [...readinessCalls, ...(await repo.listToolCallsByWorkflowRun(coordinationRun.run.id))];
    for (const call of allCalls) {
      assert.notEqual(call.toolName, 'cascade_delay', 'neither SOP should ever touch the write-capable cascade tool');
    }
  });
}
