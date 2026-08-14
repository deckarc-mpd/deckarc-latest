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
// Scope: this cron tick runs all five scheduled sweeps built through Phase
// 9 (Tomorrow Readiness, Trade & Material Coordination, Compliance Permit/
// Inspection, Billing/AR/Margin, Sales Pipeline Hygiene) for every company
// whose configured local time currently falls in that sweep's window. The
// Chief of Staff daily-synthesis sweep and the Action Center/Command
// Center read paths are wired in the UI layer (client-side reads, same
// pattern as DashboardPage/ActionBoardPage) rather than bolted onto this
// endpoint — keeping this cron's job to exactly what CP360_SCHEDULED_OPERATING_EVENTS.md
// calls the "deterministic sweep, run first" half of the rhythm.
//
// Compliance and Finance run once per project per company, same as the two
// Project Ops sweeps. Sales Pipeline Hygiene is different on two counts,
// both because `cp360_leads` (unlike every other AI Brain input table) has
// no organization_id column at all (see its migration) and is a single
// shared list, not per-tenant data:
//   1. It runs once per cron tick, not once per company — there's nothing
//      to loop over.
//   2. Its audit trail's company_id (a NOT NULL FK to organizations,
//      see 20260812140000_create_ai_brain_foundation.sql) is anchored to
//      the Platform Owner org (CONVAZANT INC, organization_type =
//      'Platform Owner' per 20260523193450_script6_organizations_enhanced.sql)
//      rather than any contractor tenant, since these are CP360 platform
//      sign-up leads, not a tenant's own sales pipeline.
// Per CP360_SCHEDULED_OPERATING_EVENTS.md §6 it is also weekly, not daily
// — gated below on Monday in the Platform Owner org's configured timezone.
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
import { GeminiComplianceInterpreter } from '../../src/lib/aiBrain/domains/compliance/aiInterpreter.ts';
import { GeminiFinanceInterpreter } from '../../src/lib/aiBrain/domains/finance/aiInterpreter.ts';
import { GeminiFollowUpDraftClient } from '../../src/lib/aiBrain/domains/sales/followUpDraftClient.ts';
import {
  runDailyOperatingSweeps,
  runCompliancePermitInspectionSweep,
  runBillingArMarginSweep,
  runSalesPipelineHygieneSweep,
  type SweepProjectInput,
  type ComplianceSweepProjectInput,
  type FinanceSweepProjectInput,
} from '../../src/lib/aiBrain/scheduling/sweepOrchestrator.ts';
import {
  isWithinSweepWindow,
  localWeekday,
  isBusinessDay,
  type CompanyScheduleConfig,
  DEFAULT_EXCLUDED_PROJECT_STATUSES,
} from '../../src/lib/aiBrain/scheduling/schedulingConfig.ts';
import type { ReadinessComplianceDocument } from '../../src/lib/aiBrain/domains/compliance/types.ts';
import type { ReadinessLead } from '../../src/lib/aiBrain/domains/sales/types.ts';

