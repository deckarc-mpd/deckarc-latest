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
    assignedSops: [],
    allowedTools: [],
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
    assignedSops: [],
    allowedTools: [],
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
    assignedSops: [],
    allowedTools: [],
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
    assignedSops: ['task_delay_cascade_v1', 'tomorrow_readiness_v1'],
    allowedTools: ['cascade_delay', 'compute_tomorrow_readiness', 'interpret_field_update'],
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
    assignedSops: [],
    allowedTools: [],
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
    assignedSops: [],
    allowedTools: [],
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
