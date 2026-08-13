// CP360 AI Operations Brain — Agent & SOP Registry access layer.
//
// The registry's data lives in Postgres (ai_agents / ai_sops, seeded by
// supabase/migrations/20260812140000_create_ai_brain_foundation.sql) — that
// migration is the source of truth for what's actually deployed. This module
// provides:
//   1. FROZEN_AGENT_SEED — a TypeScript mirror of that same seed data, used
//      by tests (via MemoryRepository) and as a compile-time-checked
//      reference. It MUST be kept in sync with the migration's INSERT
//      statement by hand; a test below asserts its shape (ids, count,
//      authority ceiling) matches what the Identity spec and Permission
//      Matrix require, so drift on those specific facts is caught even
//      without a live DB to diff against.
//   2. Typed accessors (getAgentOrThrow/getSopOrThrow) that fail loudly
//      instead of letting a typo'd agent/SOP id silently no-op — every
//      caller in the workflow/tool/policy layers uses these, never a raw
//      repo.getAgent() with an unchecked null.
//
// Per the Identity spec: business logic must NEVER branch on displayName —
// only on `id`. Nothing in this file (or anything downstream that uses it)
// reads `displayName` for a decision; it exists on AgentDefinition purely
// for UI presentation.

import type { AiBrainRepository } from './repository.ts';
import type { AgentDefinition, AgentId, SopDefinition } from './types.ts';
import { FROZEN_AGENT_IDS } from './types.ts';

export const FROZEN_AGENT_SEED: AgentDefinition[] = [
  {
    id: 'chief_of_staff',
    displayName: 'Avery',
    officialTitle: 'AI Chief of Staff',
    businessDomain: 'Executive Operations',
    mission:
      'Executive intelligence, prioritization, exception compression, cross-functional awareness, and decision preparation.',
    responsibilities: [
      'Executive priorities',
      'Exception compression',
      'Decision preparation',
      'Morning/end-of-day synthesis',
    ],
    assignedSops: ['chief_of_staff_daily_synthesis_v1', 'billing_ar_margin_sweep_v1'],
    allowedTools: ['synthesize_daily_brief', 'compute_finance_assessment', 'interpret_finance_finding'],
    dataPermissions: ['exception_records', 'action_items'],
    authorityLevel: 'L1',
    escalationPolicy: 'Escalate unresolved critical items to company admin.',
    modelPolicy: 'cheapest-tier synthesis model',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'sales',
    displayName: 'Maya',
    officialTitle: 'AI Sales Manager',
    businessDomain: 'Revenue',
    mission: 'Lead intake, qualification, follow-up, pipeline management, and sales handoff.',
    responsibilities: ['Lead intake', 'Qualification', 'Follow-up', 'Pipeline progression'],
    assignedSops: ['sales_pipeline_hygiene_v1'],
    allowedTools: ['identify_stale_leads', 'draft_lead_followup'],
    dataPermissions: ['cp360_leads'],
    authorityLevel: 'L1',
    escalationPolicy: 'Escalate stalled/high-value leads to company admin.',
    modelPolicy: 'cheapest-tier classification model',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'estimating',
    displayName: 'Daniel',
    officialTitle: 'AI Estimating Manager',
    businessDomain: 'Estimating / Revenue',
    mission:
      'Scope interpretation, historical cost intelligence, estimating, pricing recommendations, assumptions, exclusions, and estimate analysis.',
    responsibilities: [
      'Scope normalization',
      'Estimate reasoning',
      'Comparable/history analysis',
      'Pricing recommendation',
    ],
    assignedSops: ['estimate_pricing_recommendation_v1'],
    allowedTools: ['normalize_project_scope', 'find_comparable_pricing'],
    dataPermissions: ['project_history', 'estimate_history'],
    authorityLevel: 'L1',
    escalationPolicy: 'Escalate final price authorization to company admin.',
    modelPolicy: 'mid-tier reasoning model',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'project_operations',
    displayName: 'Marcus',
    officialTitle: 'AI Project Operations Manager',
    businessDomain: 'Operations',
    mission:
      'Project execution, schedule readiness, subcontractor coordination, materials, field progress, dependencies, risks, delays, and tomorrow readiness.',
    responsibilities: ['Field updates', 'Dependencies', 'Trades', 'Materials', 'Risks', 'Tomorrow readiness'],
    assignedSops: ['task_delay_cascade_v1', 'tomorrow_readiness_v1', 'trade_material_coordination_v1'],
    allowedTools: [
      'cascade_delay',
      'compute_tomorrow_readiness',
      'interpret_field_update',
      'assess_trade_material_coordination',
    ],
    dataPermissions: ['tasks', 'daily_updates', 'materials', 'crew_confirmations', 'schedule_change_log'],
    authorityLevel: 'L2',
    escalationPolicy: 'Escalate consequential schedule commitments to company admin.',
    modelPolicy: 'cheapest-tier extraction model, mid-tier for synthesis',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'compliance',
    displayName: 'Clara',
    officialTitle: 'AI Compliance Manager',
    businessDomain: 'Compliance',
    mission: 'HOA, zoning, permits, inspections, corrections, COI/W-9, and regulatory/compliance documentation.',
    responsibilities: ['Permit tracking', 'Inspection sequencing', 'Corrections', 'Compliance documentation'],
    assignedSops: ['compliance_permit_inspection_sweep_v1'],
    allowedTools: ['compute_compliance_readiness', 'interpret_compliance_finding'],
    dataPermissions: ['permits', 'inspections', 'project_inspection_requirements'],
    authorityLevel: 'L1',
    escalationPolicy: 'Escalate rejected/failed compliance items to company admin.',
    modelPolicy: 'cheapest-tier extraction model',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'customer_success',
    displayName: 'Natalie',
    officialTitle: 'AI Customer Success Manager',
    businessDomain: 'Customer Success',
    mission: 'Verified client communication, decisions, selections, closeout, warranty/reviews.',
    responsibilities: ['Client communication', 'Decisions', 'Selections', 'Closeout', 'Warranty transition'],
    assignedSops: ['client_communication_draft_v1'],
    allowedTools: ['gather_verified_client_facts', 'draft_client_communication'],
    dataPermissions: ['client_decisions', 'communication_log'],
    authorityLevel: 'L1',
    escalationPolicy: 'All client-facing sends require company admin approval.',
    modelPolicy: 'mid-tier drafting model',
    costBudget: { monthlyUsd: 0, perCallUsd: 0 },
    status: 'active',
    version: '1.0.0',
  },
];

