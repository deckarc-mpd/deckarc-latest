// Controlled Tools for the Project Ops (Marcus) agent — Phases 2 and 3.
//
// Every tool here is read-only: they compute or explain, they never write
// to a CP360 table. None need a dry-run mode (there's no side effect to
// preview), so all declare `supportsDryRun: false` and the SOPs never pass
// `dryRun: true` when calling them — dry-run only exists for tools with
// real side effects, like cascadeDelayTool.ts from Phase 1.
//
// Escalating to a human (Phase 3) is NOT a fourth tool here — creating the
// ai_approvals record is done via `audit.approval()` directly in the SOP
// handler (sops/tradeMaterialCoordination.ts), exactly like Phase 1's
// task_delay_cascade_v1 already does for its own approval gate. That's the
// established, working pattern for "put something in front of a human"
// (Phase 1's audit system), and this phase reuses it rather than inventing
// a parallel one — a Controlled Tool wrapper would need direct access to
// `audit`/`workflowRunId`, which breaks the pure (args) -> result contract
// every other tool in this file follows.

import type { ToolDefinition } from '../tools.ts';
import { assessTomorrowReadiness } from '../domains/projectOps/readinessGates.ts';
import { assessTradeMaterialCoordination } from '../domains/projectOps/tradeMaterialCoordination.ts';
import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
  DeterministicReadinessResult,
  RiskInterpretation,
  TradeMaterialCoordinationResult,
} from '../domains/projectOps/types.ts';
import type { RiskInterpreterClient, RiskInterpretInput } from '../domains/projectOps/aiInterpreter.ts';

// ─── compute_tomorrow_readiness (CODE tier) ─────────────────────────────────

export interface ComputeReadinessArgs {
  projectId: string;
  asOfDate: string;
  tasks: ReadinessTask[];
  crewConfirmations: ReadinessCrewConfirmation[];
  materials: ReadinessMaterial[];
  dailyUpdates: ReadinessDailyUpdate[];
}

export const computeTomorrowReadinessTool: ToolDefinition<ComputeReadinessArgs, DeterministicReadinessResult> = {
  name: 'compute_tomorrow_readiness',
  description:
    'Deterministically evaluates field-progress, dependency, subcontractor, and materials readiness gates for a project for a given date. Pure CODE tier — never calls a model.',
  supportsDryRun: false,
  async execute(args) {
    return assessTomorrowReadiness(
      args.projectId,
      args.asOfDate,
      args.tasks,
      args.crewConfirmations,
      args.materials,
      args.dailyUpdates
    );
  },
};

// ─── interpret_field_update (AI tier) ───────────────────────────────────────

/**
 * A factory rather than a fixed export, because which RiskInterpreterClient
 * backs it (deterministic test double vs. real Gemini client) is a
 * deployment/test decision, not something the tool itself should hardcode —
 * mirrors how VoiceAssistant/AskCP360 in the existing app each hardcode
 * their own model choice, which Phase 0 Discovery flagged as duplication;
 * this tool is built so that mistake isn't repeated here.
 */
export function createInterpretFieldUpdateTool(
  client: RiskInterpreterClient
): ToolDefinition<RiskInterpretInput, RiskInterpretation> {
  return {
    name: 'interpret_field_update',
    description:
      'Interprets ambiguous free-text field reports (blockers, weather issues, material notes) and/or synthesizes an explanation across multiple simultaneous readiness-gate failures. Never returns or influences a readiness verdict — see docs/ai-brain/CP360_AI_GAP_ANALYSIS.md and RiskInterpretation\'s type contract.',
    supportsDryRun: false,
    async execute(args) {
      return client.interpret(args);
    },
  };
}

// ─── assess_trade_material_coordination (CODE tier, Phase 3) ───────────────

export interface AssessTradeMaterialArgs {
  projectId: string;
  asOfDate: string;
  tasks: ReadinessTask[];
  crewConfirmations: ReadinessCrewConfirmation[];
  materials: ReadinessMaterial[];
}

export const assessTradeMaterialCoordinationTool: ToolDefinition<
  AssessTradeMaterialArgs,
  TradeMaterialCoordinationResult
> = {
  name: 'assess_trade_material_coordination',
  description:
    "Deterministically checks which crews are unconfirmed past the trade confirmation cutoff and which not-yet-started tasks' materials threaten their own or a downstream dependent task's schedule. Also deterministically decides whether either finding is escalation-worthy. Pure CODE tier — never calls a model.",
  supportsDryRun: false,
  async execute(args) {
    return assessTradeMaterialCoordination(
      args.projectId,
      args.asOfDate,
      args.tasks,
      args.crewConfirmations,
      args.materials
    );
  },
};
