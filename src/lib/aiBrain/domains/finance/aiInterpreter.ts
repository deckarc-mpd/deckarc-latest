// Finance AI interpretation (Phase 8). Frozen §5: AI may only be invoked
// for ambiguous invoice/client responses, dispute interpretation,
// explanation/recommendation, and unusual financial exception synthesis —
// never for billing math, due dates, margin calculations, or cash
// projections, all of which are already fixed by financeAssessment.ts by
// the time this ever runs. FinanceInterpretation has no numeric field at
// all, so there is nothing here to override even by accident.

import type { DeterministicFinanceResult, FinanceInterpretation, FinanceFindingCategory } from './types.ts';

export interface FinanceInterpretInput {
  deterministic: DeterministicFinanceResult;
  freeText: string[];
}

export interface FinanceInterpreterClient {
  interpret(input: FinanceInterpretInput): Promise<FinanceInterpretation>;
}

/** Deterministic pre-filter — most sweeps have nothing ambiguous to explain and must cost zero AI calls (Frozen §11). */
export function shouldInvokeFinanceInterpretation(deterministic: DeterministicFinanceResult, freeText: string[]): boolean {
  const hasFreeText = freeText.some((t) => t.trim().length > 0);
  const failedGateCount = deterministic.gates.filter((g) => g.status === 'not_ready').length;
  return hasFreeText || failedGateCount >= 2;
}

const CATEGORY_KEYWORDS: Array<{ category: FinanceFindingCategory; keywords: string[] }> = [
  { category: 'billing_dispute', keywords: ['invoice', 'billed', 'overbilled', 'draw request'] },
  { category: 'collections_response', keywords: ['payment plan', 'can\'t pay', 'dispute the balance', 'client says'] },
  { category: 'ap_dispute', keywords: ['quantity', 'delivery', 'wrong amount', 'vendor says'] },
];

function classify(text: string): FinanceFindingCategory {
  const lower = text.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return text.trim() ? 'other' : 'none';
}

/** Deterministic stand-in used as the default so this sweep is fully testable without a live LLM. */
export class DeterministicFinanceInterpreter implements FinanceInterpreterClient {
  async interpret(input: FinanceInterpretInput): Promise<FinanceInterpretation> {
    const { deterministic, freeText } = input;
    const meaningfulText = freeText.filter((t) => t.trim().length > 0);

    if (!shouldInvokeFinanceInterpretation(deterministic, freeText)) {
      return { invoked: false, category: 'none', severity: 'low', explanation: '', sourceText: [] };
    }

    const failedGates = deterministic.gates.filter((g) => g.status === 'not_ready');
    const category = meaningfulText.length > 0 ? classify(meaningfulText.join(' ')) : 'other';
    const severity = failedGates.length >= 2 ? 'high' : failedGates.length === 1 ? 'medium' : 'low';

    const gateNames = failedGates.map((g) => g.gate.replace('_', ' ')).join(', ');
    const explanation =
      meaningfulText.length > 0
        ? `Financial records indicate a ${category.replace('_', ' ')}: "${meaningfulText.join('; ')}". This affects the ${gateNames || 'overall'} gate(s).`
        : `Multiple financial gates failed simultaneously (${gateNames}), worth a human look even though no single finding is unusual on its own.`;

    return { invoked: true, category, severity, explanation, sourceText: meaningfulText };
  }
}

/**
 * Real, server-side model-backed implementation — same REST/fallback
 * pattern as GeminiRiskInterpreter/GeminiComplianceInterpreter. NOT
 * exercised against a live model from this sandbox.
 */
export class GeminiFinanceInterpreter implements FinanceInterpreterClient {
  private endpoint: string;

  constructor(endpoint: string = '/api/ai-brain/interpret-finance-finding') {
    this.endpoint = endpoint;
  }

  async interpret(input: FinanceInterpretInput): Promise<FinanceInterpretation> {
    const { deterministic, freeText } = input;
    if (!shouldInvokeFinanceInterpretation(deterministic, freeText)) {
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
      const data = (await res.json()) as Partial<FinanceInterpretation>;
      if (!data || typeof data.category !== 'string' || typeof data.explanation !== 'string') {
        throw new Error('malformed interpretation response');
      }
      return {
        invoked: true,
        category: (data.category as FinanceFindingCategory) ?? 'other',
        severity: (data.severity as FinanceInterpretation['severity']) ?? 'medium',
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