export const FROZEN_SOP_SEED: SopDefinition[] = [
  {
    id: 'task_delay_cascade_v1',
    version: '1.0.0',
    ownerAgentId: 'project_operations',
    title: 'Task Delay Cascade',
    description:
      "When a task is reported delayed, deterministically cascades the delay to dependent tasks (reusing scheduleEngine.cascadeDelayFromTask). Auto-executes when the cascade does not push the project's committed finish date; requires company-admin approval when it does.",
    triggerEventTypes: ['task.delay_reported'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'tomorrow_readiness_v1',
    version: '1.0.0',
    ownerAgentId: 'project_operations',
    title: 'Tomorrow Readiness',
    description:
      "Evaluates field-progress, dependency, subcontractor-coordination, and materials readiness gates deterministically for a project's next scheduled work day, using AI only to interpret ambiguous free-text field reports or synthesize an explanation across multiple simultaneous gate failures. Read-only — produces an audited assessment for human review, never an autonomous action.",
    triggerEventTypes: ['schedule.tomorrow_readiness_check'],
    executionMethod: 'CODE', // the SOP itself never requires AI to complete; AI is opportunistic within it.
    status: 'active',
  },
  {
    id: 'trade_material_coordination_v1',
    version: '1.0.0',
    ownerAgentId: 'project_operations',
    title: 'Trade & Material Coordination',
    description:
      'Deterministically checks which crews are unconfirmed past the trade confirmation cutoff and which materials threaten a not-yet-started task or its downstream dependents. Escalates to a human when either finding is real (no automated outreach exists yet — see ADR-CP360-AI-001) — never autonomous.',
    triggerEventTypes: ['schedule.trade_confirmation_cutoff'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'chief_of_staff_daily_synthesis_v1',
    version: '1.0.0',
    ownerAgentId: 'chief_of_staff',
    title: 'Chief of Staff Daily Synthesis',
    description:
      'Deterministically ranks resolved exceptions (critical/needs-review action items, sweep escalations) handed in by the caller — never reads a raw CP360 table itself. Adds AI decision framing only when the ranked list is non-empty. Output is prioritization and framing, never routing or resolution (Frozen §8).',
    triggerEventTypes: ['schedule.chief_of_staff_synthesis'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'client_communication_draft_v1',
    version: '1.0.0',
    ownerAgentId: 'customer_success',
    title: 'Client Communication Draft',
    description:
      'Deterministically finds open client_decisions and client-visible project_delay_reasons, then drafts client-facing message text from verified fact anchors only — never raw table access. A draft that omits or contradicts a verified fact fails the run outright. Every non-empty, fully-grounded batch requires company admin approval before use (Frozen §4) — this SOP never sends anything itself.',
    triggerEventTypes: ['schedule.client_communication_check'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'compliance_permit_inspection_sweep_v1',
    version: '1.0.0',
    ownerAgentId: 'compliance',
    title: 'Permit & Inspection Sweep',
    description:
      'Deterministically evaluates permit status/expiry, inspection correction/reinspection tracking, and COI/license expiry for a project, using AI only to interpret ambiguous correction notes or synthesize an explanation across multiple simultaneous gate failures. Read-only — produces an audited assessment for human review, never an autonomous action. General project scheduling stays with Project Ops.',
    triggerEventTypes: ['schedule.compliance_permit_inspection_sweep'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'billing_ar_margin_sweep_v1',
    version: '1.0.0',
    ownerAgentId: 'chief_of_staff',
    title: 'Billing / AR / Margin Sweep',
    description:
      'Deterministically evaluates billing readiness, AR collections aging, AP status, project margin, and cash forecast for a project, using AI only to interpret ambiguous invoice/client/vendor dispute text or synthesize an explanation across multiple simultaneous financial exceptions. Read-only -- never moves money, never creates an approval. Finance is not a standalone agent (Frozen §5); owned by chief_of_staff as a cross-functional executive concern.',
    triggerEventTypes: ['schedule.billing_ar_margin_sweep'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'sales_pipeline_hygiene_v1',
    version: '1.0.0',
    ownerAgentId: 'sales',
    title: 'Sales Pipeline Hygiene',
    description:
      'Deterministically identifies stale cp360_leads (no status progression within a threshold of days since creation), then drafts nuanced follow-up text for stale leads only. A draft that never names the lead fails the run outright. Every non-empty, fully-grounded batch requires company admin approval before use -- this SOP never sends anything itself.',
    triggerEventTypes: ['schedule.sales_pipeline_hygiene'],
    executionMethod: 'CODE',
    status: 'active',
  },
  {
    id: 'estimate_pricing_recommendation_v1',
    version: '1.0.0',
    ownerAgentId: 'estimating',
    title: 'Estimate Pricing Recommendation',
    description:
      'Normalizes free-text project scope into a known category (AI only when the text does not already match one exactly), then deterministically computes a pricing range from real completed-project comparables. Never sets or authorizes a price -- final price authorization remains human-only (Frozen §7). Fewer than two real comparables yields insufficient_data, never a fabricated range.',
    triggerEventTypes: ['schedule.estimate_pricing_recommendation'],
    executionMethod: 'CODE',
    status: 'active',
  },
];

export function seedMemoryRegistry(repo: {
  seedAgent(agent: AgentDefinition): void;
  seedSop(sop: SopDefinition): void;
}): void {
  for (const agent of FROZEN_AGENT_SEED) repo.seedAgent(agent);
  for (const sop of FROZEN_SOP_SEED) repo.seedSop(sop);
}

export async function getAgentOrThrow(repo: AiBrainRepository, id: AgentId): Promise<AgentDefinition> {
  const agent = await repo.getAgent(id);
  if (!agent) throw new Error(`unknown agent id: ${id}`);
  if (agent.status !== 'active') throw new Error(`agent ${id} is disabled`);
  return agent;
}

export async function getSopOrThrow(repo: AiBrainRepository, id: string): Promise<SopDefinition> {
  const sop = await repo.getSop(id);
  if (!sop) throw new Error(`unknown SOP id: ${id}`);
  if (sop.status !== 'active') throw new Error(`SOP ${id} is disabled`);
  return sop;
}

export function isFrozenAgentId(id: string): id is AgentId {
  return (FROZEN_AGENT_IDS as readonly string[]).includes(id);
}
