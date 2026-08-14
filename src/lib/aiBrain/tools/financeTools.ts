// Controlled Tools for the Frozen §5 Finance services (owned by
// chief_of_staff — Finance is not a standalone agent this phase). Both
// read-only: neither writes to a CP360 table, neither moves money, and
// neither needs a dry-run mode.

import type { ToolDefinition } from '../tools.ts';
import { assessFinanceReadiness } from '../domains/finance/financeAssessment.ts';
import type {
  ReadinessPaymentMilestone,
  ReadinessVendorBill,
  ReadinessCostEntry,
  ReadinessChangeOrder,
  DeterministicFinanceResult,
  FinanceInterpretation,
} from '../domains/finance/types.ts';
import type { FinanceInterpreterClient, FinanceInterpretInput } from '../domains/finance/aiInterpreter.ts';

// ─── compute_finance_assessment (CODE tier) ─────────────────────────────────

export interface ComputeFinanceAssessmentArgs {
  projectId: string;
  asOfDate: string;
  contractAmount: number | null;
  milestones: ReadinessPaymentMilestone[];
  vendorBills: ReadinessVendorBill[];
  costEntries: ReadinessCostEntry[];
  changeOrders: ReadinessChangeOrder[];
}

export const computeFinanceAssessmentTool: ToolDefinition<ComputeFinanceAssessmentArgs, DeterministicFinanceResult> = {
  name: 'compute_finance_assessment',
  description:
    'Deterministically evaluates billing readiness, AR collections aging, AP status, project margin, and cash forecast for a project. Pure CODE tier — never calls a model, never moves money.',
  supportsDryRun: false,
  async execute(args) {
    return assessFinanceReadiness(args.projectId, args.asOfDate, args.contractAmount, args.milestones, args.vendorBills, args.costEntries, args.changeOrders);
  },
};

// ─── interpret_finance_finding (AI tier) ────────────────────────────────────

export function createInterpretFinanceFindingTool(
  client: FinanceInterpreterClient
): ToolDefinition<FinanceInterpretInput, FinanceInterpretation> {
  return {
    name: 'interpret_finance_finding',
    description:
      'Interprets ambiguous invoice/client/vendor dispute text and/or synthesizes an explanation across multiple simultaneous financial gate failures. Never influences billing math, due dates, margin, or cash figures.',
    supportsDryRun: false,
    async execute(args) {
      return client.interpret(args);
    },
  };
}
