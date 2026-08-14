// On-demand trigger for compliance_permit_inspection_sweep_v1 — lets the
// Compliance AI UI surface (ProjectPermitsInspectionsTab's "AI Compliance"
// sub-tab) run a real audited workflow instead of only showing the last
// cron sweep's result. Reuses the exact SOP handler the cron entrypoint
// uses — no parallel "UI run" code path (Frozen §23.4). Read-only, like
// every other endpoint this SOP touches — it never writes a CP360 table.
//
// NOT exercised against a live Supabase project or live model from this
// sandbox — see api/cron/scheduled-sweep.ts's header for the same caveat.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.ts';
import { AuditLog } from '../../src/lib/aiBrain/audit.ts';
import { WorkflowEngine } from '../../src/lib/aiBrain/workflow.ts';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.ts';
import { emitScheduleEvent } from '../../src/lib/aiBrain/events.ts';
import { createCompliancePermitInspectionSweepHandler, type CompliancePermitInspectionSweepPayload } from '../../src/lib/aiBrain/sops/compliancePermitInspectionSweep.ts';
import { DeterministicComplianceInterpreter, GeminiComplianceInterpreter } from '../../src/lib/aiBrain/domains/compliance/aiInterpreter.ts';
import type { DeterministicComplianceResult, ComplianceInterpretation, ReadinessComplianceDocument } from '../../src/lib/aiBrain/domains/compliance/types.ts';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.projectId) return json({ error: 'projectId is required.' }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status, organization_id')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projectError || !project) return json({ error: 'Project not found.' }, 404);

  const [{ data: permits }, { data: inspections }, { data: profiles }] = await Promise.all([
    supabase.from('permits')
      .select('id, project_id, permit_type, permit_status, permit_expiration_date, revision_requested, correction_notes')
      .eq('project_id', project.id),
    supabase.from('inspections')
      .select('id, project_id, inspection_type, scheduled_date, result, correction_required, correction_notes, reinspection_required, reinspection_scheduled_date')
      .eq('project_id', project.id),
    supabase.from('user_profiles')
      .select('id, full_name, license_expiration, coi_expiration, insurance_status')
      .eq('organization_id', project.organization_id),
  ]);

  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const interpreter = process.env.GEMINI_API_KEY ? new GeminiComplianceInterpreter() : new DeterministicComplianceInterpreter();
  const sopHandler = createCompliancePermitInspectionSweepHandler(interpreter);

  const asOfDate = new Date().toISOString().split('T')[0];
  const ctx = { companyId: project.organization_id, projectId: project.id, correlationId: crypto.randomUUID() };
  const payload: CompliancePermitInspectionSweepPayload = {
    projectId: project.id,
    asOfDate,
    permits: (permits ?? []) as CompliancePermitInspectionSweepPayload['permits'],
    inspections: (inspections ?? []) as CompliancePermitInspectionSweepPayload['inspections'],
    documents: (profiles ?? []) as ReadinessComplianceDocument[],
  };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.compliance_permit_inspection_sweep', payload as unknown as Record<string, unknown>);
  const { run } = await engine.run(ctx, 'compliance_permit_inspection_sweep_v1', '1.0.0', event, sopHandler);

  const calls = await repo.listToolCallsByWorkflowRun(run.id);
  const readiness = calls.find((c) => c.toolName === 'compute_compliance_readiness')?.result as DeterministicComplianceResult | undefined;
  const interpretation = calls.find((c) => c.toolName === 'interpret_compliance_finding')?.result as ComplianceInterpretation | undefined;

  return json({ workflowRunId: run.id, status: run.status, readiness, interpretation });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
