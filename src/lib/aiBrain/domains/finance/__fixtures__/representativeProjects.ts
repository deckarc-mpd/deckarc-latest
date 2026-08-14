// Representative Finance scenarios for the Phase 8 exit gate ("domain
// exceptions match human review, with no unauthorized consequential
// action"), same role as Compliance's representativeProjects.ts.

import type { ReadinessPaymentMilestone, ReadinessVendorBill, ReadinessCostEntry, ReadinessChangeOrder, FinanceOverallStatus } from '../types.ts';

const TODAY = '2026-08-13';

export interface RepresentativeFinanceProject {
  projectId: string;
  projectName: string;
  asOfDate: string;
  contractAmount: number | null;
  milestones: ReadinessPaymentMilestone[];
  vendorBills: ReadinessVendorBill[];
  costEntries: ReadinessCostEntry[];
  changeOrders: ReadinessChangeOrder[];
  expected: { overallStatus: FinanceOverallStatus; aiShouldBeInvoked: boolean };
}

export const REPRESENTATIVE_FINANCE_PROJECTS: RepresentativeFinanceProject[] = [
  {
    projectId: 'proj-bennett', projectName: 'Bennett Sunroom Addition', asOfDate: TODAY, contractAmount: 180000,
    milestones: [{ id: 'bennett-m1', project_id: 'proj-bennett', milestone_name: 'Final Draw', amount: 20000, due_date: '2026-09-01', status: 'Not Due' }],
    vendorBills: [], costEntries: [{ id: 'bennett-c1', project_id: 'proj-bennett', category: 'Material', amount: 90000, source: 'material' }], changeOrders: [],
    expected: { overallStatus: 'ready', aiShouldBeInvoked: false },
  },
  {
    projectId: 'proj-castillo', projectName: 'Castillo Kitchen Remodel', asOfDate: TODAY, contractAmount: 150000,
    milestones: [{ id: 'castillo-m1', project_id: 'proj-castillo', milestone_name: 'Rough-In Draw', amount: 30000, due_date: '2026-06-01', status: 'Overdue' }],
    vendorBills: [], costEntries: [{ id: 'castillo-c1', project_id: 'proj-castillo', category: 'Labor', amount: 40000, source: 'labor' }], changeOrders: [],
    expected: { overallStatus: 'at_risk', aiShouldBeInvoked: false },
  },
  {
    projectId: 'proj-doyle', projectName: 'Doyle Primary Suite Remodel', asOfDate: TODAY, contractAmount: 120000,
    milestones: [], vendorBills: [{ id: 'doyle-b1', project_id: 'proj-doyle', vendor_name: 'Summit Tile', due_date: '2026-10-15', amount: 8000, status: 'Disputed', dispute_notes: 'Vendor billed for tile not yet delivered to site' }],
    costEntries: [{ id: 'doyle-c1', project_id: 'proj-doyle', category: 'Material', amount: 30000, source: 'material' }], changeOrders: [],
    expected: { overallStatus: 'at_risk', aiShouldBeInvoked: true },
  },
  {
    projectId: 'proj-ellison', projectName: 'Ellison Whole-Home Renovation', asOfDate: TODAY, contractAmount: 300000,
    milestones: [], vendorBills: [], costEntries: [{ id: 'ellison-c1', project_id: 'proj-ellison', category: 'Labor', amount: 270000, source: 'labor' }], changeOrders: [],
    expected: { overallStatus: 'blocked', aiShouldBeInvoked: false },
  },
  {
    projectId: 'proj-farley', projectName: 'Farley Detached Garage Build', asOfDate: TODAY, contractAmount: 90000,
    milestones: [{ id: 'farley-m1', project_id: 'proj-farley', milestone_name: 'Foundation Draw', amount: 25000, due_date: '2026-06-10', status: 'Overdue' }],
    vendorBills: [{ id: 'farley-b1', project_id: 'proj-farley', vendor_name: 'Rapid Concrete', due_date: '2026-06-15', amount: 30000, status: 'Unpaid', dispute_notes: '' }],
    costEntries: [{ id: 'farley-c1', project_id: 'proj-farley', category: 'Material', amount: 40000, source: 'material' }], changeOrders: [],
    expected: { overallStatus: 'blocked', aiShouldBeInvoked: true }, // 3 simultaneous gate failures (collections, ap, cash_forecast) crosses the multi-gate synthesis threshold even with no free text.
  },
];
