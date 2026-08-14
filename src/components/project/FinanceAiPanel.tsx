// Finance AI panel (Phase 8 UI surface) — embedded at the top of
// PaymentsTab, admin-only (matches PaymentsTab's own canEdit gate).
// Runs billing_ar_margin_sweep_v1 on demand via
// api/ai-brain/run-finance-check.ts and renders the deterministic gates
// (billing/collections/AP/margin/cash forecast) plus, if invoked, the AI
// explanation. Read-only and never moves money — this SOP has no
// payment-execution tool to call (see the SOP's own file header) — so
// there is nothing to approve/reject here, only figures for a human to
// review.

import { useState } from 'react';
import { Sparkles, Loader2, TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { overallStatusBadgeClasses, overallStatusLabel, gateStatusBadgeClasses, severityBadgeClasses, type AiOverallStatus } from '../aiBrain/aiStatusStyles';

interface GateResult {
  gate: string;
  status: 'ready' | 'not_ready';
  findings: string[];
}
interface MarginResult {
  contractAmount: number | null;
  totalRevenue: number | null;
  totalCost: number;
  margin: number | null;
  marginPercent: number | null;
}
interface CashForecastResult {
  horizonDays: number;
  expectedInflows: number;
  expectedOutflows: number;
  netProjectedCash: number;
}
interface FinanceAssessment {
  asOfDate: string;
  gates: GateResult[];
  overallStatus: AiOverallStatus;
  margin: MarginResult;
  cashForecast: CashForecastResult;
}
interface FinanceInterpretation {
  invoked: boolean;
  category: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
}

function fmt(n: number | null) {
  if (n === null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function FinanceAiPanel({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<FinanceAssessment | null>(null);
  const [interpretation, setInterpretation] = useState<FinanceInterpretation | null>(null);

  async function runCheck() {
    setExpanded(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-brain/run-finance-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setAssessment(data.assessment ?? null);
      setInterpretation(data.interpretation ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Finance check failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-steel-100 rounded-xl bg-steel-50/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-left">
          <Sparkles className="w-4 h-4 text-steel-600" />
          <span className="text-sm font-semibold text-slate-800">AI Finance Check</span>
          {assessment && (
            <span className={`inline-flex items-center rounded-full font-semibold px-2.5 py-0.5 text-[10px] ${overallStatusBadgeClasses(assessment.overallStatus)}`}>
              {overallStatusLabel(assessment.overallStatus)}
            </span>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        <button
          onClick={runCheck}
          disabled={loading}
          className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Running...' : assessment ? 'Re-run' : 'Run Check'}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {error && (
            <div className="text-xs text-hazard-700 bg-hazard-50 border border-hazard-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {!assessment && !loading && !error && (
            <p className="text-xs text-slate-400 italic">
              Evaluates billing readiness, collections aging, AP status, margin, and a 30-day cash forecast. Nothing computed yet.
            </p>
          )}

          {assessment && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-slate-500 mb-1">Margin</p>
                  <div className="flex items-center gap-1.5">
                    {assessment.margin.marginPercent !== null && assessment.margin.marginPercent < 15
                      ? <TrendingDown className="w-3.5 h-3.5 text-hazard-600" />
                      : <TrendingUp className="w-3.5 h-3.5 text-site-600" />}
                    <span className="text-sm font-bold tabular-nums text-slate-800">
                      {assessment.margin.marginPercent !== null ? `${assessment.margin.marginPercent.toFixed(1)}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400">({fmt(assessment.margin.margin)})</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-slate-500 mb-1">{assessment.cashForecast.horizonDays}-Day Cash Forecast</p>
                  <span className={`text-sm font-bold tabular-nums ${assessment.cashForecast.netProjectedCash < 0 ? 'text-hazard-600' : 'text-slate-800'}`}>
                    {fmt(assessment.cashForecast.netProjectedCash)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {assessment.gates.map((gate) => (
                  <div key={gate.gate} className="border border-slate-100 bg-white rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">{gate.gate.replace(/_/g, ' ')}</span>
                      <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[10px] ${gateStatusBadgeClasses(gate.status)}`}>
                        {gate.status === 'ready' ? 'Ready' : 'Not Ready'}
                      </span>
                    </div>
                    {gate.findings.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {gate.findings.map((f, i) => (
                          <li key={i} className="text-xs text-slate-600">• {f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {interpretation?.invoked && (
                <div className="border border-steel-200 bg-white rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-steel-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Explanation
                    </span>
                    <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[10px] ${severityBadgeClasses(interpretation.severity)}`}>
                      {interpretation.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">{interpretation.explanation}</p>
                </div>
              )}

              <p className="text-[11px] text-slate-400">As of {assessment.asOfDate}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
