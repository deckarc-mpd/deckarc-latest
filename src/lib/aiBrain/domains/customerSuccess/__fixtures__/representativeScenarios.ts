// Representative Customer Success scenarios for the Phase 5 exit gate
// ("client updates use verified facts and have a low human edit rate") —
// same role as Phase 2/3's representativeProjects.ts fixtures.

import type { ReadinessDecision, ReadinessDelayReason } from '../types.ts';

export interface RepresentativeScenario {
  name: string;
  projectId: string;
  asOfDate: string;
  decisions: ReadinessDecision[];
  delayReasons: ReadinessDelayReason[];
  expected: { candidateCount: number };
}

export const REPRESENTATIVE_SCENARIOS: RepresentativeScenario[] = [
  {
    name: 'Vasquez Primary Suite — open selection needs a decision',
    projectId: 'proj-vasquez',
    asOfDate: '2026-08-13',
    decisions: [
      { id: 'vasquez-d1', project_id: 'proj-vasquez', decision_title: 'Shower glass style', needed_by_date: '2026-08-19', status: 'Needed' },
    ],
    delayReasons: [],
    expected: { candidateCount: 1 },
  },
  {
    name: 'Okafor Sunroom Addition — client-visible weather delay',
    projectId: 'proj-okafor',
    asOfDate: '2026-08-13',
    decisions: [],
    delayReasons: [
      { id: 'okafor-r1', project_id: 'proj-okafor', delay_category: 'Weather', client_safe_reason: 'Heavy rain this week delayed the foundation pour', revised_projected_completion: '2026-08-22', client_visible: true },
    ],
    expected: { candidateCount: 1 },
  },
  {
    name: 'Bianchi Garage Conversion — a decision and a delay together',
    projectId: 'proj-bianchi',
    asOfDate: '2026-08-13',
    decisions: [
      { id: 'bianchi-d1', project_id: 'proj-bianchi', decision_title: 'Flooring material', needed_by_date: null, status: 'Needs Decision' },
    ],
    delayReasons: [
      { id: 'bianchi-r1', project_id: 'proj-bianchi', delay_category: 'Material Delay', client_safe_reason: 'The ordered flooring is on backorder from the supplier', revised_projected_completion: null, client_visible: true },
    ],
    expected: { candidateCount: 2 },
  },
  {
    name: 'Reyes Kitchen Remodel — everything already resolved, nothing to draft',
    projectId: 'proj-reyes',
    asOfDate: '2026-08-13',
    decisions: [
      { id: 'reyes-d1', project_id: 'proj-reyes', decision_title: 'Cabinet hardware', needed_by_date: '2026-08-01', status: 'Approved' },
    ],
    delayReasons: [
      { id: 'reyes-r1', project_id: 'proj-reyes', delay_category: 'Labor', client_safe_reason: 'A short crew delay was resolved the same day', revised_projected_completion: null, client_visible: false },
    ],
    expected: { candidateCount: 0 },
  },
  {
    name: 'Holt Deck & Patio — internal-only delay note must never surface',
    projectId: 'proj-holt',
    asOfDate: '2026-08-13',
    decisions: [],
    delayReasons: [
      { id: 'holt-r1', project_id: 'proj-holt', delay_category: 'Other', client_safe_reason: '', revised_projected_completion: '2026-08-25', client_visible: true },
    ],
    expected: { candidateCount: 0 },
  },
];
