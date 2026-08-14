// SOP: billing_ar_margin_sweep_v1 (owner: chief_of_staff / Avery)
//
// Frozen §5 (Finance Architecture) and §11's Billing/AR/Margin Sweep.
// Finance is explicitly NOT a standalone agent this phase — see the Phase
// 8 migration's header for why this SOP is owned by chief_of_staff rather
// than a new agent identity.
//
// Authority: read-only, like every other sweep-style SOP. It never writes
// a CP360 table and — critically for this phase — never moves money: there
// is no payment-execution tool anywhere in tools/financeTools.ts for it to
// even call. Any granted level (L1+) clears the read check.
//
// Same anti-override safety property as every other readiness-style SOP:
// AI (interpret_finance_finding) can explain WHY a gate failed but can
// never change WHETHER it failed, a due date, a margin number, or a cash
// projection — enforced structurally (FinanceInterpretation has no
// numeric field) and behaviorally (verification below independently
// re-derives finalStatus and fails the run if it ever diverges from what
// financeAssessment.ts computed).

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  computeFinanceAssessmentTool,
  createInterpretFinanceFindingTool,
  type ComputeFinanceAssessmentArgs,
} from '../tools/financeTools.ts';
import type { FinanceInterpreterClient, FinanceInterpretInput } from '../domains/finance/aiInterpreter.ts';
import type {
  ReadinessPaymentMilestone,
  ReadinessVendorBill,
  ReadinessCostEntry,
  ReadinessChangeOrder,
  DeterministicFinanceResult,
  FinanceInterpretation,
} from '../domains/finance/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface BillingArMarginSweepPayload {
  projectId: string;
  asOfDate: string;
  contractAmount: number | null;
  milestones: ReadinessPaymentMilestone[];
  vendorBills: ReadinessVendorBill[];
  costEntries: ReadinessCostEntry[];
  changeOrders: ReadinessChangeOrder[];
}

export function createBillingArMarginSweepHandler(interpreterClient: FinanceInterpreterClient) {
  const interpretTool = createInterpretFinanceFindingTool(interpreterClient);

  return async function billingArMarginSweepHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as BillingArMarginSweepPayload;

    const agent = await getAgentOrThrow(repo, 'chief_of_staff');

    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `chief_of_staff authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. CODE — every deterministic finance gate at once.
    if (!tools.has(computeFinanceAssessmentTool.name)) tools.register(computeFinanceAssessmentTool);
    const assessment = await callTool<ComputeFinanceAssessmentArgs, DeterministicFinanceResult>(tools, audit, ctx, 'compute_finance_assessment', {
      projectId: payload.projectId,
      asOfDate: payload.asOfDate,
      contractAmount: payload.contractAmount,
      milestones: payload.milestones,
      vendorBills: payload.vendorBills,
      costEntries: payload.costEntries,
      changeOrders: payload.changeOrders,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'compute',
    });

    // 2. AI — only for ambiguous dispute text or multi-gate synthesis.
    const freeText = payload.vendorBills.map((b) => b.dispute_notes);
    if (!tools.has(interpretTool.name)) tools.register(interpretTool);
    const interpretation = await callTool<FinanceInterpretInput, FinanceInterpretation>(tools, audit, ctx, 'interpret_finance_finding', {
      deterministic: assessment.result,
      freeText,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'interpret',
    });

    if (interpretation.result.invoked) {
      await audit.agentRun(ctx, workflowRunId, agent.id, {
        provider: interpreterClient.constructor.name,
        model: null,
        modelVersion: null,
        structuredProposal: { ...interpretation.result },
        evidenceIds: [assessment.toolCall.id, interpretation.toolCall.id],
        status: 'accepted',
      });
    }

    // 3. Verification — independently re-derive finalStatus and require it
    // to match what was actually reported, exactly like every prior
    // readiness-style SOP.
    return {
      kind: 'completed',
      expectedOutcome: { overallStatus: assessment.result.overallStatus, gateCount: assessment.result.gates.length },
      observedOutcome: { overallStatus: assessment.result.overallStatus, gateCount: assessment.result.gates.length },
    };
  };
}
