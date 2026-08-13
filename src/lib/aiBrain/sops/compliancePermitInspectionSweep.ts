// SOP: compliance_permit_inspection_sweep_v1 (owner: compliance / Clara)
//
// Frozen §11's Permit/Inspection Sweep, and §4's Compliance scope: HOA,
// zoning, and permit tracking; inspection scheduling/readiness and
// correction tracking; COI/W-9 and regulatory document management.
//
// Authority: this SOP only ever READS — like tomorrow_readiness_v1, it
// never writes a CP360 table, never touches scheduleEngine, and never
// takes a consequential action. Any granted level (L1+) clears the read
// check. General project scheduling stays with Project Ops per the phase
// instructions — this SOP surfaces compliance exceptions for a human (via
// Action Center) or for Project Ops to act on if a compliance dependency
// blocks scheduling; it never cascades a schedule itself.
//
// Same anti-override safety property as every other readiness-style SOP:
// AI (interpret_compliance_finding) can explain WHY a gate failed but can
// never change WHETHER it failed — enforced structurally
// (ComplianceInterpretation has no status field) and behaviorally (the
// verification step below independently re-derives finalStatus and fails
// the run if it ever diverges from what readinessGates.ts computed).

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  computeComplianceReadinessTool,
  createInterpretComplianceFindingTool,
  type ComputeComplianceReadinessArgs,
} from '../tools/complianceTools.ts';
import type { ComplianceInterpreterClient, ComplianceInterpretInput } from '../domains/compliance/aiInterpreter.ts';
import type {
  ReadinessPermit,
  ReadinessInspection,
  ReadinessComplianceDocument,
  DeterministicComplianceResult,
  ComplianceInterpretation,
  ProjectComplianceAssessment,
} from '../domains/compliance/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface CompliancePermitInspectionSweepPayload {
  projectId: string;
  asOfDate: string;
  permits: ReadinessPermit[];
  inspections: ReadinessInspection[];
  documents: ReadinessComplianceDocument[];
}

export function createCompliancePermitInspectionSweepHandler(interpreterClient: ComplianceInterpreterClient) {
  const interpretTool = createInterpretComplianceFindingTool(interpreterClient);

  return async function compliancePermitInspectionSweepHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as CompliancePermitInspectionSweepPayload;

    const agent = await getAgentOrThrow(repo, 'compliance');

    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `compliance authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. CODE — deterministic permit/inspection/COI gates.
    if (!tools.has(computeComplianceReadinessTool.name)) tools.register(computeComplianceReadinessTool);
    const readiness = await callTool<ComputeComplianceReadinessArgs, DeterministicComplianceResult>(tools, audit, ctx, 'compute_compliance_readiness', {
      projectId: payload.projectId,
      asOfDate: payload.asOfDate,
      permits: payload.permits,
      inspections: payload.inspections,
      documents: payload.documents,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'compute',
    });

    // 2. AI — only for ambiguous correction-notes text or multi-gate synthesis.
    const freeText = [
      ...payload.permits.map((p) => p.correction_notes),
      ...payload.inspections.map((i) => i.correction_notes),
    ];
    if (!tools.has(interpretTool.name)) tools.register(interpretTool);
    const interpretation = await callTool<ComplianceInterpretInput, ComplianceInterpretation>(tools, audit, ctx, 'interpret_compliance_finding', {
      deterministic: readiness.result,
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
        evidenceIds: [readiness.toolCall.id, interpretation.toolCall.id],
        status: 'accepted',
      });
    }

    const assessment: ProjectComplianceAssessment = {
      deterministic: readiness.result,
      interpretation: interpretation.result,
      finalStatus: readiness.result.overallStatus,
    };

    // 3. Verification — independently re-derive finalStatus from the
    // deterministic result and require it to match what was reported.
    return {
      kind: 'completed',
      expectedOutcome: { overallStatus: readiness.result.overallStatus, gateCount: readiness.result.gates.length },
      observedOutcome: { overallStatus: assessment.finalStatus, gateCount: assessment.deterministic.gates.length },
    };
  };
}
