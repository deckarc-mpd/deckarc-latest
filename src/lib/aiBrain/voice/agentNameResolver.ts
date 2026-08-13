// Resolves a spoken agent name ("Marcus", "Natalie") to its stable agent id
// using the AI Employee Identities mapping — the SAME FROZEN_AGENT_SEED
// registry.ts already exports. This is the ONE place display names are
// read at all; the resolved AgentId is what every downstream call uses.
// This does not violate the Identity spec's "never branch business logic
// on displayName" rule — that rule is about mid-flow decisions, not about
// converting a spoken name into a stable id once, at the boundary, before
// any SOP/tool call happens.

import { FROZEN_AGENT_SEED } from '../registry.ts';
import type { AgentId } from '../types.ts';

export function resolveSpokenAgentName(text: string): AgentId | null {
  const lower = text.toLowerCase();
  for (const agent of FROZEN_AGENT_SEED) {
    if (lower.includes(agent.displayName.toLowerCase())) return agent.id;
  }
  return null;
}
