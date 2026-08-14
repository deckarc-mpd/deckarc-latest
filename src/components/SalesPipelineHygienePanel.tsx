// Sales Pipeline Hygiene AI panel (Phase 9 UI surface) — embedded on
// CP360LeadsPage.tsx. Runs sales_pipeline_hygiene_v1 on demand via
// api/ai-brain/run-sales-hygiene.ts: a deterministic rule finds stale
// leads (no status change in N days), then AI drafts a follow-up for
// each one ONLY — never a blanket message to the whole pipeline. Every
// non-empty, fully-grounded draft batch requires approval before use
// (this SOP never sends anything itself — no email/CRM integration
// exists yet). Approve/Reject reuses the exact same
// api/ai-brain/decide-approval.ts endpoint ActionCenterPage already uses.
// Styled to match this page's own amber/slate/emerald palette rather than
// the steel/site/hazard tokens used on the DeckArc-side AI panels, since
// this page is Convazant-admin-only and already has its own conventions.

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, XCircle, Mail, UserX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface StaleLeadFinding {
  leadId: string;
  fullName: string;
  companyName: string;
  status: string;
  daysSinceCreated: number;
}
interface LeadFollowUpDraft {
  leadId: string;
  subject: string;
  body: string;
}

export default function SalesPipelineHygienePanel() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const [staleFindings, setStaleFindings] = useState<StaleLeadFinding[]>([]);
  const [drafts, setDrafts] = useState<LeadFollowUpDraft[]>([]);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  async function runCheck() {
    setExpanded(true);
    setLoading(true);
    setError(null);
    setDecision(null);
    try {
      const res = await fetch('/api/ai-brain/run-sales-hygiene', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setStaleFindings(data.staleFindings ?? []);
      setDrafts(data.drafts ?? []);
      setApprovalId(data.approvalId ?? null);
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pipeline hygiene check failed.');
    } finally {
      setLoading(false);
    }
  }

  async function decide(next: 'approved' | 'rejected') {
    if (!user || !approvalId) return;
    setDeciding(true);
    try {
      await fetch('/api/ai-brain/decide-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: next, approverUserId: user.id }),
      });
      setDecision(next);
    } finally {
      setDeciding(false);
    }
  }

  const draftByLeadId = new Map(drafts.map((d) => [d.leadId, d]));

  return (
    <div className="bg-white border border-amber-200 rounded-xl shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-left">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-slate-800">AI Sales Pipeline Hygiene</span>
          {ran && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
              {staleFindings.length} stale
            </span>
          )}
        </button>
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Checking...' : ran ? 'Re-check' : 'Check Pipeline'}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {!ran && !loading && !error && (
            <p className="text-xs text-slate-400 italic">
              Finds leads with no status change in the configured window, then drafts a follow-up for each one only.
              Nothing checked yet.
            </p>
          )}

          {ran && staleFindings.length === 0 && (
            <p className="text-xs text-slate-500">No stale leads — the pipeline is current.</p>
          )}

          {staleFindings.length > 0 && (
            <div className="space-y-3">
              {staleFindings.map((finding) => {
                const draft = draftByLeadId.get(finding.leadId);
                return (
                  <div key={finding.leadId} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <UserX className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-semibold text-slate-800">{finding.fullName}</span>
                      {finding.companyName && <span className="text-[11px] text-slate-400">— {finding.companyName}</span>}
                      <span className="text-[10px] text-slate-400 ml-auto">{finding.daysSinceCreated} days since first contact, still "{finding.status}"</span>
                    </div>
                    {draft && (
                      <div className="mt-2 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700">{draft.subject}</span>
                        </div>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{draft.body}</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {approvalId && !decision && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide('approved')}
                    disabled={deciding}
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve — ready to send
                  </button>
                  <button
                    onClick={() => decide('rejected')}
                    disabled={deciding}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
              {decision === 'approved' && (
                <p className="text-xs text-emerald-700">Approved — drafts are ready for a human to copy and send. This does not send automatically.</p>
              )}
              {decision === 'rejected' && (
                <p className="text-xs text-slate-500">Rejected — drafts discarded.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
