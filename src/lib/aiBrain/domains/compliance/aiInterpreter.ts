// CP360 AI Operations Brain — Compliance AI interpretation (Phase 7).
//
// Same contract and safety property as Project Ops' aiInterpreter.ts:
// this is the ONLY place a model may run in the compliance sweep, and only
// to explain ambiguous correction-notes free text or synthesize an
// explanation across multiple simultaneous gate failures — never to decide
// whether a gate passed. ComplianceInterpretation has no status field, so
// there is nothing here to override even by accident, and the SOP's
// verification step independently re-derives finalStatus from the
// deterministic result.
//
// A distinct interpreter (not a reuse of Project Ops' RiskInterpreterClient)
// because the category taxonomy is genuinely domain-specific — permit/
// inspection/COI findings aren't weather/material/access/labor findings —
// mirroring how Phase 5 built its own DraftClient rather than reusing
// Project Ops' interpreter.

import type { DeterministicComplianceResult, ComplianceInterpretation, ComplianceFindingCategory } from './types.ts';

export interface ComplianceInterpretInput {
  deterministic: DeterministicComplianceResult;
  freeText: string[];
}

export interface ComplianceInterpreterClient {
  interpret(input: ComplianceInterpretInput): Promise<ComplianceInterpretation>;
}

/** Deterministic pre-filter — most sweeps have nothing ambiguous to explain and must cost zero AI calls (Frozen §11). */
export function shouldInvokeComplianceInterpretation(deterministic: DeterministicComplianceResult, freeText: string[]): boolean {
  const hasFreeText = freeText.some((t) => t.trim().length > 0);
  const failedGateCount = deterministic.gates.filter((g) => g.status === 'not_ready').length;
  return hasFreeText || failedGateCount >= 2;
}

const CATEGORY_KEYWORDS: Array<{ category: ComplianceFindingCategory; keywords: string[] }> = [
  { category: 'permit_issue', keywords: ['permit', 'site plan', 'zoning', 'hoa', 'variance'] },
  { category: 'inspection_correction', keywords: ['inspection', 'inspector', 'gfci', 'reinspection', 'correction'] },
  { category: 'coi_expiry', keywords: ['insurance', 'coi', 'certificate', 'license'] },
];

function classify(text: string): ComplianceFindingCategory {
  const lower = text.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return text.trim() ? 'other' : 'none';
}

/** Deterministic stand-in used as the default so this sweep is fully testable without a live LLM. */
export class DeterministicComplianceInterpreter implements ComplianceInterpreterClient {
  async interpret(input: ComplianceInterpretInput): Promise<ComplianceInterpretation> {
    const { deterministic, freeText } = input;
    const meaningfulText = freeText.filter((t) => t.trim().length > 0);

    if (!shouldInvokeComplianceInterpretation(deterministic, freeText)) {
      return { invoked: false, category: 'none', severity: 'low', explanation: '', sourceText: [] };
    }

    const failedGates = deterministic.gates.filter((g) => g.status === 'not_ready');
    const category = meaningfulText.length > 0 ? classify(meaningfulText.join(' ')) : 'other';
    const severity = failedGates.length >= 2 ? 'high' : failedGates.length === 1 ? 'medium' : 'low';

    const gateNames = failedGates.map((g) => g.gate.replace('_', ' ')).join(', ');
    const explanation =
      meaningfulText.length > 0
        ? `Compliance records indicate a ${category.replace('_', ' ')}: "${meaningfulText.join('; ')}". This affects the ${gateNames || 'overall'} gate(s).`
        : `Multiple compliance gates failed simultaneously (${gateNames}), which is worth a human look even though no single finding is unusual on its own.`;

    return { invoked: true, category, severity, explanation, sourceText: meaningfulText };
  }
}

/**
 * Real, server-side model-backed implementation — same REST/fallback
 * pattern as GeminiRiskInterpreter. NOT exercised against a live model
 * from this sandbox.
 */
export class GeminiComplianceInterpreter implements ComplianceInterpreterClient {
  private endpoint: string;

  constructor(endpoint: string = '/api/ai-brain/interpret-compliance-finding') {
    this.endpoint = endpoint;
  }

  async interpret(input: ComplianceInterpretInput): Promise<ComplianceInterpretation> {
    const { deterministic, freeText } = input;
    if (!shouldInvokeComplianceInterpretation(deterministic, freeText)) {
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
      const data = (await res.json()) as Partial<ComplianceInterpretation>;
      if (!data || typeof data.category !== 'string' || typeof data.explanation !== 'string') {
        throw new Error('malformed interpretation response');
      }
      return {
        invoked: true,
        category: (data.category as ComplianceFindingCategory) ?? 'other',
        severity: (data.severity as ComplianceInterpretation['severity']) ?? 'medium',
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
