// On-demand trigger for client_communication_draft_v1 — backs the Client
// Communication AI panel on ProjectDetailPage's Comms tab. Reuses the
// exact SOP handler every other trigger uses (Frozen §23.4). Approving
// the resulting draft (if any) goes through the existing
// api/ai-brain/decide-approval.ts endpoint, same as every other
// approval-gated SOP — this endpoint only ever starts the run.
//
// NOT exercised against a live Supabase project or live model from this
// sandbox — see api/cron/scheduled-sweep.ts's header for the same caveat.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.ts';
import { AuditLog } from '../../src/lib/aiBrain/audit.ts';
import { WorkflowEngine } from '../../src/lib/aiBrain/workflow.ts';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.ts';
import { emitScheduleEvent } from '../../src/lib/aiBrain/events.ts';
import { createClientCommunicationDraftHandler, type ClientCommunicationDraftPayload } from '../../src/lib/aiBrain/sops/clientCommunicationDraft.ts';
import { DeterministicDraftClient, GeminiDraftClient } from '../../src/lib/aiBrain/domains/customerSuccess/draftClient.ts';
import type { ClientCommunicationDraft, VerifiedClientFacts } from '../../src/lib/aiBrain/domains/customerSuccess/types.ts';

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
    .select('id, organization_id')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projectError || !project) return json({ error: 'Project not found.' }, 404);

  const [{ data: decisions }, { data: delayReasons }] = await Promise.all([
    supabase.from('client_decisions')
      .select('id, project_id, decision_title, needed_by_date, status')
      .eq('project_id', project.id),
    supabase.from('project_delay_reasons')
      .select('id, project_id, delay_category, client_safe_reason, revised_projected_completion, client_visible')
      .eq('project_id', project.id),
  ]);

  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const draftClient = process.env.GEMINI_API_KEY ? new GeminiDraftClient() : new DeterministicDraftClient();
  const sopHandler = createClientCommunicationDraftHandler(draftClient);

  const asOfDate = new Date().toISOString().split('T')[0];
  const ctx = { companyId: project.organization_id, projectId: project.id, correlationId: crypto.randomUUID() };
  const payload: ClientCommunicationDraftPayload = {
    projectId: project.id,
    asOfDate,
    decisions: (decisions ?? []) as ClientCommunicationDraftPayload['decisions'],
    delayReasons: (delayReasons ?? []) as ClientCommunicationDraftPayload['delayReasons'],
  };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);
  const { run } = await engine.run(ctx, 'client_communication_draft_v1', '1.0.0', event, sopHandler);

  const calls = await repo.listToolCallsByWorkflowRun(run.id);
  const facts = calls.find((c) => c.toolName === 'gather_verified_client_facts')?.result as VerifiedClientFacts | undefined;
  const drafts = (calls.find((c) => c.toolName === 'draft_client_communication')?.result ?? []) as ClientCommunicationDraft[];
  const [approval] = await repo.listApprovalsByWorkflowRun(run.id);

  return json({
    workflowRunId: run.id,
    status: run.status,
    candidateCount: facts?.candidates.length ?? 0,
    drafts,
    approvalId: approval?.id ?? null,
  });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
