// AI Estimate page (Phase 9 Estimator UI surface). Runs
// estimate_pricing_recommendation_v1 on demand via
// api/ai-brain/run-estimate.ts: a free-text scope description is
// normalized to a known project-type category (AI, only when the text
// doesn't already match one exactly), then a deterministic lookup over
// this organization's completed projects proposes a price range from
// real comparables. Per Frozen §7, final price authorization remains
// human-only — this page only ever shows a proposed range for a human to
// review; there is no "set price" action anywhere here.

import { useState } from 'react';
import { Sparkles, Loader2, Calculator, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ScopeNormalizationResult {
  invoked: boolean;
  normalizedCategory: string;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}
interface PricingRecommendation {
  projectType: string;
  comparableCount: number;
  recommendedLow: number | null;
  recommendedHigh: number | null;
  medianContractAmount: number | null;
  averageMarginPercent: number | null;
}

function fmt(n: number | null) {
  if (n === null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const MIN_COMPARABLES_FOR_RECOMMENDATION = 2;

export default function AiEstimatePage() {
  const { profile } = useAuth();
  const [scopeText, setScopeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalized, setNormalized] = useState<ScopeNormalizationResult | null>(null);
  const [pricing, setPricing] = useState<PricingRecommendation | null>(null);

  const ready = pricing !== null && pricing.comparableCount >= MIN_COMPARABLES_FOR_RECOMMENDATION;

  async function getEstimate() {
    if (!scopeText.trim() || !profile?.organization_id) return;
    setLoading(true);
    setError(null);
    setNormalized(null);
    setPricing(null);
    try {
      const res = await fetch('/api/ai-brain/run-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeText: scopeText.trim(), organizationId: profile.organization_id }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setNormalized(data.normalized ?? null);
      setPricing(data.pricing ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estimate failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-5 h-5 text-steel-600" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Estimate</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Describe the project scope in plain English. This proposes a price range from your own completed
          projects — it never sets a price. Final price authorization is always yours.
        </p>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project Scope</label>
          <textarea
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
            placeholder='e.g. "Client wants a full kitchen renovation with new cabinets and an island"'
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-steel-400/30 focus:border-steel-400 transition-colors resize-none"
          />
          <button
            onClick={getEstimate}
            disabled={loading || !scopeText.trim()}
            className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2 disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Estimating...' : 'Get AI Estimate'}
          </button>
        </div>

        {error && (
          <div className="mt-4 text-sm text-hazard-700 bg-hazard-50 border border-hazard-200 rounded-lg px-4 py-3">{error}</div>
        )}

        {normalized && (
          <div className="mt-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Classified As</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{normalized.normalizedCategory}</span>
                {normalized.invoked && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-steel-50 text-steel-700 border-steel-200">
                    AI classified — {normalized.confidence} confidence
                  </span>
                )}
              </div>
              {normalized.invoked && normalized.explanation && (
                <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1.5">
                  <Sparkles className="w-3 h-3 text-steel-500 mt-0.5 flex-shrink-0" /> {normalized.explanation}
                </p>
              )}
            </div>

            {pricing && (
              <div className="border-t border-slate-100 pt-4">
                {ready ? (
                  <>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Proposed Price Range</p>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-site-600" />
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {fmt(pricing.recommendedLow)} – {fmt(pricing.recommendedHigh)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-slate-400 mb-0.5">Comparables</p>
                        <p className="font-semibold text-slate-800">{pricing.comparableCount} projects</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-slate-400 mb-0.5">Median Contract</p>
                        <p className="font-semibold text-slate-800">{fmt(pricing.medianContractAmount)}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-slate-400 mb-0.5">Avg. Margin</p>
                        <p className="font-semibold text-slate-800">
                          {pricing.averageMarginPercent !== null ? `${pricing.averageMarginPercent.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-3">
                      This is a proposed range only — final pricing authorization is yours to make.
                    </p>
                  </>
                ) : (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Not enough completed "{pricing.projectType}" projects yet ({pricing.comparableCount} found,
                      need at least {MIN_COMPARABLES_FOR_RECOMMENDATION}) — no reliable range to propose. Price this one manually.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
