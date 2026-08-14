// Finance domain types — Phase 8. Frozen §5: Finance is NOT a standalone
// agent; these are deterministic services owned by chief_of_staff (see
// the Phase 8 migration's header for the ownership rationale). Row shapes
// narrowed to real columns: payment_milestones (AR), the new vendor_bills
// (AP) and project_cost_entries (cost tracking) tables, and
// projects.contract_amount (margin).

export interface ReadinessPaymentMilestone {
  id: string;
  project_id: string;
  milestone_name: string;
  amount: number;
  due_date: string | null;
  status: string;
}

export interface ReadinessVendorBill {
  id: string;
  project_id: string;
  vendor_name: string;
  due_date: string | null;
  amount: number;
  status: string; // 'Unpaid' | 'Paid' | 'Disputed'
  dispute_notes: string;
}

export interface ReadinessCostEntry {
  id: string;
  project_id: string;
  category: string;
  amount: number;
  source: string; // 'material' | 'labor' | 'change_order' | 'other'
}

export interface ReadinessChangeOrder {
  id: string;
  project_id: string;
  cost_impact: number;
  approval_status: string; // 'Draft' | 'Approved' | 'Rejected' | ...
}

export type AgingBucket = 'current' | 'overdue_1_30' | 'overdue_31_60' | 'overdue_61_plus';

export interface CollectionsFinding {
  milestoneId: string;
  milestoneName: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface ApFinding {
  billId: string;
  vendorName: string;
  amount: number;
  dueDate: string | null;
  reason: 'overdue' | 'disputed';
}

export interface BillingFinding {
  milestoneId: string;
  milestoneName: string;
  amount: number;
  dueDate: string;
}

export interface MarginResult {
  projectId: string;
  contractAmount: number | null;
  approvedChangeOrderValue: number;
  totalRevenue: number | null;
  totalCost: number;
  margin: number | null;
  marginPercent: number | null;
}

export interface CashForecastResult {
  asOfDate: string;
  horizonDays: number;
  expectedInflows: number;
  expectedOutflows: number;
  netProjectedCash: number;
}

export type FinanceGateName = 'billing' | 'collections' | 'ap' | 'margin' | 'cash_forecast';
export type GateStatus = 'ready' | 'not_ready';

export interface FinanceGateResult {
  gate: FinanceGateName;
  status: GateStatus;
  findings: string[];
}

export type FinanceOverallStatus = 'ready' | 'at_risk' | 'blocked';

export interface DeterministicFinanceResult {
  projectId: string;
  asOfDate: string;
  gates: FinanceGateResult[];
  overallStatus: FinanceOverallStatus;
  margin: MarginResult;
  cashForecast: CashForecastResult;
}

export type FinanceFindingCategory = 'billing_dispute' | 'collections_response' | 'ap_dispute' | 'other' | 'none';
export type FinanceFindingSeverity = 'low' | 'medium' | 'high';

export interface FinanceInterpretation {
  invoked: boolean;
  category: FinanceFindingCategory;
  severity: FinanceFindingSeverity;
  explanation: string;
  sourceText: string[];
}
