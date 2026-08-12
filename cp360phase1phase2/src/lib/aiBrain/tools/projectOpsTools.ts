// Controlled Tools for the Project Ops (Marcus) agent — Phase 2.
//
// Both tools here are read-only: they compute or explain, they never write
// to a CP360 table. Neither needs a dry-run mode (there's no side effect to
// preview), so both declare `supportsDryRun: false` and the SOP never
// passes `dryRun: true` when calling them — dry-run only exists for tools
// with real side effects, like cascadeDelayTool.ts from Phase 1.

import type { ToolDefinition } from '../tools.ts';
import { assessTomorrowReadiness } from '../domains/projectOps/readinessGates.ts';
import type {
  ReadinessTask,
  ReadinessCrewConfirmation,
  ReadinessMaterial,
  ReadinessDailyUpdate,
  DeterministicReadinessResult,
  RiskInterpretation,
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
