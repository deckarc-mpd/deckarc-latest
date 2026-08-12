import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { ToolRegistry, callTool } from '../../../tools.ts';
import {
  computeTomorrowReadinessTool,
  createInterpretFieldUpdateTool,
  type ComputeReadinessArgs,
} from '../../../tools/projectOpsTools.ts';
import { DeterministicRiskInterpreter, type RiskInterpretInput } from '../aiInterpreter.ts';
import type { DeterministicReadinessResult, RiskInterpretation } from '../types.ts';

function ctx() {
  return { companyId: 'company-1', projectId: 'project-1', correlationId: newCorrelationId() };
}

test('compute_tomorrow_readiness tool is audited and returns the deterministic result unchanged', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  registry.register(computeTomorrowReadinessTool);
  const c = ctx();

  const { result, toolCall } = await callTool<ComputeReadinessArgs, DeterministicReadinessResult>(registry, audit, c, 'compute_tomorrow_readiness', {
    projectId: 'project-1',
    asOfDate: '2026-08-13',
    tasks: [],
    crewConfirmations: [],
    materials: [],
    dailyUpdates: [],
  }, {
    workflowRunId: null,
    agentRunId: null,
    authorizedActor: { type: 'agent', id: 'project_operations' },
    action: 'compute',
  });

  assert.equal(result.overallStatus, 'ready');
  assert.equal(toolCall.status, 'success');
  assert.equal(toolCall.dryRun, false);
  assert.equal(repo.toolCalls.length, 1);
});

test('interpret_field_update tool is audited and delegates to the injected client', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  const tool = createInterpretFieldUpdateTool(new DeterministicRiskInterpreter());
  registry.register(tool);
  const c = ctx();

  const { result, toolCall } = await callTool<RiskInterpretInput, RiskInterpretation>(registry, audit, c, 'interpret_field_update', {
    deterministic: {
      projectId: 'project-1',
      asOfDate: '2026-08-13',
      gates: [
        { gate: 'field_progress', status: 'not_ready', findings: ['blocked'] },
        { gate: 'dependency', status: 'ready', findings: [] },
        { gate: 'subcontractor', status: 'ready', findings: [] },
        { gate: 'materials', status: 'ready', findings: [] },
      ],
      overallStatus: 'blocked',
    },
    freeText: ['rain expected all week'],
  }, {
    workflowRunId: null,
    agentRunId: null,
    authorizedActor: { type: 'agent', id: 'project_operations' },
    action: 'interpret',
  });

  assert.equal(result.invoked, true);
  assert.equal(result.category, 'weather');
  assert.equal(toolCall.status, 'success');
  assert.equal(repo.toolCalls.length, 1);
});
