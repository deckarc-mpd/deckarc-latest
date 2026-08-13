// Vercel Cron entrypoint — the scheduled operating rhythm (Frozen §11/§20).
//
// NOT exercised against a live Supabase project or live model from this
// sandbox (no network path to either — see CP360_AI_COST_BASELINE.md's
// environment notes). The query shapes below were checked column-by-column
// against the real migrations (tasks, crew_confirmations, materials,
// daily_updates, organizations, projects) and the mapping logic reuses the
// same Readiness* types Phase 2/3's fixtures already prove correct — but,
// exactly like supabaseRepository.ts and GeminiRiskInterpreter, this file
// is a prerequisite-verification item before real deployment, not something
// this sandbox can claim to have proven end to end.
//
// Scope: this cron tick runs the two project-scoped sweeps (Tomorrow
// Readiness, Trade & Material Coordination) for every company whose
// configured local time currently falls in one of those cadences' windows.
// The Chief of Staff daily-synthesis sweep and the Action Center/Command
// Center read paths are wired in the UI layer (client-side reads, same
// pattern as DashboardPage/ActionBoardPage) rather than bolted onto this
// endpoint — keeping this cron's job to exactly what CP360_SCHEDULED_OPERATING_EVENTS.md
// calls the "deterministic sweep, run first" half of the rhythm.
//
// Vercel Cron granularity note: this endpoint is scheduled hourly in
// vercel.json ("0 * * * *"). On plans that only allow a daily cron, a
// single daily fire will only reliably land in the configured 30-minute
// sweep windows for companies whose local sweep time happens to line up
// with that one daily fire — an accepted limitation of the "existing job
// mechanism first" decision (ADR-CP360-AI-002), not a bug in the window
// logic itself, which is unit-tested independently in
// src/lib/aiBrain/scheduling/__tests__/schedulingConfig.test.ts.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../../src/lib/aiBrain/supabaseRepository.ts';
import { AuditLog } from '../../src/lib/aiBrain/audit.ts';
import { WorkflowEngine } from '../../src/lib/aiBrain/workflow.ts';
import { ToolRegistry } from '../../src/lib/aiBrain/tools.ts';
import { GeminiRiskInterpreter } from '../../src/lib/aiBrain/domains/projectOps/aiInterpreter.ts';
import { runDailyOperatingSweeps, type SweepProjectInput } from '../../src/lib/aiBrain/scheduling/sweepOrchestrator.ts';
import { isWithinSweepWindow, type CompanyScheduleConfig, DEFAULT_EXCLUDED_PROJECT_STATUSES } from '../../src/lib/aiBrain/scheduling/schedulingConfig.ts';

const TOMORROW_READINESS_LOCAL_TIME = '15:00';
const TRADE_CONFIRMATION_CUTOFF_LOCAL_TIME = '16:00';

interface OrgRow {
  id: string;
  timezone: string;
  default_allow_saturday_work: boolean;
  default_allow_sunday_work: boolean;
  excluded_project_statuses: string[] | null;
}

function tomorrowDateString(instant: Date): string {
  const d = new Date(instant);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

export default async function handler(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return json({ error: 'Not authorized.' }, 401);
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const repo = createSupabaseRepository(supabase);
  const audit = new AuditLog(repo);
  const tools = new ToolRegistry();
  const engine = new WorkflowEngine(audit, repo, tools);
  const interpreter = new GeminiRiskInterpreter();

  const now = new Date();
  const asOfDate = tomorrowDateString(now);

  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, timezone, default_allow_saturday_work, default_allow_sunday_work, excluded_project_statuses');
  if (orgError) return json({ error: `Failed to load organizations: ${orgError.message}` }, 502);

  const results: Array<{ companyId: string; ran: string[] }> = [];

  for (const org of (orgs ?? []) as OrgRow[]) {
    const config: CompanyScheduleConfig = {
      companyId: org.id,
      timezone: org.timezone || 'America/New_York',
      allowSaturdayWork: org.default_allow_saturday_work,
      allowSundayWork: org.default_allow_sunday_work,
      holidayDates: [], // reserved for a future company-holiday-override source; us_holidays applies at the project level today.
      excludedProjectStatuses: org.excluded_project_statuses?.length
        ? org.excluded_project_statuses
        : DEFAULT_EXCLUDED_PROJECT_STATUSES,
    };

    const dueForReadiness = isWithinSweepWindow(now, config, TOMORROW_READINESS_LOCAL_TIME);
    const dueForTradeMaterial = isWithinSweepWindow(now, config, TRADE_CONFIRMATION_CUTOFF_LOCAL_TIME);
    if (!dueForReadiness && !dueForTradeMaterial) continue;

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('organization_id', org.id);
    if (projectsError || !projects) continue;

    const sweepInputs: SweepProjectInput[] = [];
    for (const project of projects) {
      const [{ data: tasks }, { data: crewConfirmations }, { data: materials }, { data: dailyUpdates }] = await Promise.all([
        supabase.from('tasks')
          .select('id, project_id, task_name, status, planned_start_date, projected_start_date, dependency_task_id, schedule_locked, blocked_reason')
          .eq('project_id', project.id),
        supabase.from('crew_confirmations')
          .select('id, project_id, task_id, scheduled_date, confirmation_status, crew_available, start_time_confirmed, site_access_confirmed, questions_before_arrival, confirmation_notes')
          .eq('project_id', project.id).eq('scheduled_date', asOfDate),
        supabase.from('materials')
          .select('id, project_id, related_task_id, material_name, material_ready_status, expected_delivery_date')
          .eq('project_id', project.id),
        supabase.from('daily_updates')
          .select('id, project_id, task_id, update_date, current_status, blockers, delay_reason, delay_days, materials_pending, weather_issue')
          .eq('project_id', project.id)
          .order('update_date', { ascending: false })
          .limit(50),
      ]);

      sweepInputs.push({
        projectId: project.id,
        status: project.status,
        asOfDate,
        tasks: (tasks ?? []) as SweepProjectInput['tasks'],
        crewConfirmations: (crewConfirmations ?? []) as SweepProjectInput['crewConfirmations'],
        materials: (materials ?? []) as SweepProjectInput['materials'],
        dailyUpdates: (dailyUpdates ?? []) as SweepProjectInput['dailyUpdates'],
      });
    }

    const ctx = { companyId: org.id, projectId: null, correlationId: crypto.randomUUID() };
    const { readiness, tradeMaterial } = await runDailyOperatingSweeps(
      ctx, audit, repo, engine, config, asOfDate, sweepInputs, interpreter
    );

    const ran: string[] = [];
    if (dueForReadiness) ran.push(`tomorrow_readiness_v1 (${readiness.projectsEvaluated} projects, ${readiness.exceptionsFound} exceptions)`);
    if (dueForTradeMaterial) ran.push(`trade_material_coordination_v1 (${tradeMaterial.projectsEvaluated} projects, ${tradeMaterial.exceptionsFound} exceptions)`);
    results.push({ companyId: org.id, ran });
  }

  return json({ ok: true, asOfDate, companiesSwept: results.length, results });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
