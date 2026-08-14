// On-demand trigger for estimate_pricing_recommendation_v1 — backs the AI
// Estimate page's "Get AI Estimate" action. Reuses the exact SOP handler
// every other trigger uses (Frozen §23.4). Read-only and never sets a
// price — per Frozen §7, final price authorization remains human-only;
// this endpoint only ever returns a proposed range for a human to review.
//
// NOT exercised against a live Supabase project or live model from this
// sandbox — see api/cron/scheduled-sweep.ts's header for the same caveat.
// Company-wide (not project-scoped): comparable pricing is looked up
// across every completed project in the caller's organization, same as
// the domain's comparableHistory.ts is designed to do.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.ts';
import { AuditLog } from '../../src/lib/aiBrain/audit.ts';
import { WorkflowEngine } from '../../src/lib/aiBrain/workflow.ts';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.ts';
import { emitScheduleEvent } from '../../src/lib/aiBrain/events.ts';
import { createEstimatePricingRecommendationHandler, type EstimatePricingRecommendationPayload } from '../../src/lib/aiBrain/sops/estimatePricingRecommendation.ts';
import { DeterministicScopeInterpreter, GeminiScopeInterpreter } from '../../src/lib/aiBrain/domains/estimating/scopeInterpreter.ts';
import type { ScopeNormalizationResult, PricingRecommendation } from '../../src/lib/aiBrain/domains/estimating/types.ts';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  let body: { scopeText?: string; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!body.scopeText?.trim()) return json({ error: 'scopeText is required.' }, 400);
  if (!body.organizationId) return json({ error: 'organizationId is required.' }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: completedProjects } = await supabase
    .from('projects')
    .select('id, project_type, status, contract_amount')
    .eq('organization_id', body.organizationId)
    .eq('status', 'Completed');
  const projectIds = (completedProjects ?? []).map((p) => p.id);
  const { data: costEntries } = projectIds.length
    ? await supabase.from('project_cost_entries').select('id, project_id, category, amount, source').in('project_id', projectIds)
    : { data: [] };

  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const interpreter = process.env.GEMINI_API_KEY ? new GeminiScopeInterpreter() : new DeterministicScopeInterpreter();
  const sopHandler = createEstimatePricingRecommendationHandler(interpreter);

  const ctx = { companyId: body.organizationId, projectId: null, correlationId: crypto.randomUUID() };
  const payload: EstimatePricingRecommendationPayload = {
    scopeText: body.scopeText.trim(),
    completedProjects: (completedProjects ?? []) as EstimatePricingRecommendationPayload['completedProjects'],
    costEntries: (costEntries ?? []) as EstimatePricingRecommendationPayload['costEntries'],
  };
  const event = await emitScheduleEvent(audit, ctx, 'schedule.estimate_pricing_recommendation', payload as unknown as Record<string, unknown>);
  const { run } = await engine.run(ctx, 'estimate_pricing_recommendation_v1', '1.0.0', event, sopHandler);

  const calls = await repo.listToolCallsByWorkflowRun(run.id);
  const normalized = calls.find((c) => c.toolName === 'normalize_project_scope')?.result as ScopeNormalizationResult | undefined;
  const pricing = calls.find((c) => c.toolName === 'find_comparable_pricing')?.result as PricingRecommendation | undefined;

  return json({ workflowRunId: run.id, status: run.status, normalized, pricing });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
