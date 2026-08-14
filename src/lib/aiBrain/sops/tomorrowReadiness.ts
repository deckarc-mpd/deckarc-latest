// SOP: tomorrow_readiness_v1 (owner: project_operations / Marcus)
//
// Frozen §11's "Tomorrow Readiness" scheduled routine, and the Phase 2
// vertical slice covering all five requested areas at once: field progress
// updates, schedule/dependency readiness, subcontractor coordination,
// materials tracking, rolled into one Tomorrow Readiness assessment.
//
// Authority: this SOP only ever READS — it never writes a CP360 table. Per
// the Permission Matrix, any granted level (L1+) may read, so
// project_operations' L2 ceiling clears this without an approval gate. That
// is also exactly what "L1-L3, human-reviewed, not autonomous" (Phase 2
// exit gate) requires: the SOP produces an audited, queryable assessment
// for a human to act on — it never itself acts on the physical project
// (no task/crew/material row changes, no notification, no action item).
// Surfacing this assessment in a UI (Action Center) is Phase 4 scope; this
// SOP's job ends at "accurate and auditable."
//
// The critical safety property this handler enforces, not just documents:
// AI (the interpret_field_update tool) can explain WHY a gate failed but
// can never change WHETHER it failed. That is checked twice — structurally
// (RiskInterpretation has no status field to override with) and
// behaviorally (the verification step below independently re-derives the
// final status from the deterministic result and fails the workflow run if
// it ever diverges from what readinessGates.ts computed).

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  computeTomorrowReadinessTool,
  createInterpretFieldUpdateTool,
  type ComputeReadinessArgs,
} from '../tools/projectOpsTools.ts';
import type { RiskInterpreterClient, RiskInterpretInput } from '../domains/projectOps/aiInterpreter.ts';
import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
  DeterministicReadinessResult,
  RiskInterpretation,
  ProjectReadinessAssessment,
} from '../domains/projectOps/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface TomorrowReadinessPayload {
  projectId: string;
  asOfDate: string;
  tasks: ReadinessTask[];
  crewConfirmations: ReadinessCrewConfirmation[];
  materials: ReadinessMaterial[];
  dailyUpdates: ReadinessDailyUpdate[];
}

/**
 * Builds the SOP handler bound to a specific interpreter client, so tests
 * can inject DeterministicRiskInterpreter and a real deployment can inject
 * GeminiRiskInterpreter without this file (or the workflow engine) knowing
 * or caring which one it's talking to.
 */
export function createTomorrowReadinessHandler(interpreterClient: RiskInterpreterClient) {
  const interpretTool = createInterpretFieldUpdateTool(interpreterClient);

  return async function tomorrowReadinessHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as TomorrowReadinessPayload;

    const agent = await getAgentOrThrow(repo, 'project_operations');

    // This SOP only reads. Confirm authority explicitly rather than assuming
    // it — an L0-configured agent (misconfiguration, or a future disabled
    // state) must still be denied here, not silently allowed through.
    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `project_operations authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. CODE — deterministic readiness gates. Registering this tool call
    // isn't optional bookkeeping: it's the durable record of exactly what
    // the deterministic verdict was, independent of anything AI adds next.
    if (!tools.has(computeTomorrowReadinessTool.name)) tools.register(computeTomorrowReadinessTool);
    const readiness = await callTool<ComputeReadinessArgs, DeterministicReadinessResult>(tools, audit, ctx, 'compute_tomorrow_readiness', {
      projectId: payload.projectId,
      asOfDate: payload.asOfDate,
      tasks: payload.tasks,
      crewConfirmations: payload.crewConfirmations,
      materials: payload.materials,
      dailyUpdates: payload.dailyUpdates,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'compute',
    });

    // 2. AI — only for ambiguous free text or multi-gate synthesis, and only
    // if the deterministic pre-filter says there's something worth
    // explaining. Most projects, most days, this never fires — zero AI
    // calls, per Frozen §11.
    const freeText = payload.dailyUpdates.flatMap((u) => [u.blockers, u.materials_pending, u.weather_issue]);
    if (!tools.has(interpretTool.name)) tools.register(interpretTool);
    const interpretation = await callTool<RiskInterpretInput, RiskInterpretation>(tools, audit, ctx, 'interpret_field_update', {
      deterministic: readiness.result,
      freeText,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'interpret',
    });

    // Only log an Agent Run when a model actually ran — an untouched
    // ai_agent_runs table for this workflow run IS the audit trail proving
    // no AI was used, which is itself worth being able to see later.
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

    const assessment: ProjectReadinessAssessment = {
      deterministic: readiness.result,
      interpretation: interpretation.result,
      finalStatus: readiness.result.overallStatus, // never derived from interpretation — see file header.
    };

    // 3. Verification — independently re-derive the final status from the
    // deterministic result and require it to match what was actually
    // reported. This isn't a formality: if a future change accidentally let
    // the AI step influence finalStatus, this comparison would fail and the
    // workflow run would be marked `failed`, not silently `completed`.
    return {
      kind: 'completed',
      expectedOutcome: { overallStatus: readiness.result.overallStatus, gateCount: readiness.result.gates.length },
      observedOutcome: { overallStatus: assessment.finalStatus, gateCount: assessment.deterministic.gates.length },
    };
  };
}
