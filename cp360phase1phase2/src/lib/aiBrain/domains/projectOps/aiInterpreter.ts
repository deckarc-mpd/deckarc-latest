// CP360 AI Operations Brain — Project Ops AI interpretation (Slice: AI tier).
//
// Frozen §7: this is the ONLY place in the Tomorrow Readiness SOP that may
// call a model, and only for interpreting ambiguous free text or
// synthesizing a human-readable explanation across multiple simultaneous
// gate failures — never for deciding whether a gate passed. That decision
// already happened in readinessGates.ts and is fixed by the time anything
// here runs. `RiskInterpretation` (types.ts) has no status/verdict field at
// all, so there is nothing for this layer to override even by accident —
// and the SOP's verification step (sops/tomorrowReadiness.ts) independently
// re-checks that the final assessment's status still equals the
// deterministic one, so a violation would be caught, not just prevented by
// convention.
//
// shouldInvokeInterpretation() is the deterministic pre-filter required by
// Frozen §23.6 ("what deterministic pre-filter reduces input to only
// relevant exceptions?") — most readiness checks have nothing ambiguous to
// explain and must cost zero AI calls, per §11's "AI only for exceptions."

import type { DeterministicReadinessResult, RiskInterpretation } from './types.ts';

export interface RiskInterpretInput {
  deterministic: DeterministicReadinessResult;
  /** Raw free-text field values (blockers, materials_pending, weather_issue) collected from daily updates. */
  freeText: string[];
}

export interface RiskInterpreterClient {
  interpret(input: RiskInterpretInput): Promise<RiskInterpretation>;
}

/**
 * Deterministic pre-filter: is there anything actually worth an AI call?
 * Zero free text AND zero-or-one failed gate -> no, the deterministic
 * findings already explain themselves plainly enough for a human to act on.
 */
export function shouldInvokeInterpretation(
  deterministic: DeterministicReadinessResult,
  freeText: string[]
): boolean {
  const hasFreeText = freeText.some((t) => t.trim().length > 0);
  const failedGateCount = deterministic.gates.filter((g) => g.status === 'not_ready').length;
  return hasFreeText || failedGateCount >= 2;
}

const CATEGORY_KEYWORDS: Array<{ category: RiskInterpretation['category']; keywords: string[] }> = [
  { category: 'weather', keywords: ['rain', 'weather', 'snow', 'wind', 'storm', 'wet', 'flood'] },
  { category: 'material_delay', keywords: ['material', 'delivery', 'supplier', 'backorder', 'lumber', 'shipment', 'order'] },
  { category: 'access_issue', keywords: ['access', 'lock', 'gate', 'hoa', 'permission', 'entry', 'key'] },
  { category: 'labor_issue', keywords: ['crew', 'sub', 'subcontractor', 'no-show', 'no show', 'unavailable', 'sick', 'short-staffed'] },
];

function classify(text: string): RiskInterpretation['category'] {
  const lower = text.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return text.trim() ? 'other' : 'none';
}

/**
 * Deterministic stand-in for a real model call — used as the default so
 * Phase 2 has a working, fully-testable interpretation step without a live
 * LLM dependency. Deliberately NOT labeled "AI" anywhere in its own output;
 * it is infrastructure for testing GeminiRiskInterpreter's contract, not a
 * production interpretation strategy. Swap in GeminiRiskInterpreter (below)
 * for real deployments.
 */
export class DeterministicRiskInterpreter implements RiskInterpreterClient {
  async interpret(input: RiskInterpretInput): Promise<RiskInterpretation> {
    const { deterministic, freeText } = input;
    const meaningfulText = freeText.filter((t) => t.trim().length > 0);

    if (!shouldInvokeInterpretation(deterministic, freeText)) {
      return { invoked: false, category: 'none', severity: 'low', explanation: '', sourceText: [] };
    }

    const failedGates = deterministic.gates.filter((g) => g.status === 'not_ready');
    const category = meaningfulText.length > 0 ? classify(meaningfulText.join(' ')) : 'other';
    const severity: RiskInterpretation['severity'] =
      failedGates.length >= 2 || deterministic.overallStatus === 'blocked'
        ? 'high'
        : failedGates.length === 1
          ? 'medium'
          : 'low';

    const gateNames = failedGates.map((g) => g.gate.replace('_', ' ')).join(', ');
    const explanation =
      meaningfulText.length > 0
        ? `Field reports indicate a ${category.replace('_', ' ')} issue: "${meaningfulText.join('; ')}". This affects the ${gateNames || 'overall'} readiness gate(s).`
        : `Multiple readiness gates failed simultaneously (${gateNames}), which increases the chance tomorrow's work slips even though no single gate is unusual on its own.`;

    return { invoked: true, category, severity, explanation, sourceText: meaningfulText };
  }
}

/**
 * Real, server-side Gemini-backed implementation — same model and REST
 * pattern already used by api/voice-assistant.ts. NOT exercised against a
 * live model from this sandbox (no network path to any LLM provider here —
 * see CP360_AI_COST_BASELINE.md's environment notes); wiring and the
 * structured-output contract are complete and type-checked, but this class
 * is a prerequisite-verification item before real deployment, exactly like
 * supabaseRepository.ts and cascadeDelayTool.ts in Phase 1.
 *
 * Per Frozen §23.6 ("what happens if the model is unavailable or
 * malformed?"): any fetch failure, non-200, or response that doesn't parse
 * into the expected shape falls back to a clearly-labeled degraded
 * interpretation rather than throwing — a missing explanation must never
 * block the deterministic readiness verdict from being reported.
 */
export class GeminiRiskInterpreter implements RiskInterpreterClient {
  private endpoint: string;

  constructor(endpoint: string = '/api/ai-brain/interpret-field-update') {
    this.endpoint = endpoint;
  }

  async interpret(input: RiskInterpretInput): Promise<RiskInterpretation> {
    const { deterministic, freeText } = input;
    if (!shouldInvokeInterpretation(deterministic, freeText)) {
      return { invoked: false, category: 'none', severity: 'low', explanation: '', sourceText: [] };
    }

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateFindings: deterministic.gates.flatMap((g) => g.findings),
          overallStatus: deterministic.overallStatus,
          freeText: freeText.filter((t) => t.trim()),
        }),
      });
      if (!res.ok) throw new Error(`interpret endpoint returned ${res.status}`);
      const data = (await res.json()) as Partial<RiskInterpretation>;
      if (!data || typeof data.category !== 'string' || typeof data.explanation !== 'string') {
        throw new Error('malformed interpretation response');
      }
      return {
        invoked: true,
        category: (data.category as RiskInterpretation['category']) ?? 'other',
        severity: (data.severity as RiskInterpretation['severity']) ?? 'medium',
        explanation: data.explanation,
        sourceText: freeText.filter((t) => t.trim()),
      };
    } catch (err) {
      return {
        invoked: true,
        category: 'other',
        severity: 'medium',
        explanation: `AI interpretation unavailable (${err instanceof Error ? err.message : 'unknown error'}); review the deterministic gate findings directly.`,
        sourceText: freeText.filter((t) => t.trim()),
      };
    }
  }
}
