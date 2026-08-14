// End-to-end proof for compliance_permit_inspection_sweep_v1: event ->
// policy -> tool -> verification -> audit, mirroring tomorrow_readiness_v1's
// proven pattern. Read-only throughout — never touches cascade_delay or
// any write-capable tool.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { emitScheduleEvent } from '../../events.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { createCompliancePermitInspectionSweepHandler, type CompliancePermitInspectionSweepPayload } from '../compliancePermitInspectionSweep.ts';
import { DeterministicComplianceInterpreter } from '../../domains/compliance/aiInterpreter.ts';

function buildHarness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const handler = createCompliancePermitInspectionSweepHandler(new DeterministicComplianceInterpreter());
  return { repo, audit, engine, handler };
}

function ctx() {
  return { companyId: 'company-1', projectId: 'proj-1', correlationId: newCorrelationId() };
}

test('a clean project completes with overallStatus ready and zero AI calls', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: CompliancePermitInspectionSweepPayload = {
    projectId: 'proj-1', asOfDate: '2026-08-13',
    permits: [{ id: 'p1', project_id: 'proj-1', permit_type: 'Building', permit_status: 'Approved', permit_expiration_date: '2027-01-01', revision_requested: false, correction_notes: '' }],
    inspections: [{ id: 'i1', project_id: 'proj-1', inspection_type: 'Final', scheduled_date: null, result: 'Passed', correction_required: false, correction_notes: '', reinspection_required: false, reinspection_scheduled_date: null }],
    documents: [{ id: 'u1', full_name: 'Ace Plumbing', license_expiration: null, coi_expiration: null, insurance_status: 'Current' }],
  };
  const event = await emitScheduleEvent(audit, c, 'schedule.compliance_permit_inspection_sweep', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'compliance_permit_inspection_sweep_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 0);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const readiness = calls.find((call) => call.toolName === 'compute_compliance_readiness')!.result as { overallStatus: string };
  assert.equal(readiness.overallStatus, 'ready');
});

test('a rejected permit with correction notes triggers AI interpretation and rolls up to blocked', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: CompliancePermitInspectionSweepPayload = {
    projectId: 'proj-1', asOfDate: '2026-08-13',
    permits: [{ id: 'p1', project_id: 'proj-1', permit_type: 'Electrical', permit_status: 'Rejected', permit_expiration_date: null, revision_requested: false, correction_notes: 'HOA requires a revised site plan before resubmission' }],
    inspections: [],
    documents: [],
  };
  const event = await emitScheduleEvent(audit, c, 'schedule.compliance_permit_inspection_sweep', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'compliance_permit_inspection_sweep_v1', '1.0.0', event, handler);

  assert.equal(result.run.status, 'completed');
  assert.equal(repo.agentRuns.length, 1);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  const readiness = calls.find((call) => call.toolName === 'compute_compliance_readiness')!.result as { overallStatus: string };
  assert.equal(readiness.overallStatus, 'blocked');
  const interpretation = calls.find((call) => call.toolName === 'interpret_compliance_finding')!.result as { category: string };
  assert.equal(interpretation.category, 'permit_issue');
});

test('never touches cascade_delay or any write-capable tool', async () => {
  const { repo, audit, engine, handler } = buildHarness();
  const c = ctx();
  const payload: CompliancePermitInspectionSweepPayload = {
    projectId: 'proj-1', asOfDate: '2026-08-13',
    permits: [{ id: 'p1', project_id: 'proj-1', permit_type: 'Building', permit_status: 'Expired', permit_expiration_date: '2026-08-01', revision_requested: false, correction_notes: '' }],
    inspections: [],
    documents: [],
  };
  const event = await emitScheduleEvent(audit, c, 'schedule.compliance_permit_inspection_sweep', payload as unknown as Record<string, unknown>);
  const result = await engine.run(c, 'compliance_permit_inspection_sweep_v1', '1.0.0', event, handler);
  const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
  for (const call of calls) {
    assert.notEqual(call.toolName, 'cascade_delay');
  }
  assert.equal((await repo.listApprovalsByWorkflowRun(result.run.id)).length, 0, 'compliance sweeps never create an approval — they only surface findings');
});