const TOMORROW_READINESS_LOCAL_TIME = '15:00';
const TRADE_CONFIRMATION_CUTOFF_LOCAL_TIME = '16:00';
const COMPLIANCE_SWEEP_LOCAL_TIME = '11:00';
const FINANCE_SWEEP_LOCAL_TIME = '14:00';
const SALES_PIPELINE_HYGIENE_LOCAL_TIME = '09:00';
const SALES_PIPELINE_HYGIENE_WEEKDAY = 1; // Monday, per CP360_SCHEDULED_OPERATING_EVENTS.md's "Weekly" cadence.
const PLATFORM_OWNER_ORG_ID = '00000000-0000-0000-0000-000000000001'; // CONVAZANT INC — see file header.

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
  const complianceInterpreter = new GeminiComplianceInterpreter();
  const financeInterpreter = new GeminiFinanceInterpreter();
  const followUpDraftClient = new GeminiFollowUpDraftClient();

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
    const dueForCompliance = isWithinSweepWindow(now, config, COMPLIANCE_SWEEP_LOCAL_TIME);
    const dueForFinance = isWithinSweepWindow(now, config, FINANCE_SWEEP_LOCAL_TIME);
    if (!dueForReadiness && !dueForTradeMaterial && !dueForCompliance && !dueForFinance) continue;

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, status, contract_amount')
      .eq('organization_id', org.id);
    if (projectsError || !projects) continue;

    const ran: string[] = [];
    const ctx = { companyId: org.id, projectId: null, correlationId: crypto.randomUUID() };

    if (dueForReadiness || dueForTradeMaterial) {
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

      const { readiness, tradeMaterial } = await runDailyOperatingSweeps(
        ctx, audit, repo, engine, config, asOfDate, sweepInputs, interpreter
      );
      if (dueForReadiness) ran.push(`tomorrow_readiness_v1 (${readiness.projectsEvaluated} projects, ${readiness.exceptionsFound} exceptions)`);
      if (dueForTradeMaterial) ran.push(`trade_material_coordination_v1 (${tradeMaterial.projectsEvaluated} projects, ${tradeMaterial.exceptionsFound} exceptions)`);
    }

    if (dueForCompliance) {
      const complianceInputs: ComplianceSweepProjectInput[] = [];
      for (const project of projects) {
        const [{ data: permits }, { data: inspections }] = await Promise.all([
          supabase.from('permits')
            .select('id, project_id, permit_type, permit_status, permit_expiration_date, revision_requested, correction_notes')
            .eq('project_id', project.id),
          supabase.from('inspections')
            .select('id, project_id, inspection_type, scheduled_date, result, correction_required, correction_notes, reinspection_required, reinspection_scheduled_date')
            .eq('project_id', project.id),
        ]);
        complianceInputs.push({
          projectId: project.id,
          status: project.status,
          permits: (permits ?? []) as ComplianceSweepProjectInput['permits'],
          inspections: (inspections ?? []) as ComplianceSweepProjectInput['inspections'],
        });
      }
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, license_expiration, coi_expiration, insurance_status')
        .eq('organization_id', org.id);
      const documents = (profiles ?? []) as ReadinessComplianceDocument[];

      const complianceSummary = await runCompliancePermitInspectionSweep(
        ctx, audit, repo, engine, config, asOfDate, complianceInputs, documents, complianceInterpreter
      );
      ran.push(`compliance_permit_inspection_sweep_v1 (${complianceSummary.projectsEvaluated} projects, ${complianceSummary.exceptionsFound} exceptions)`);
    }

    if (dueForFinance) {
      const financeInputs: FinanceSweepProjectInput[] = [];
      for (const project of projects) {
        const [{ data: milestones }, { data: vendorBills }, { data: costEntries }, { data: changeOrders }] = await Promise.all([
          supabase.from('payment_milestones')
            .select('id, project_id, milestone_name, amount, due_date, status')
            .eq('project_id', project.id),
          supabase.from('vendor_bills')
            .select('id, project_id, vendor_name, due_date, amount, status, dispute_notes')
            .eq('project_id', project.id),
          supabase.from('project_cost_entries')
            .select('id, project_id, category, amount, source')
            .eq('project_id', project.id),
          supabase.from('change_orders')
            .select('id, project_id, cost_impact, approval_status')
            .eq('project_id', project.id),
        ]);
        financeInputs.push({
          projectId: project.id,
          status: project.status,
          contractAmount: (project as { contract_amount: number | null }).contract_amount,
          milestones: (milestones ?? []) as FinanceSweepProjectInput['milestones'],
          vendorBills: (vendorBills ?? []) as FinanceSweepProjectInput['vendorBills'],
          costEntries: (costEntries ?? []) as FinanceSweepProjectInput['costEntries'],
          changeOrders: (changeOrders ?? []) as FinanceSweepProjectInput['changeOrders'],
        });
      }

      const financeSummary = await runBillingArMarginSweep(
        ctx, audit, repo, engine, config, asOfDate, financeInputs, financeInterpreter
      );
      ran.push(`billing_ar_margin_sweep_v1 (${financeSummary.projectsEvaluated} projects, ${financeSummary.exceptionsFound} exceptions)`);
    }

    if (ran.length > 0) results.push({ companyId: org.id, ran });
  }

  // Sales Pipeline Hygiene: once per cron tick, not once per company — see
  // file header for why `cp360_leads` isn't looped per-org like everything
  // else above.
  const { data: platformOrg } = await supabase
    .from('organizations')
    .select('id, timezone, default_allow_saturday_work, default_allow_sunday_work, excluded_project_statuses')
    .eq('id', PLATFORM_OWNER_ORG_ID)
    .maybeSingle();
  if (platformOrg) {
    const platformOrgRow = platformOrg as OrgRow;
    const platformConfig: CompanyScheduleConfig = {
      companyId: platformOrgRow.id,
      timezone: platformOrgRow.timezone || 'America/New_York',
      allowSaturdayWork: platformOrgRow.default_allow_saturday_work,
      allowSundayWork: platformOrgRow.default_allow_sunday_work,
      holidayDates: [],
      excludedProjectStatuses: platformOrgRow.excluded_project_statuses?.length
        ? platformOrgRow.excluded_project_statuses
        : DEFAULT_EXCLUDED_PROJECT_STATUSES,
    };
    const dueForSales = isBusinessDay(now, platformConfig)
      && localWeekday(now, platformConfig.timezone) === SALES_PIPELINE_HYGIENE_WEEKDAY
      && isWithinSweepWindow(now, platformConfig, SALES_PIPELINE_HYGIENE_LOCAL_TIME);

    if (dueForSales) {
      const { data: leadRows } = await supabase
        .from('cp360_leads')
        .select('id, full_name, company_name, status, created_at');
      const leads = (leadRows ?? []) as ReadinessLead[];
      const salesCtx = { companyId: platformOrgRow.id, projectId: null, correlationId: crypto.randomUUID() };
      const salesSummary = await runSalesPipelineHygieneSweep(
        salesCtx, audit, repo, engine, asOfDate, leads, followUpDraftClient
      );
      results.push({
        companyId: platformOrgRow.id,
        ran: [`sales_pipeline_hygiene_v1 (${salesSummary.exceptionsFound} stale leads)`],
      });
    }
  }

  return json({ ok: true, asOfDate, companiesSwept: results.length, results });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
