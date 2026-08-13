// Scope normalization (AI tier, Frozen §4/§7). Turns free-text scope
// description into one of the known project-type categories — NEVER
// touches pricing. ScopeNormalizationResult has no numeric field at all,
// so there is nothing here for AI to influence about price.

import type { ScopeNormalizationResult } from './types.ts';

export const KNOWN_PROJECT_TYPES = [
  'Single-story room addition', 'Two-story extension', 'Bathroom remodel',
  'Kitchen remodel', 'Deck/Patio', 'New construction', 'Renovation', 'Other',
] as const;

/** Deterministic pre-filter: text that already exactly matches a known category needs no AI at all. */
export function shouldInvokeScopeNormalization(scopeText: string): boolean {
  return !(KNOWN_PROJECT_TYPES as readonly string[]).includes(scopeText.trim());
}

export interface ScopeInterpreterClient {
  normalize(scopeText: string): Promise<ScopeNormalizationResult>;
}

const CATEGORY_KEYWORDS: Array<{ category: (typeof KNOWN_PROJECT_TYPES)[number]; keywords: string[] }> = [
  { category: 'Kitchen remodel', keywords: ['kitchen'] },
  { category: 'Bathroom remodel', keywords: ['bathroom', 'bath remodel', 'shower', 'master bath'] },
  { category: 'Deck/Patio', keywords: ['deck', 'patio', 'porch'] },
  { category: 'Two-story extension', keywords: ['two-story', 'two story', 'second floor', 'second-story'] },
  { category: 'Single-story room addition', keywords: ['addition', 'add a room', 'bump out', 'bump-out'] },
  { category: 'New construction', keywords: ['new build', 'new home', 'ground-up', 'from scratch'] },
];

function classify(scopeText: string): (typeof KNOWN_PROJECT_TYPES)[number] {
  const lower = scopeText.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return scopeText.trim() ? 'Renovation' : 'Other';
}

/** Deterministic stand-in used as the default so this SOP is fully testable without a live LLM. */
export class DeterministicScopeInterpreter implements ScopeInterpreterClient {
  async normalize(scopeText: string): Promise<ScopeNormalizationResult> {
    if (!shouldInvokeScopeNormalization(scopeText)) {
      return { invoked: false, normalizedCategory: scopeText.trim(), confidence: 'high', explanation: '' };
    }
    const category = classify(scopeText);
    return {
      invoked: true,
      normalizedCategory: category,
      confidence: category === 'Renovation' || category === 'Other' ? 'low' : 'medium',
      explanation: `Classified "${scopeText}" as ${category} based on the scope description.`,
    };
  }
}

/**
 * Real, server-side model-backed implementation — same REST/fallback
 * pattern as every prior AI-tier client. NOT exercised against a live
 * model from this sandbox.
 */
export class GeminiScopeInterpreter implements ScopeInterpreterClient {
  private endpoint: string;
  private fallback = new DeterministicScopeInterpreter();

  constructor(endpoint: string = '/api/ai-brain/normalize-project-scope') {
    this.endpoint = endpoint;
  }

  async normalize(scopeText: string): Promise<ScopeNormalizationResult> {
    if (!shouldInvokeScopeNormalization(scopeText)) {
      return { invoked: false, normalizedCategory: scopeText.trim(), confidence: 'high', explanation: '' };
    }
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeText, knownCategories: KNOWN_PROJECT_TYPES }),
      });
      if (!res.ok) throw new Error(`normalize endpoint returned ${res.status}`);
      const data = (await res.json()) as Partial<ScopeNormalizationResult>;
      if (!data || typeof data.normalizedCategory !== 'string' || !(KNOWN_PROJECT_TYPES as readonly string[]).includes(data.normalizedCategory)) {
        throw new Error('malformed or unknown-category normalization response');
      }
      return {
        invoked: true,
        normalizedCategory: data.normalizedCategory,
        confidence: data.confidence ?? 'medium',
        explanation: data.explanation ?? '',
      };
    } catch {
      return this.fallback.normalize(scopeText);
    }
  }
}
