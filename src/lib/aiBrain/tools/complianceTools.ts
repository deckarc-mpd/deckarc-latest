// Controlled Tools for the Compliance (Clara) agent — Phase 7.
//
// Both read-only, same discipline as projectOpsTools.ts: neither writes to
// a CP360 table, so neither needs a dry-run mode.

import type { ToolDefinition } from '../tools.ts';
import { assessComplianceReadiness } from '../domains/compliance/readinessGates.ts';
import type {
  ReadinessPermit,
  ReadinessInspection,
  ReadinessComplianceDocument,
  DeterministicComplianceResult,
  ComplianceInterpretation,
} from '../domains/compliance/types.ts';
import type { ComplianceInterpreterClient, ComplianceInterpretInput } from '../domains/compliance/aiInterpreter.ts';

// ─── compute_compliance_readiness (CODE tier) ───────────────────────────────

export interface ComputeComplianceReadinessArgs {
  projectId: string;
  asOfDate: string;
  permits: ReadinessPermit[];
  inspections: ReadinessInspection[];
  documents: ReadinessComplianceDocument[];
}

export const computeComplianceReadinessTool: ToolDefinition<ComputeComplianceReadinessArgs, DeterministicComplianceResult> = {
  name: 'compute_compliance_readiness',
  description:
    'Deterministically evaluates permit status/expiry, inspection correction/reinspection tracking, and COI/license expiry for a project. Pure CODE tier — never calls a model.',
  supportsDryRun: false,
  async execute(args) {
    return assessComplianceReadiness(args.projectId, args.asOfDate, args.permits, args.inspections, args.documents);
  },
};

// ─── interpret_compliance_finding (AI tier) ─────────────────────────────────

export function createInterpretComplianceFindingTool(
  client: ComplianceInterpreterClient
): ToolDefinition<ComplianceInterpretInput, ComplianceInterpretation> {
  return {
    name: 'interpret_compliance_finding',
    description:
      'Interprets ambiguous compliance correction notes and/or synthesizes an explanation across multiple simultaneous gate failures. Never returns or influences a compliance verdict.',
    supportsDryRun: false,
    async execute(args) {
      return client.interpret(args);
    },
  };
}
