// CP360 AI Operations Brain — Feature flags (Slice 7).
//
// One flag per new capability introduced in Phase 1, all seeded OFF
// platform-wide by supabase/migrations/20260812140000_create_ai_brain_foundation.sql.
// A company is opted in by inserting a company-scoped row with enabled=true
// (service-role only, per the same write-lockdown as every other ai_*
// table). This lets a pilot company be enabled without a code deploy and
// without exposing any Phase 1 capability to every existing tenant the
// moment this code ships (Frozen §14's lean/incremental posture).

import type { AiBrainRepository } from './repository.ts';

export const AI_BRAIN_FLAG_KEYS = [
  'ai_brain_enabled',
  'ai_brain_audit',
  'ai_brain_events',
  'ai_brain_agent_registry',
  'ai_brain_workflow_engine',
  'ai_brain_controlled_tools',
  'ai_brain_policy_engine',
] as const;

export type AiBrainFlagKey = (typeof AI_BRAIN_FLAG_KEYS)[number];

/**
 * Resolves a company-scoped override if one exists, otherwise the global
 * default, otherwise false — fail-closed for any flag key nobody has
 * seeded, so a typo'd or not-yet-migrated flag key never accidentally
 * defaults to "on."
 */
export async function isFeatureEnabled(
  repo: AiBrainRepository,
  key: AiBrainFlagKey | string,
  companyId: string
): Promise<boolean> {
  const flag = await repo.getFeatureFlag(key, companyId);
  return flag?.enabled ?? false;
}

/**
 * The master switch: every other ai_brain_* capability is treated as off
 * when this is off, regardless of its own individual flag state, so a
 * single kill switch can disable the entire Phase 1 surface at once.
 */
export async function isAiBrainEnabledForCompany(repo: AiBrainRepository, companyId: string): Promise<boolean> {
  return isFeatureEnabled(repo, 'ai_brain_enabled', companyId);
}

/** Checks the master switch AND the specific capability flag together. */
export async function isCapabilityEnabled(
  repo: AiBrainRepository,
  key: Exclude<AiBrainFlagKey, 'ai_brain_enabled'>,
  companyId: string
): Promise<boolean> {
  const [master, specific] = await Promise.all([
    isAiBrainEnabledForCompany(repo, companyId),
    isFeatureEnabled(repo, key, companyId),
  ]);
  return master && specific;
}
