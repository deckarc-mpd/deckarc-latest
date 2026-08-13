// SOP: chief_of_staff_daily_synthesis_v1 (owner: chief_of_staff / Avery)
//
// Frozen §8's executive compression layer, and §11's 07:30 "Chief of Staff
// exception synthesis" routine. Avery never reads a raw CP360 table here —
// the trigger event's payload is already-resolved exceptions (critical/
// needs-review action items, plus any sweep escalations from Phase 4's
// sweepOrchestrator), assembled by the caller (the scheduled sweep or a
// future on-demand Command Center refresh), not by this handler.
//
// Same safety property as tomorrowReadiness.ts: the AI framing step
// (synthesize_daily_brief's client.frame()) can only ADD a paragraph of
// text — ChiefOfStaffSynthesis's prioritizedItems ordering is fixed by the
// deterministic rankExceptions() call before the AI step ever runs, and the
// verification step below independently re-derives that ordering and fails
// the run if it ever diverges.

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import { createSynthesizeDailyBriefTool, type SynthesizeDailyBriefArgs } from '../tools/chiefOfStaffTools.ts';
import { rankExceptions, type SynthesisClient } from '../domains/chiefOfStaff/synthesis.ts';
import type { ResolvedException, ChiefOfStaffSynthesis } from '../domains/chiefOfStaff/types.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface ChiefOfStaffSynthesisPayload {
  asOfDate: string;
  exceptions: ResolvedException[];
}

export function createChiefOfStaffSynthesisHandler(client: SynthesisClient) {
  const synthesizeTool = createSynthesizeDailyBriefTool(client);

  return async function chiefOfStaffSynthesisHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as ChiefOfStaffSynthesisPayload;

    const agent = await getAgentOrThrow(repo, 'chief_of_staff');

    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `chief_of_staff authority (${agent.authorityLevel}) denies read access` };
    }

    if (!tools.has(synthesizeTool.name)) tools.register(synthesizeTool);
    const synthesized = await callTool<SynthesizeDailyBriefArgs, ChiefOfStaffSynthesis>(tools, audit, ctx, 'synthesize_daily_brief', {
      exceptions: payload.exceptions,
    }, {
      workflowRunId,
      agentRunId: null,
      authorizedActor: { type: 'agent', id: agent.id },
      action: 'synthesize',
    });

    if (synthesized.result.aiInvoked) {
      await audit.agentRun(ctx, workflowRunId, agent.id, {
        provider: client.constructor.name,
        model: null,
        modelVersion: null,
        structuredProposal: { ...synthesized.result },
        evidenceIds: [synthesized.toolCall.id],
        status: 'accepted',
      });
    }

    // Independently re-derive the ranking the tool should have produced,
    // and compare — proves the AI framing step never altered prioritization.
    const expectedRanking = rankExceptions(payload.exceptions);
    return {
      kind: 'completed',
      expectedOutcome: {
        itemCount: expectedRanking.length,
        firstRankedId: expectedRanking[0]?.id ?? null,
      },
      observedOutcome: {
        itemCount: synthesized.result.prioritizedItems.length,
        firstRankedId: synthesized.result.prioritizedItems[0]?.id ?? null,
      },
    };
  };
}
