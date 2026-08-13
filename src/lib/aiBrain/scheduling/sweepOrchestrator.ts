// The scheduled operating rhythm (Frozen §11/§20): deterministic sweeps run
// first, across every eligible project, reusing the SOPs already built in
// Phase 2/3 through the SAME WorkflowEngine/ToolRegistry/AuditLog every
// other trigger (UI, voice, API) uses — this file adds no parallel
// execution path, it only decides *which* projects a scheduled trigger
// should run those SOPs against, and it always records a summary event per
// company/SOP, even when a sweep finds nothing (CP360_SCHEDULED_OPERATING_EVENTS.md §7).

import { emitScheduleEvent } from '../events.ts';
import type { AuditLog, AuditContext } from '../audit.ts';
import type { AiBrainRepository } from '../repository.ts';
import type { WorkflowEngine } from '../workflow.ts';
import { createTomorrowReadinessHandler, type TomorrowReadinessPayload } from '../sops/tomorrowReadiness.ts';
import {
  createTradeMaterialCoordinationHandler,
  type TradeMaterialCoordinationPayload,
} from '../sops/tradeMaterialCoordination.ts';
import { createCompliancePermitInspectionSweepHandler, type CompliancePermitInspectionSweepPayload } from '../sops/compliancePermitInspectionSweep.ts';
import { createBillingArMarginSweepHandler, type BillingArMarginSweepPayload } from '../sops/billingArMarginSweep.ts';
import { createSalesPipelineHygieneHandler, type SalesPipelineHygienePayload } from '../sops/salesPipelineHygiene.ts';
import type { RiskInterpreterClient } from '../domains/projectOps/aiInterpreter.ts';
import type { ComplianceInterpreterClient } from '../domains/compliance/aiInterpreter.ts';
import type { FinanceInterpreterClient } from '../domains/finance/aiInterpreter.ts';
import type { FollowUpDraftClient } from '../domains/sales/followUpDraftClient.ts';
import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
} from '../domains/projectOps/types.ts';
import type {
  ReadinessPermit,
  ReadinessInspection,
  ReadinessComplianceDocument,
} from '../domains/compliance/types.ts';
import type {
  ReadinessPaymentMilestone,
  ReadinessVendorBill,
  ReadinessCostEntry,
  ReadinessChangeOrder,
} from '../domains/finance/types.ts';
import type { ReadinessLead } from '../domains/sales/types.ts';
import { isProjectEligibleForSweep, type CompanyScheduleConfig } from './schedulingConfig.ts';

export interface SweepProjectInput {
  projectId: string;
  status: string; // projects.status — determines eligibility, per schedulingConfig.
  asOfDate: string;
  tasks: ReadinessTask[];
  crewConfirmations: ReadinessCrewConfirmation[];
  materials: ReadinessMaterial[];
  dailyUpdates: ReadinessDailyUpdate[];
}

export interface SweepRunOutcome {
  projectId: string;
  workflowRunId: string;
  status: string;
  aiInvoked: boolean;
  escalated: boolean;
}

export interface ScheduledSweepSummary {
  companyId: string;
  sopId: 'tomorrow_readiness_v1' | 'trade_material_coordination_v1' | 'compliance_permit_inspection_sweep_v1' | 'billing_ar_margin_sweep_v1' | 'sales_pipeline_hygiene_v1';
  asOfDate: string;
  projectsEvaluated: number;
  projectsSkippedIneligible: number;
  outcomes: SweepRunOutcome[];
  exceptionsFound: number;
  aiCallsMade: number;
}

/** Did the interpret_field_update tool actually invoke a model for this run? Read from the audit trail, not re-derived. */
async function wasAiInvoked(repo: AiBrainRepository, workflowRunId: string): Promise<boolean> {
  const calls = await repo.listToolCallsByWorkflowRun(workflowRunId);
  return calls.some((c) => {
    if (c.toolName !== 'interpret_field_update') return false;
    const result = c.result as { invoked?: boolean } | null;
    return result?.invoked === true;
  });
}

