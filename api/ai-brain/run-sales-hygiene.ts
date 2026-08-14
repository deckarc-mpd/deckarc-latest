// On-demand trigger for sales_pipeline_hygiene_v1 — lets the Sales
// Pipeline Hygiene UI surface (CP360LeadsPage.tsx) run a real audited
// workflow instead of only waiting for the weekly cron sweep. Reuses the
// exact SOP handler the cron entrypoint uses — no parallel "UI run" code
// path (Frozen §23.4). Anchored to the Platform Owner org (CONVAZANT INC)
// for the same reason the cron entrypoint is — see its header comment.
//
// NOT exercised against a live Supabase project or live model from this
// sandbox — see api/cron/scheduled-sweep.ts's header for the same caveat.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.ts';
import { AuditLog } from '../../src/lib/aiBrain/audit.ts';
import { WorkflowEngine } from '../../src/lib/aiBrain/workflow.ts';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.ts';
import { emitScheduleEvent } from '../../src/lib/aiBrain/events.ts';
import { createSalesPipelineHygieneHandler, type SalesPipelineHygienePayload } from '../../src/lib/aiBrain/sops/salesPipelineHygiene.ts';
import { DeterministicFollowUpDraftClient, GeminiFollowUpDraftClient } from '../../src/lib/aiBrain/domains/sales/followUpDraftClient.ts';
import type { StaleLeadFinding, LeadFollowUpDraft, ReadinessLead } from '../../src/lib/aiBrain/domains/sales/types.ts';

const PLATFORM_OWNER_ORG_ID = '00000000-0000-0000-0000-000000000001'; // CONVAZANT INC — see scheduled-sweep.ts's header.

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: leadRows, error: leadsError } = await supabase
    .from('cp360_leads')
    .select('id, full_name, company_name, status, created_at');
  if (leadsError) return json({ error: `Failed to load leads: ${leadsError.message}` }, 502);

  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const draftClient = process.env.GEMINI_API_KEY ? new GeminiFollowUpDraftClient() : new DeterministicFollowUpDraftClient();
  const sopHandler = createSalesPipelineHygieneHandler(draftClient);

  const asOfDate = new Date().toISOString().split('T')[0];
  const ctx = { companyId: PLATFORM_OWNER_ORG_ID, projectId: null, correlationId: crypto.randomUUID() };
  const payload: SalesPipelineHygienePayload = { asOfDate, leads: (leadRows ?? []) as ReadinessLead[] };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.sales_pipeline_hygiene', payload as unknown as Record<string, unknown>);
  const { run } = await engine.run(ctx, 'sales_pipeline_hygiene_v1', '1.0.0', event, sopHandler);

  const calls = await repo.listToolCallsByWorkflowRun(run.id);
  const staleFindings = (calls.find((c) => c.toolName === 'identify_stale_leads')?.result ?? []) as StaleLeadFinding[];
  const drafts = (calls.find((c) => c.toolName === 'draft_lead_followup')?.result ?? []) as LeadFollowUpDraft[];
  const [approval] = await repo.listApprovalsByWorkflowRun(run.id);

  return json({
    workflowRunId: run.id,
    status: run.status,
    staleFindings,
    drafts,
    approvalId: approval?.id ?? null,
  });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
