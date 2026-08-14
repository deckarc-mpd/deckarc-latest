// Compliance AI sub-tab (Phase 7 UI surface) — lives inside
// ProjectPermitsInspectionsTab's existing SubTab bar, alongside
// Permits/Checklist/Inspections. Runs compliance_permit_inspection_sweep_v1
// on demand via api/ai-brain/run-compliance-check.ts and renders the
// deterministic gate findings plus (if invoked) the AI explanation —
// exactly what the SOP itself computes, nothing more, nothing fabricated.
// Read-only: this SOP never writes a CP360 table and never creates an
// approval (see the SOP's own file header), so there is nothing to
// approve/reject here — only a "why" for a human to review.

import { useState } from 'react';
import { Sparkles, Loader2, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
import { overallStatusBadgeClasses, overallStatusLabel, gateStatusBadgeClasses, severityBadgeClasses, type AiOverallStatus } from '../aiBrain/aiStatusStyles';

interface GateResult {
  gate: string;
  status: 'ready' | 'not_ready';
  findings: string[];
}
interface ComplianceReadiness {
  projectId: string;
  asOfDate: string;
  gates: GateResult[];
  overallStatus: AiOverallStatus;
}
interface ComplianceInterpretation {
  invoked: boolean;
  category: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
}

export default function ComplianceAiTab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ComplianceReadiness | null>(null);
  const [interpretation, setInterpretation] = useState<ComplianceInterpretation | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-brain/run-compliance-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setReadiness(data.readiness ?? null);
      setInterpretation(data.interpretation ?? null);
      setRanAt(new Date().toLocaleString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compliance check failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-steel-600" />
            <h3 className="text-sm font-semibold text-slate-900">AI Compliance Check</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-lg">
            Deterministically evaluates permit status/expiry, inspection corrections, and COI/license expiry.
            AI only explains why — it never decides whether a gate passed.
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Running...' : readiness ? 'Re-run Check' : 'Run Compliance Check'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-hazard-700 bg-hazard-50 border border-hazard-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {!readiness && !loading && !error && (
        <div className="text-xs text-slate-400 italic border border-dashed border-slate-200 rounded-lg px-4 py-8 text-center">
          No check run yet. Click "Run Compliance Check" to evaluate this project's permits, inspections, and COI/license status.
        </div>
      )}

      {readiness && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              {readiness.overallStatus === 'ready'
                ? <ShieldCheck className="w-4 h-4 text-site-600" />
                : <ShieldAlert className="w-4 h-4 text-hazard-600" />}
              <span className="text-sm font-medium text-slate-800">Overall Status</span>
            </div>
            <span className={`inline-flex items-center rounded-full font-semibold px-2.5 py-0.5 text-xs ${overallStatusBadgeClasses(readiness.overallStatus)}`}>
              {overallStatusLabel(readiness.overallStatus)}
            </span>
          </div>

          <div className="space-y-2">
            {readiness.gates.map((gate) => (
              <div key={gate.gate} className="border border-slate-100 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{gate.gate.replace(/_/g, ' ')}</span>
                  <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[10px] ${gateStatusBadgeClasses(gate.status)}`}>
                    {gate.status === 'ready' ? 'Ready' : 'Not Ready'}
                  </span>
                </div>
                {gate.findings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {gate.findings.map((f, i) => (
                      <li key={i} className="text-xs text-slate-600">• {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {interpretation?.invoked && (
            <div className="border border-steel-100 bg-steel-50 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-steel-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> AI Explanation
                </span>
                <span className={`inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[10px] ${severityBadgeClasses(interpretation.severity)}`}>
                  {interpretation.severity}
                </span>
              </div>
              <p className="text-xs text-slate-700">{interpretation.explanation}</p>
            </div>
          )}

          {ranAt && <p className="text-[11px] text-slate-400">Last run: {ranAt} — as of {readiness.asOfDate}</p>}
        </div>
      )}
    </div>
  );
}
