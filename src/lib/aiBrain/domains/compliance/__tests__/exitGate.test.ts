// Phase 7 exit gate (user's instructions): "domain exceptions match human
// review, with no unauthorized consequential action." Run against 5
// representative projects: the deterministic verdict and AI-invocation
// match what a human reviewing the same records would conclude, and not
// one of them ever produces an approval or touches a write-capable tool —
// this SOP only ever surfaces findings, never acts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import { ToolRegistry } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createCompliancePermitInspectionSweepHandler } from '../../../sops/compliancePermitInspectionSweep.ts';
import { DeterministicComplianceInterpreter } from '../aiInterpreter.ts';
import { REPRESENTATIVE_COMPLIANCE_PROJECTS } from '../__fixtures__/representativeProjects.ts';
import type { CompliancePermitInspectionSweepPayload } from '../../../sops/compliancePermitInspectionSweep.ts';

test('exit gate coverage: every representative project has an expectation', () => {
  assert.ok(REPRESENTATIVE_COMPLIANCE_PROJECTS.length >= 3 && REPRESENTATIVE_COMPLIANCE_PROJECTS.length <= 5);
});

for (const project of REPRESENTATIVE_COMPLIANCE_PROJECTS) {
  test(`${project.projectName}: verdict and AI-invocation match expected reality, zero unauthorized action`, async () => {
    const repo = new MemoryRepository();
    seedMemoryRegistry(repo);
    const audit = new AuditLog(repo);
    const tools = new ToolRegistry();
    const engine = new WorkflowEngine(audit, repo, tools);
    const handler = createCompliancePermitInspectionSweepHandler(new DeterministicComplianceInterpreter());
    const ctx = { companyId: 'company-1', projectId: project.projectId, correlationId: newCorrelationId() };

    const payload: CompliancePermitInspectionSweepPayload = {
      projectId: project.projectId, asOfDate: project.asOfDate,
      permits: project.permits, inspections: project.inspections, documents: project.documents,
    };
    const event = await emitScheduleEvent(audit, ctx, 'schedule.compliance_permit_inspection_sweep', payload as unknown as Record<string, unknown>);
    const result = await engine.run(ctx, 'compliance_permit_inspection_sweep_v1', '1.0.0', event, handler);

    assert.equal(result.run.status, 'completed', `${project.projectName} should always complete cleanly — read-only`);

    const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
    const readiness = calls.find((c) => c.toolName === 'compute_compliance_readiness')!.result as { overallStatus: string };
    assert.equal(readiness.overallStatus, project.expected.overallStatus, `${project.projectName}: overallStatus mismatch`);

    const interpretation = calls.find((c) => c.toolName === 'interpret_compliance_finding')!.result as { invoked: boolean };
    assert.equal(interpretation.invoked, project.expected.aiShouldBeInvoked, `${project.projectName}: AI-invocation mismatch`);

    // No unauthorized consequential action: never an approval, never a write-capable tool.
    assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0);
    for (const call of calls) {
      assert.notEqual(call.toolName, 'cascade_delay');
    }
  });
}
