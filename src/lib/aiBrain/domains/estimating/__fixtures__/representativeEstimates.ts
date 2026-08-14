// Representative Estimator scenarios for the Phase 9 exit gate ("domain
// exceptions match human review, with no unauthorized consequential
// action").

import type { ReadinessCompletedProject, ReadinessCostEntry, EstimateAssessmentStatus } from '../types.ts';

export interface RepresentativeEstimateScenario {
  name: string;
  scopeText: string;
  completedProjects: ReadinessCompletedProject[];
  costEntries: ReadinessCostEntry[];
  expected: { status: EstimateAssessmentStatus; comparableCount: number };
}

const COMPLETED_KITCHENS: ReadinessCompletedProject[] = [
  { id: 'k1', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 85000 },
  { id: 'k2', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 110000 },
  { id: 'k3', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 95000 },
];
const KITCHEN_COSTS: ReadinessCostEntry[] = [
  { id: 'c1', project_id: 'k1', category: 'Material', amount: 45000, source: 'material' },
  { id: 'c2', project_id: 'k2', category: 'Material', amount: 60000, source: 'material' },
  { id: 'c3', project_id: 'k3', category: 'Material', amount: 50000, source: 'material' },
];

export const REPRESENTATIVE_ESTIMATE_SCENARIOS: RepresentativeEstimateScenario[] = [
  {
    name: 'Exact known category with three real comparables',
    scopeText: 'Kitchen remodel',
    completedProjects: COMPLETED_KITCHENS, costEntries: KITCHEN_COSTS,
    expected: { status: 'ready', comparableCount: 3 },
  },
  {
    name: 'Ambiguous free text still resolves to the right category and comparables',
    scopeText: 'Client wants a full kitchen renovation with new cabinets and an island',
    completedProjects: COMPLETED_KITCHENS, costEntries: KITCHEN_COSTS,
    expected: { status: 'ready', comparableCount: 3 },
  },
  {
    name: 'A category with no completed history yields insufficient_data, not a guess',
    scopeText: 'New construction',
    completedProjects: COMPLETED_KITCHENS, costEntries: KITCHEN_COSTS,
    expected: { status: 'insufficient_data', comparableCount: 0 },
  },
  {
    name: 'Only one comparable is still insufficient (need at least two)',
    scopeText: 'Bathroom remodel',
    completedProjects: [{ id: 'b1', project_type: 'Bathroom remodel', status: 'Completed', contract_amount: 40000 }],
    costEntries: [{ id: 'c4', project_id: 'b1', category: 'Material', amount: 20000, source: 'material' }],
    expected: { status: 'insufficient_data', comparableCount: 1 },
  },
  {
    name: 'An in-progress project of the same type is never counted as a comparable',
    scopeText: 'Kitchen remodel',
    completedProjects: [
      { id: 'k4', project_type: 'Kitchen remodel', status: 'Completed', contract_amount: 90000 },
      { id: 'k5', project_type: 'Kitchen remodel', status: 'In Progress', contract_amount: 200000 },
    ],
    costEntries: [{ id: 'c5', project_id: 'k4', category: 'Material', amount: 50000, source: 'material' }],
    expected: { status: 'insufficient_data', comparableCount: 1 },
  },
];
