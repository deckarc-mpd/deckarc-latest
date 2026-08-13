import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../audit.ts';
import { WorkflowEngine } from '../../workflow.ts';
import { ToolRegistry } from '../../tools.ts';
import { seedMemoryRegistry } from '../../registry.ts';
import { DeterministicComplianceInterpreter } from '../../domains/compliance/aiInterpreter.ts';
import { defaultScheduleConfig } from '../schedulingConfig.ts';
import { runCompliancePermitInspectionSweep, type ComplianceSweepProjectInput } from '../sweepOrchestrator.ts';
import type { ReadinessComplianceDocument } from '../../domains/compliance/types.ts';

function harness() {
  const repo = new MemoryRepository();
  seedMemoryRegistry(repo);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  return { repo, audit, engine };
}

test('sweeps every eligible project, skips ineligible ones, and always records a summary', async () => {
  const { repo, audit, engine } = harness();
  const ctx = { companyId: 'company-1', projectId: null, correlationId: newCorrelationId() };
  const config = defaultScheduleConfig('company-1');

  const projects: ComplianceSweepProjectInput[] = [
    { projectId: 'proj-clean', status: 'In Progress', permits: [{ id: 'p1', project_id: 'proj-clean', permit_type: 'Building', permit_status: 'Approved', permit_expiration_date: null, revision_requested: false, correction_notes: '' }], inspections: [] },
    { projectId: 'proj-blocked', status: 'In Progress', permits: [{ id: 'p2', project_id: 'proj-blocked', permit_type: 'Electrical', permit_status: 'Rejected', permit_expiration_date: null, revision_requested: false, correction_notes: '' }], inspections: [] },
    { projectId: 'proj-done', status: 'Completed', permits: [], inspections: [] },
  ];
  const documents: ReadinessComplianceDocument[] = [];

  const summary = await runCompliancePermitInspectionSweep(ctx, audit, repo, engine, config, '2026-08-13', projects, documents, new DeterministicComplianceInterpreter());

  assert.equal(summary.sopId, 'compliance_permit_inspection_sweep_v1');
  assert.equal(summary.projectsEvaluated, 2);
  assert.equal(summary.projectsSkippedIneligible, 1);
  assert.equal(summary.exceptionsFound, 1); // proj-blocked

  const summaryEvents = repo.events.filter((e) => e.eventType === 'schedule.compliance_permit_inspection_sweep_completed');
  assert.equal(summaryEvents.length, 1);
});