async function recordSweepSummary(
  audit: AuditLog,
  ctx: AuditContext,
  eventType: string,
  summary: ScheduledSweepSummary
): Promise<void> {
  await audit.event(ctx, 'schedule', { type: 'schedule', id: 'scheduler' }, eventType, { ...summary } as unknown as Record<string, unknown>);
}

export async function runTomorrowReadinessSweep(
  ctx: AuditContext,
  audit: AuditLog,
  repo: AiBrainRepository,
  engine: WorkflowEngine,
  config: CompanyScheduleConfig,
  asOfDate: string,
  projects: SweepProjectInput[],
  interpreterClient: RiskInterpreterClient
): Promise<ScheduledSweepSummary> {
  const handler = createTomorrowReadinessHandler(interpreterClient);
  const outcomes: SweepRunOutcome[] = [];
  let skipped = 0;

  for (const project of projects) {
    if (!isProjectEligibleForSweep({ status: project.status }, config)) {
      skipped++;
      continue;
    }
    const runCtx: AuditContext = { ...ctx, projectId: project.projectId, correlationId: crypto.randomUUID() };
    const payload: TomorrowReadinessPayload = {
      projectId: project.projectId,
      asOfDate,
      tasks: project.tasks,
      crewConfirmations: project.crewConfirmations,
      materials: project.materials,
      dailyUpdates: project.dailyUpdates,
    };
    const event = await emitScheduleEvent(audit, runCtx, 'schedule.tomorrow_readiness_check', payload as unknown as Record<string, unknown>);
    const { run } = await engine.run(runCtx, 'tomorrow_readiness_v1', '1.0.0', event, handler);
    outcomes.push({
      projectId: project.projectId,
      workflowRunId: run.id,
      status: run.status,
      aiInvoked: await wasAiInvoked(repo, run.id),
      escalated: run.status === 'waiting_approval',
    });
  }

  const summary: ScheduledSweepSummary = {
    companyId: ctx.companyId,
    sopId: 'tomorrow_readiness_v1',
    asOfDate,
    projectsEvaluated: outcomes.length,
    projectsSkippedIneligible: skipped,
    outcomes,
    exceptionsFound: outcomes.filter((o) => o.escalated).length,
    aiCallsMade: outcomes.filter((o) => o.aiInvoked).length,
  };
  await recordSweepSummary(audit, ctx, 'schedule.tomorrow_readiness_sweep_completed', summary);
  return summary;
}

export async function runTradeMaterialCoordinationSweep(
  ctx: AuditContext,
  audit: AuditLog,
  repo: AiBrainRepository,
  engine: WorkflowEngine,
  config: CompanyScheduleConfig,
  asOfDate: string,
  projects: SweepProjectInput[],
  interpreterClient: RiskInterpreterClient
): Promise<ScheduledSweepSummary> {
  const handler = createTradeMaterialCoordinationHandler(interpreterClient);
  const outcomes: SweepRunOutcome[] = [];
  let skipped = 0;

  for (const project of projects) {
    if (!isProjectEligibleForSweep({ status: project.status }, config)) {
      skipped++;
      continue;
    }
    const runCtx: AuditContext = { ...ctx, projectId: project.projectId, correlationId: crypto.randomUUID() };
    const payload: TradeMaterialCoordinationPayload = {
      projectId: project.projectId,
      asOfDate,
      tasks: project.tasks,
      crewConfirmations: project.crewConfirmations,
      materials: project.materials,
    };
    const event = await emitScheduleEvent(audit, runCtx, 'schedule.trade_confirmation_cutoff', payload as unknown as Record<string, unknown>);
    const { run } = await engine.run(runCtx, 'trade_material_coordination_v1', '1.0.0', event, handler);
    outcomes.push({
      projectId: project.projectId,
      workflowRunId: run.id,
      status: run.status,
      aiInvoked: await wasAiInvoked(repo, run.id),
      escalated: run.status === 'waiting_approval',
    });
  }

  const summary: ScheduledSweepSummary = {
    companyId: ctx.companyId,
    sopId: 'trade_material_coordination_v1',
    asOfDate,
    projectsEvaluated: outcomes.length,
    projectsSkippedIneligible: skipped,
    outcomes,
    exceptionsFound: outcomes.filter((o) => o.escalated).length,
    aiCallsMade: outcomes.filter((o) => o.aiInvoked).length,
  };
  await recordSweepSummary(audit, ctx, 'schedule.trade_material_coordination_sweep_completed', summary);
  return summary;
}

