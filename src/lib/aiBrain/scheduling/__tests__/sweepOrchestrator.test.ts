import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { DeterministicRiskInterpreter } from '../../domains/projectOps/aiInterpreter.ts';
import { REPRESENTATIVE_PROJECTS, TOMORROW } from '../../domains/projectOps/__fixtures__/representativeProjects.ts';
import { defaultScheduleConfig } from '../schedulingConfig.ts';
import { runTomorrowReadinessSweep, runTradeMaterialCoordinationSweep, runDailyOperatingSweeps, type SweepProjectInput } from '../sweepOrchestrator.ts';

function harness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  return { repo, audit, engine };
}

// Reuse the exact 5 fixtures Phase 2/3 already validated project-by-project;
// here we only need to confirm the SWEEP-LEVEL rollup (eligibility,
// zero-AI-if-nothing-changed, always-record-a-summary) is correct — not
// re-litigate each project's individual gate outcome.
function fixturesAsSweepInputs(statusOverrides: Record<string, string> = {}): SweepProjectInput[] {
  return REPRESENTATIVE_PROJECTS.map((p) => ({
    projectId: p.projectId,
    status: statusOverrides[p.projectId] ?? 'In Progress',
    asOfDate: p.asOfDate,
    tasks: p.tasks,
    crewConfirmations: p.crewConfirmations,
    materials: p.materials,
    dailyUpdates: p.dailyUpdates,
  }));
}

test('runTomorrowReadinessSweep: evaluates every eligible project and matches each fixture\'s known aiShouldBeInvoked', async () => {
  const { repo, audit, engine } = harness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const summary = await runTomorrowReadinessSweep(
    ctx, audit, repo, engine, config, TOMORROW, fixturesAsSweepInputs(), new DeterministicRiskInterpreter()
  );

  assert.equal(summary.projectsEvaluated, 5);
  assert.equal(summary.projectsSkippedIneligible, 0);

  const expectedAiCount = REPRESENTATIVE_PROJECTS.filter((p) => p.expected.aiShouldBeInvoked).length;
  assert.equal(summary.aiCallsMade, expectedAiCount);
  assert.equal(summary.aiCallsMade > 0, true, 'sanity: at least one fixture is expected to need AI');
  assert.equal(summary.aiCallsMade < 5, true, 'sanity: NOT every fixture should need AI (zero-AI-if-nothing-changed)');

  for (const outcome of summary.outcomes) {
    const fixture = REPRESENTATIVE_PROJECTS.find((p) => p.projectId === outcome.projectId)!;
    assert.equal(outcome.aiInvoked, fixture.expected.aiShouldBeInvoked, `${outcome.projectId} AI-invocation mismatch`);
    assert.equal(outcome.status, 'completed'); // tomorrow_readiness_v1 never escalates — it only reads.
  }
});

test('runTomorrowReadinessSweep: a project in an excluded status is skipped entirely, not run', async () => {
  const { repo, audit, engine } = harness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const inputs = fixturesAsSweepInputs({ 'proj-ganesh': 'Completed' });
  const summary = await runTomorrowReadinessSweep(ctx, audit, repo, engine, config, TOMORROW, inputs, new DeterministicRiskInterpreter());

  assert.equal(summary.projectsEvaluated, 4);
  assert.equal(summary.projectsSkippedIneligible, 1);
  assert.equal(summary.outcomes.some((o) => o.projectId === 'proj-ganesh'), false);
});

test('runTomorrowReadinessSweep: always records a summary event, even when zero eligible projects exist', async () => {
  const { repo, audit, engine } = harness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const summary = await runTomorrowReadinessSweep(ctx, audit, repo, engine, config, TOMORROW, [], new DeterministicRiskInterpreter());

  assert.equal(summary.projectsEvaluated, 0);
  assert.equal(summary.aiCallsMade, 0);
  const summaryEvents = repo.events.filter((e) => e.eventType === 'schedule.tomorrow_readiness_sweep_completed');
  assert.equal(summaryEvents.length, 1, 'a run entry must exist even for an empty sweep (§7)');
});

test('runTradeMaterialCoordinationSweep: escalation count matches the combined-exit-gate fixtures\' known outcomes', async () => {
  const { repo, audit, engine } = harness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const summary = await runTradeMaterialCoordinationSweep(
    ctx, audit, repo, engine, config, TOMORROW, fixturesAsSweepInputs(), new DeterministicRiskInterpreter()
  );

  // From combinedExitGate.test.ts: thompson and nguyen escalate, the other three don't.
  const escalatedIds = summary.outcomes.filter((o) => o.escalated).map((o) => o.projectId).sort();
  assert.deepEqual(escalatedIds, ['proj-nguyen', 'proj-thompson']);
  assert.equal(summary.exceptionsFound, 2);
});

test('runDailyOperatingSweeps: runs both sweeps and each produces its own independent summary', async () => {
  const { repo, audit, engine } = harness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const { readiness, tradeMaterial } = await runDailyOperatingSweeps(
    ctx, audit, repo, engine, config, TOMORROW, fixturesAsSweepInputs(), new DeterministicRiskInterpreter()
  );

  assert.equal(readiness.sopId, 'tomorrow_readiness_v1');
  assert.equal(tradeMaterial.sopId, 'trade_material_coordination_v1');
  assert.equal(readiness.projectsEvaluated, 5);
  assert.equal(tradeMaterial.projectsEvaluated, 5);

  // Every workflow run this sweep produced carries its own project id in
  // its correlation context — confirms the fix that scopes each project's
  // run to project-level correlation, not the company-wide sweep context.
  for (const outcome of [...readiness.outcomes, ...tradeMaterial.outcomes]) {
    const run = await repo.getWorkflowRun(outcome.workflowRunId);
    assert.equal(run?.projectId, outcome.projectId);
  }
});
