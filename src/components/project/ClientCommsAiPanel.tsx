// Client Communication AI panel (Phase 5 UI surface) — embedded above
// CommunicationHubTab on the Comms tab, admin-only. Runs
// client_communication_draft_v1 on demand via
// api/ai-brain/run-client-communication.ts, and — unlike the read-only
// Compliance/Finance panels — this SOP DOES create an approval for every
// non-empty, fully-grounded draft batch (its registry escalation policy:
// "All client-facing sends require company admin approval"). Approve/
// Reject reuses the exact same api/ai-brain/decide-approval.ts endpoint
// ActionCenterPage already uses — no parallel approval code path.
// "Approved" means the draft is ready for a human to copy and send, not
// that anything was dispatched automatically — there is no email/Calendar
// integration yet (ADR-CP360-AI-001).

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface ClientCommunicationDraft {
  occasion: 'decision_reminder' | 'delay_update';
  sourceId: string;
  subject: string;
  body: string;
}

export default function ClientCommsAiPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<ClientCommunicationDraft[]>([]);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  async function runCheck() {
    setExpanded(true);
    setLoading(true);
    setError(null);
    setDecision(null);
    try {
      const res = await fetch('/api/ai-brain/run-client-communication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setStatus(data.status);
      setCandidateCount(data.candidateCount ?? 0);
      setDrafts(data.drafts ?? []);
      setApprovalId(data.approvalId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Client communication draft failed.');
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

  return (
    <div className="border border-steel-100 rounded-xl bg-steel-50/40 overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-left">
          <Sparkles className="w-4 h-4 text-steel-600" />
          <span className="text-sm font-semibold text-slate-800">AI Client Update Drafts</span>
        </button>
        <button
          onClick={runCheck}
          disabled={loading}
          className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Drafting...' : status ? 'Re-check' : 'Check for Updates Needed'}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {error && (
            <div className="text-xs text-hazard-700 bg-hazard-50 border border-hazard-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {!status && !loading && !error && (
            <p className="text-xs text-slate-400 italic">
              Finds open decisions needing homeowner input and client-visible delay updates, then drafts a message
              from verified CP360 facts only. Nothing checked yet.
            </p>
          )}

          {status && candidateCount === 0 && (
            <p className="text-xs text-slate-500">Nothing needs a client update right now.</p>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft.sourceId} className="bg-white border border-slate-200 rounded-lg px-3 py-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-800">{draft.subject}</span>
                    <span className="text-[10px] text-slate-400 uppercase ml-auto">{draft.occasion.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{draft.body}</p>
                </div>
              ))}

              {approvalId && !decision && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide('approved')}
                    disabled={deciding}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-site-100 text-site-700 hover:bg-site-200 disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve — ready to send
                  </button>
                  <button
                    onClick={() => decide('rejected')}
                    disabled={deciding}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-hazard-100 text-hazard-700 hover:bg-hazard-200 disabled:opacity-40"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject — needs a redraft
                  </button>
                </div>
              )}
              {decision === 'approved' && (
                <p className="text-xs text-site-700">Approved — ready for a human to copy and send. This does not send automatically.</p>
              )}
              {decision === 'rejected' && (
                <p className="text-xs text-hazard-700">Rejected — draft discarded, needs a manual redraft.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