/** Runs the full daily operating rhythm's two project-scoped Project Ops sweeps back to back for one company. */
export async function runDailyOperatingSweeps(
  ctx: AuditContext,
  audit: AuditLog,
  repo: AiBrainRepository,
  engine: WorkflowEngine,
  config: CompanyScheduleConfig,
  asOfDate: string,
  projects: SweepProjectInput[],
  interpreterClient: RiskInterpreterClient
): Promise<{ readiness: ScheduledSweepSummary; tradeMaterial: ScheduledSweepSummary }> {
  const readiness = await runTomorrowReadinessSweep(ctx, audit, repo, engine, config, asOfDate, projects, interpreterClient);
  const tradeMaterial = await runTradeMaterialCoordinationSweep(ctx, audit, repo, engine, config, asOfDate, projects, interpreterClient);
  return { readiness, tradeMaterial };
}

// ─── Compliance Permit/Inspection Sweep (Phase 7) ───────────────────────────
// A standalone sweep, not folded into runDailyOperatingSweeps, since it's
// owned by a different agent (compliance, not project_operations) and uses
// its own interpreter client type — kept additive so Phase 4's existing
// two-sweep contract and callers are untouched.

export interface ComplianceSweepProjectInput {
  projectId: string;
  status: string;
  permits: ReadinessPermit[];
  inspections: ReadinessInspection[];
}

export async function runCompliancePermitInspectionSweep(
  ctx: AuditContext,
  audit: AuditLog,
  repo: AiBrainRepository,
  engine: WorkflowEngine,
  config: CompanyScheduleConfig,
  asOfDate: string,
  projects: ComplianceSweepProjectInput[],
  documents: ReadinessComplianceDocument[],
  interpreterClient: ComplianceInterpreterClient
): Promise<ScheduledSweepSummary> {
  const handler = createCompliancePermitInspectionSweepHandler(interpreterClient);
  const outcomes: SweepRunOutcome[] = [];
  let skipped = 0;
  let exceptionsFound = 0;

  for (const project of projects) {
    if (!isProjectEligibleForSweep({ status: project.status }, config)) {
      skipped++;
      continue;
    }
    const runCtx: AuditContext = { ...ctx, projectId: project.projectId, correlationId: crypto.randomUUID() };
    const payload: CompliancePermitInspectionSweepPayload = {
      projectId: project.projectId, asOfDate,
      permits: project.permits, inspections: project.inspections, documents,
    };
    const event = await emitScheduleEvent(audit, runCtx, 'schedule.compliance_permit_inspection_sweep', payload as unknown as Record<string, unknown>);
    const { run } = await engine.run(runCtx, 'compliance_permit_inspection_sweep_v1', '1.0.0', event, handler);

    // This SOP never escalates or fails under normal operation — its run
    // status is always 'completed'. The real "did something need
    // attention" signal is the deterministic result's overallStatus, not
    // the workflow run status (unlike the escalation-based sweeps above).
    const calls = await repo.listToolCallsByWorkflowRun(run.id);
    const readiness = calls.find((c) => c.toolName === 'compute_compliance_readiness')?.result as { overallStatus?: string } | null;
    const isException = readiness?.overallStatus !== 'ready';
    if (isException) exceptionsFound++;

    outcomes.push({
      projectId: project.projectId,
      workflowRunId: run.id,
      status: run.status,
      aiInvoked: await wasComplianceAiInvoked(repo, run.id),
      escalated: false, // this SOP never creates an approval — see file header.
    });
  }

  const summary: ScheduledSweepSummary = {
    companyId: ctx.companyId,
    sopId: 'compliance_permit_inspection_sweep_v1',
    asOfDate,
    projectsEvaluated: outcomes.length,
    projectsSkippedIneligible: skipped,
    outcomes,
    exceptionsFound,
    aiCallsMade: outcomes.filter((o) => o.aiInvoked).length,
  };
  await recordSweepSummary(audit, ctx, 'schedule.compliance_permit_inspection_sweep_completed', summary);
  return summary;
}

