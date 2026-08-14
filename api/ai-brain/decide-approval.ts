// Records a human's approve/reject decision and resumes the underlying
// workflow run — the only server-side write this Action Center UI needs.
// ai_approvals has NO insert/update RLS policy for authenticated/anon (see
// supabase/migrations/20260812140000_create_ai_brain_foundation.sql) — only
// a service-role client can decide an approval, which is why this must be
// a Vercel function rather than a direct client-side Supabase call, exactly
// like every other write path in this codebase (see supabaseRepository.ts's
// header comment).
//
// Reuses AuditLog.decideApproval + WorkflowEngine.resume with the SAME SOP
// handler factories every other trigger uses — no parallel "UI approval"
// code path. NOT exercised against a live Supabase project from this
// sandbox.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.ts';
import { AuditLog } from '../../src/lib/aiBrain/audit.ts';
import { WorkflowEngine, type SopHandler } from '../../src/lib/aiBrain/workflow.ts';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.ts';
import { taskDelayCascadeHandler } from '../../src/lib/aiBrain/sops/taskDelayCascade.ts';
import { createTradeMaterialCoordinationHandler } from '../../src/lib/aiBrain/sops/tradeMaterialCoordination.ts';
import { createClientCommunicationDraftHandler } from '../../src/lib/aiBrain/sops/clientCommunicationDraft.ts';
import { createSalesPipelineHygieneHandler } from '../../src/lib/aiBrain/sops/salesPipelineHygiene.ts';
import { DeterministicRiskInterpreter, GeminiRiskInterpreter } from '../../src/lib/aiBrain/domains/projectOps/aiInterpreter.ts';
import { DeterministicDraftClient, GeminiDraftClient } from '../../src/lib/aiBrain/domains/customerSuccess/draftClient.ts';
import { DeterministicFollowUpDraftClient, GeminiFollowUpDraftClient } from '../../src/lib/aiBrain/domains/sales/followUpDraftClient.ts';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  let body: { approvalId?: string; decision?: 'approved' | 'rejected'; approverUserId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.approvalId || !body.decision || !body.approverUserId) {
    return json({ error: 'approvalId, decision, and approverUserId are all required.' }, 400);
  }
  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    return json({ error: "decision must be 'approved' or 'rejected'." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);

  const decided = await audit.decideApproval(body.approvalId, body.decision, body.approverUserId);

  const run = await audit.getWorkflowRun(decided.workflowRunId);
  if (!run) return json({ error: `workflow run ${decided.workflowRunId} not found` }, 404);

  const geminiInterpreter = new GeminiRiskInterpreter();
  const HANDLERS: Record<string, SopHandler> = {
    task_delay_cascade_v1: taskDelayCascadeHandler,
    trade_material_coordination_v1: createTradeMaterialCoordinationHandler(
      process.env.GEMINI_API_KEY ? geminiInterpreter : new DeterministicRiskInterpreter()
    ),
    client_communication_draft_v1: createClientCommunicationDraftHandler(
      process.env.GEMINI_API_KEY ? new GeminiDraftClient() : new DeterministicDraftClient()
    ),
    sales_pipeline_hygiene_v1: createSalesPipelineHygieneHandler(
      process.env.GEMINI_API_KEY ? new GeminiFollowUpDraftClient() : new DeterministicFollowUpDraftClient()
    ),
  };
  const sopHandler = HANDLERS[run.sopId];
  if (!sopHandler) {
    return json({ decided, resumed: false, note: `no resumable handler registered for SOP ${run.sopId}` });
  }

  const triggerEvent = await audit.getEvent(run.triggerEventId);
  if (!triggerEvent) return json({ error: `trigger event ${run.triggerEventId} not found` }, 404);

  const result = await engine.resume({ companyId: run.companyId, projectId: run.projectId, correlationId: run.correlationId }, run.id, triggerEvent, sopHandler);

  return json({ decided, resumed: true, workflowRunStatus: result.run.status });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
