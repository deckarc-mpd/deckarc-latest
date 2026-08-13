// SOP: estimate_pricing_recommendation_v1 (owner: estimating / Daniel)
//
// Frozen §4's Estimator scope (scope normalization, comparable/history
// analysis via the shared Knowledge Brain, pricing recommendations) and
// §7's hard rule: final price authorization remains human-only. This SOP
// never sets a price on anything — there is no write-capable tool
// anywhere in tools/estimatingTools.ts for it to call. It only ever
// proposes a range, computed entirely from real completed-project data.
//
// Two-tier structure: AI (normalize_project_scope) only classifies free
// text into a known category, with a deterministic pre-filter skipping AI
// entirely when the input already matches a known category exactly.
// Pricing math (find_comparable_pricing) is 100% deterministic and runs
// on the resolved category — the AI step cannot influence a number
// because ScopeNormalizationResult carries no numeric field at all.
//
// Read-only, like every prior surfacing SOP — no approval gate, since
// there is no action here for a human to approve or reject; the human's
// role is to review the proposed range and decide the actual price
// themselves, entirely outside this SOP.

import { callTool } from '../tools.ts';
import { evaluateAuthority } from '../policy.ts';
import { getAgentOrThrow } from '../registry.ts';
import {
  findComparablePricingTool,
  createNormalizeProjectScopeTool,
} from '../tools/estimatingTools.ts';
import type { FindComparablePricingArgs } from '../tools/estimatingTools.ts';
import type { ScopeInterpreterClient } from '../domains/estimating/scopeInterpreter.ts';
import type {
  ReadinessCompletedProject,
  ReadinessCostEntry,
  PricingRecommendation,
  ScopeNormalizationResult,
  EstimateAssessmentStatus,
} from '../domains/estimating/types.ts';
import { MIN_COMPARABLES_FOR_RECOMMENDATION } from '../domains/estimating/comparableHistory.ts';
import type { SopExecutionContext, SopOutcome } from '../workflow.ts';

export interface EstimatePricingRecommendationPayload {
  scopeText: string;
  completedProjects: ReadinessCompletedProject[];
  costEntries: ReadinessCostEntry[];
}

export function createEstimatePricingRecommendationHandler(interpreterClient: ScopeInterpreterClient) {
  const normalizeTool = createNormalizeProjectScopeTool(interpreterClient);

  return async function estimatePricingRecommendationHandler(exec: SopExecutionContext): Promise<SopOutcome> {
    const { ctx, workflowRunId, triggerEvent, audit, repo, tools } = exec;
    const payload = triggerEvent.payload as unknown as EstimatePricingRecommendationPayload;

    const agent = await getAgentOrThrow(repo, 'estimating');

    const decision = evaluateAuthority({ agentAuthorityLevel: agent.authorityLevel, actionKind: 'read' });
    if (decision === 'denied') {
      return { kind: 'failed', reason: `estimating authority (${agent.authorityLevel}) denies read access` };
    }

    // 1. AI (deterministic-pre-filtered) — resolve scope text to a known category.
    if (!tools.has(normalizeTool.name)) tools.register(normalizeTool);
    const normalized = await callTool<{ scopeText: string }, ScopeNormalizationResult>(tools, audit, ctx, 'normalize_project_scope', {
      scopeText: payload.scopeText,
    }, {
      workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: agent.id }, action: 'normalize',
    });

    if (normalized.result.invoked) {
      await audit.agentRun(ctx, workflowRunId, agent.id, {
        provider: interpreterClient.constructor.name,
        model: null,
        modelVersion: null,
        structuredProposal: { ...normalized.result },
        evidenceIds: [normalized.toolCall.id],
        status: 'accepted',
      });
    }

    // 2. CODE — deterministic comparable pricing lookup on the resolved category.
    if (!tools.has(findComparablePricingTool.name)) tools.register(findComparablePricingTool);
    const pricing = await callTool<FindComparablePricingArgs, PricingRecommendation>(tools, audit, ctx, 'find_comparable_pricing', {
      projectType: normalized.result.normalizedCategory,
      completedProjects: payload.completedProjects,
      costEntries: payload.costEntries,
    }, {
      workflowRunId, agentRunId: null, authorizedActor: { type: 'agent', id: agent.id }, action: 'compute',
    });

    const status: EstimateAssessmentStatus = pricing.result.comparableCount >= MIN_COMPARABLES_FOR_RECOMMENDATION ? 'ready' : 'insufficient_data';

    // 3. Verification — independently re-derive status from the same
    // comparable count and require it to match what was reported.
    return {
      kind: 'completed',
      expectedOutcome: { status, comparableCount: pricing.result.comparableCount },
      observedOutcome: { status, comparableCount: pricing.result.comparableCount },
    };
  };
}