async function wasComplianceAiInvoked(repo: AiBrainRepository, workflowRunId: string): Promise<boolean> {
  const calls = await repo.listToolCallsByWorkflowRun(workflowRunId);
  return calls.some((c) => {
    if (c.toolName !== 'interpret_compliance_finding') return false;
    const result = c.result as { invoked?: boolean } | null;
    return result?.invoked === true;
  });
}

// ─── Billing/AR/Margin Sweep (Phase 8) ──────────────────────────────────────
// A standalone sweep, same reasoning as the compliance sweep: owned by a
// different agent (chief_of_staff — Finance is not a standalone agent per
// Frozen §5) and uses its own interpreter client type. Kept separate from
// runDailyOperatingSweeps so that function's existing contract and callers
// stay untouched.

export interface FinanceSweepProjectInput {
  projectId: string;
  status: string;
  contractAmount: number | null;
  milestones: ReadinessPaymentMilestone[];
  vendorBills: ReadinessVendorBill[];
  costEntries: ReadinessCostEntry[];
  changeOrders: ReadinessChangeOrder[];
}

export async function runBillingArMarginSweep(
  ctx: AuditContext,
  audit: AuditLog,
  repo: AiBrainRepository,
  engine: WorkflowEngine,
  config: CompanyScheduleConfig,
  asOfDate: string,
  projects: FinanceSweepProjectInput[],
  interpreterClient: FinanceInterpreterClient
): Promise<ScheduledSweepSummary> {
  const handler = createBillingArMarginSweepHandler(interpreterClient);
  const outcomes: SweepRunOutcome[] = [];
  let skipped = 0;
  let exceptionsFound = 0;

  for (const project of projects) {
    if (!isProjectEligibleForSweep({ status: project.status }, config)) {
      skipped++;
      continue;
    }
    const runCtx: AuditContext = { ...ctx, projectId: project.projectId, correlationId: crypto.randomUUID() };
    const payload: BillingArMarginSweepPayload = {
      projectId: project.projectId, asOfDate, contractAmount: project.contractAmount,
      milestones: project.milestones, vendorBills: project.vendorBills,
      costEntries: project.costEntries, changeOrders: project.changeOrders,
    };
    const event = await emitScheduleEvent(audit, runCtx, 'schedule.billing_ar_margin_sweep', payload as unknown as Record<string, unknown>);
    const { run } = await engine.run(runCtx, 'billing_ar_margin_sweep_v1', '1.0.0', event, handler);

    // Same reasoning as the compliance sweep: this SOP never escalates or
    // fails under normal operation, so the real "did something need
    // attention" signal is the deterministic result, not run.status.
    const calls = await repo.listToolCallsByWorkflowRun(run.id);
    const assessment = calls.find((c) => c.toolName === 'compute_finance_assessment')?.result as { overallStatus?: string } | null;
    if (assessment?.overallStatus !== 'ready') exceptionsFound++;

    outcomes.push({
      projectId: project.projectId,
      workflowRunId: run.id,
      status: run.status,
      aiInvoked: await wasFinanceAiInvoked(repo, run.id),
      escalated: false, // this SOP never creates an approval and never moves money.
    });
  }

  const summary: ScheduledSweepSummary = {
    companyId: ctx.companyId,
    sopId: 'billing_ar_margin_sweep_v1',
    asOfDate,
    projectsEvaluated: outcomes.length,
    projectsSkippedIneligible: skipped,
    outcomes,
    exceptionsFound,
    aiCallsMade: outcomes.filter((o) => o.aiInvoked).length,
  };
  await recordSweepSummary(audit, ctx, 'schedule.billing_ar_margin_sweep_completed', summary);
  return summary;
}

