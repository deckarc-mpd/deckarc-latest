// Sales Pipeline Hygiene deterministic rules (CODE tier, Frozen §4/§11).
// A lead is "stale" purely from elapsed time since created_at plus its
// current status — no LLM judgment involved in deciding staleness itself.

import type { ReadinessLead, StaleLeadFinding } from './types.ts';

/** Days without contact before a lead in each open status counts as stale. Terminal statuses never go stale. */
export const STALE_DAYS_BY_STATUS: Record<string, number> = {
  new: 3,
  contacted: 7,
};

function daysSince(createdAt: string, asOfDate: string): number {
  const created = new Date(createdAt).getTime();
  const asOf = new Date(`${asOfDate}T23:59:59Z`).getTime();
  return Math.floor((asOf - created) / 86400000);
}

export function identifyStaleLeads(asOfDate: string, leads: ReadinessLead[]): StaleLeadFinding[] {
  const findings: StaleLeadFinding[] = [];
  for (const lead of leads) {
    const threshold = STALE_DAYS_BY_STATUS[lead.status];
    if (threshold === undefined) continue; // qualified/declined are terminal — never stale.
    const daysSinceCreated = daysSince(lead.created_at, asOfDate);
    if (daysSinceCreated >= threshold) {
      findings.push({ leadId: lead.id, fullName: lead.full_name, companyName: lead.company_name, status: lead.status, daysSinceCreated });
    }
  }
  return findings;
}
