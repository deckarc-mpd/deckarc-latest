// Chief of Staff exception synthesis (Frozen §8, §11's 07:30 example).
//
// Deterministic step (CODE, always runs): rank the resolved exceptions
// handed in, using a fixed, code-owned priority (critical > sweep
// escalation > needs-review) with a stable tie-break — this IS the
// "prioritization" half of Avery's job, and it never varies run to run for
// the same input, so it needs no AI and produces no different answer on
// replay.
//
// AI step (only when the ranked list is non-empty): add one short paragraph
// of "decision framing" — context for why today's ranking matters — never
// a re-ordering, never a resolution, never a routing decision. An empty
// list means zero AI calls, per §11.

import type { ResolvedException, RankedException, ChiefOfStaffSynthesis, ResolvedExceptionSource } from './types.ts';

const SOURCE_PRIORITY: Record<ResolvedExceptionSource, number> = {
  critical_item: 0,
  sweep_escalation: 1,
  needs_review_item: 2,
};

export function rankExceptions(exceptions: ResolvedException[]): RankedException[] {
  const sorted = [...exceptions].sort((a, b) => {
    const bySource = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    if (bySource !== 0) return bySource;
    if (a.projectId !== b.projectId) return a.projectId < b.projectId ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  return sorted.map((exception, index) => ({ ...exception, rank: index + 1 }));
}

export function shouldInvokeChiefOfStaffAi(ranked: RankedException[]): boolean {
  return ranked.length > 0;
}

export interface SynthesisClient {
  frame(ranked: RankedException[]): Promise<string>;
}

/** Deterministic stand-in for a real model — same role as DeterministicRiskInterpreter in Phase 2. */
export class DeterministicSynthesisClient implements SynthesisClient {
  async frame(ranked: RankedException[]): Promise<string> {
    if (ranked.length === 0) return '';
    const top = ranked.slice(0, 3).map((r) => `${r.title} (${r.projectId})`).join('; ');
    return `${ranked.length} item(s) need attention today. Top priority: ${top}.`;
  }
}

/**
 * Real, server-side model-backed implementation — same REST pattern as
 * GeminiRiskInterpreter. NOT exercised against a live model from this
 * sandbox; falls back to a clearly-labeled degraded framing on any failure
 * rather than blocking the (already-computed) deterministic ranking from
 * being reported, per Frozen §23.6.
 */
export class GeminiSynthesisClient implements SynthesisClient {
  private endpoint: string;

  constructor(endpoint: string = '/api/ai-brain/synthesize-daily-brief') {
    this.endpoint = endpoint;
  }

  async frame(ranked: RankedException[]): Promise<string> {
    if (ranked.length === 0) return '';
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ranked }),
      });
      if (!res.ok) throw new Error(`synthesize endpoint returned ${res.status}`);
      const data = (await res.json()) as { framing?: string };
      if (!data || typeof data.framing !== 'string' || !data.framing.trim()) {
        throw new Error('malformed synthesis response');
      }
      return data.framing;
    } catch (err) {
      const top = ranked.slice(0, 3).map((r) => `${r.title} (${r.projectId})`).join('; ');
      return `${ranked.length} item(s) need attention today (AI framing unavailable: ${err instanceof Error ? err.message : 'unknown error'}). Top priority: ${top}.`;
    }
  }
}

export async function synthesizeChiefOfStaffBrief(
  exceptions: ResolvedException[],
  client: SynthesisClient
): Promise<ChiefOfStaffSynthesis> {
  const prioritizedItems = rankExceptions(exceptions);

  if (!shouldInvokeChiefOfStaffAi(prioritizedItems)) {
    return {
      headline: 'All clear — nothing needs your attention right now.',
      prioritizedItems: [],
      aiInvoked: false,
      aiFraming: null,
    };
  }

  const aiFraming = await client.frame(prioritizedItems);
  return {
    headline: `${prioritizedItems.length} item(s) need your attention today.`,
    prioritizedItems,
    aiInvoked: true,
    aiFraming,
  };
}
