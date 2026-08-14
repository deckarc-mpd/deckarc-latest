// Representative Sales scenarios for the Phase 9 exit gate ("domain
// exceptions match human review, with no unauthorized consequential
// action").

import type { ReadinessLead } from '../types.ts';

const TODAY = '2026-08-13';

export interface RepresentativeLeadScenario {
  name: string;
  leads: ReadinessLead[];
  expected: { staleCount: number };
}

export const REPRESENTATIVE_LEAD_SCENARIOS: RepresentativeLeadScenario[] = [
  {
    name: 'A brand-new lead within the grace period is never stale',
    leads: [{ id: 'l1', full_name: 'Priya Nair', company_name: 'Nair Homes', status: 'new', created_at: '2026-08-12T00:00:00Z' }],
    expected: { staleCount: 0 },
  },
  {
    name: 'A "new" lead sitting untouched for 5 days is stale',
    leads: [{ id: 'l2', full_name: 'Marcus Webb', company_name: 'Webb Construction', status: 'new', created_at: '2026-08-08T00:00:00Z' }],
    expected: { staleCount: 1 },
  },
  {
    name: 'A "contacted" lead within its 7-day grace period is not yet stale',
    leads: [{ id: 'l3', full_name: 'Dana Osei', company_name: 'Osei Builders', status: 'contacted', created_at: '2026-08-08T00:00:00Z' }],
    expected: { staleCount: 0 },
  },
  {
    name: 'A qualified lead is never stale, even if very old',
    leads: [{ id: 'l4', full_name: 'Ravi Patel', company_name: 'Patel Renovations', status: 'qualified', created_at: '2026-01-01T00:00:00Z' }],
    expected: { staleCount: 0 },
  },
  {
    name: 'A mixed batch: only the genuinely stale lead is flagged',
    leads: [
      { id: 'l5', full_name: 'Chen Yu', company_name: 'Yu Design Build', status: 'new', created_at: '2026-08-01T00:00:00Z' },
      { id: 'l6', full_name: 'Sofia Reyes', company_name: 'Reyes Homes', status: 'declined', created_at: '2026-08-01T00:00:00Z' },
    ],
    expected: { staleCount: 1 },
  },
];

export const REPRESENTATIVE_LEADS_ASOF = TODAY;