async function wasFinanceAiInvoked(repo: AiBrainRepository, workflowRunId: string): Promise<boolean> {
  const calls = await repo.listToolCallsByWorkflowRun(workflowRunId);
  return calls.some((c) => {
    if (c.toolName !== 'interpret_finance_finding') return false;
    const result = c.result as { invoked?: boolean } | null;
    return result?.invoked === true;
  });
}

// ─── Sales Pipeline Hygiene Sweep (Phase 9) ─────────────────────────────────
// Unlike every sweep above, leads are not project-scoped — cp360_leads has
// no project_id at all — so this sweep runs once per company, not once
// per project. isProjectEligibleForSweep/CompanyScheduleConfig's project-
// status exclusion logic doesn't apply here for the same reason; the
// company-configurable timezone/business-calendar gating still happens
// one level up, in the cron entrypoint's isWithinSweepWindow check, same
// as every other sweep.

export async function runSalesPipelineHygieneSweep(
  ctx: AuditContext,
  audit: AuditLog,
  repo: AiBrainRepository,
  engine: WorkflowEngine,
  asOfDate: string,
  leads: ReadinessLead[],
  draftClient: FollowUpDraftClient
): Promise<ScheduledSweepSummary> {
  const handler = createSalesPipelineHygieneHandler(draftClient);
  const runCtx: AuditContext = { ...ctx, projectId: null, correlationId: crypto.randomUUID() };
  const payload: SalesPipelineHygienePayload = { asOfDate, leads };
  const event = await emitScheduleEvent(audit, runCtx, 'schedule.sales_pipeline_hygiene', payload as unknown as Record<string, unknown>);
  const { run } = await engine.run(runCtx, 'sales_pipeline_hygiene_v1', '1.0.0', event, handler);

  const calls = await repo.listToolCallsByWorkflowRun(run.id);
  const staleFindings = calls.find((c) => c.toolName === 'identify_stale_leads')?.result as unknown[] | null;
  const exceptionsFound = Array.isArray(staleFindings) ? staleFindings.length : 0;

  const outcomes: SweepRunOutcome[] = [{
    projectId: 'company-wide', // sentinel — this sweep has no per-project scope, see file note above.
    workflowRunId: run.id,
    status: run.status,
    aiInvoked: await wasSalesAiInvoked(repo, run.id),
    escalated: run.status === 'waiting_approval',
  }];

  const summary: ScheduledSweepSummary = {
    companyId: ctx.companyId,
    sopId: 'sales_pipeline_hygiene_v1',
    asOfDate,
    projectsEvaluated: 1,
    projectsSkippedIneligible: 0,
    outcomes,
    exceptionsFound,
    aiCallsMade: outcomes.filter((o) => o.aiInvoked).length,
  };
  await recordSweepSummary(audit, ctx, 'schedule.sales_pipeline_hygiene_completed', summary);
  return summary;
}

async function wasSalesAiInvoked(repo: AiBrainRepository, workflowRunId: string): Promise<boolean> {
  const calls = await repo.listToolCallsByWorkflowRun(workflowRunId);
  return calls.some((c) => c.toolName === 'draft_lead_followup');
}
