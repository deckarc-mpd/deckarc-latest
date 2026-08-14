import { useEffect, useState } from 'react';
import { FileCheck, CheckCircle, Clock, AlertTriangle, Send, Search, Loader, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ClientDecision {
  id: string;
  project_id: string;
  decision_title: string;
  description: string;
  needed_by_date: string | null;
  status: string;
  time_impact_days: number;
  cost_impact: number;
  client_visible_note: string;
  client_response: string;
  client_responded_at: string | null;
  created_at: string;
  project?: { project_name: string };
}

const STATUS_CFG: Record<string, { pill: string; icon: typeof CheckCircle }> = {
  Approved:    { pill: 'bg-green-50 text-green-700 border-green-200',     icon: CheckCircle   },
  Pending:     { pill: 'bg-slate-100 text-slate-600 border-slate-200',    icon: Clock         },
  'Needs Decision': { pill: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  Overdue:     { pill: 'bg-red-50 text-red-700 border-red-200',           icon: AlertTriangle },
  Declined:    { pill: 'bg-slate-100 text-slate-500 border-slate-200',    icon: Clock         },
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d + 'T00:00:00') < new Date();
}

export default function ClientSelectionsPage() {
  const { profile } = useAuth();
  const [decisions, setDecisions] = useState<ClientDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_decisions')
      .select('id, project_id, decision_title, description, needed_by_date, status, time_impact_days, cost_impact, client_visible_note, client_response, client_responded_at, created_at, projects(project_name)')
      .order('needed_by_date', { ascending: true });

    if (!error && data) {
      setDecisions((data as any[]).map(d => ({ ...d, project: d.projects })));
    }
    setLoading(false);
  }

  async function submitResponse(decision: ClientDecision) {
    const response = responses[decision.id];
    if (!response?.trim() || !profile) return;
    setSaving(decision.id);

    const now = new Date().toISOString();

    await supabase
      .from('client_decisions')
      .update({
        status: 'Approved',
        client_response: response.trim(),
        client_responded_at: now,
        client_responded_by: profile.id,
      })
      .eq('id', decision.id);

    // Write activity log entry for audit trail
    await supabase.from('activity_log').insert({
      project_id: decision.project_id,
      user_id: profile.id,
      user_full_name: profile.full_name,
      user_role: 'CLIENT',
      action_type: 'Client Response Submitted',
      module: 'Client Decisions',
      related_record_id: decision.id,
      related_record_type: 'client_decisions',
      old_value: decision.status,
      new_value: 'Approved',
      notes: `Client response: ${response.trim().slice(0, 200)}`,
    });

    setSubmitted(s => ({ ...s, [decision.id]: true }));
    setExpanded(null);
    setSaving(null);
    load();
  }

  const pending = decisions.filter(d => d.status !== 'Approved' && !d.client_response);
  const responded = decisions.filter(d => d.status !== 'Approved' && d.client_response);
  const approved = decisions.filter(d => d.status === 'Approved');

  const getDisplayStatus = (d: ClientDecision) => {
    if (d.status === 'Approved') return 'Approved';
    if (isOverdue(d.needed_by_date)) return 'Overdue';
    if (d.status === 'Needs Decision') return 'Needs Decision';
    return 'Pending';
  };

  const q = search.trim().toLowerCase();
  const filteredPending = pending.filter(d => {
    const matchQ = !q || d.decision_title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
    const displayStatus = getDisplayStatus(d);
    const matchStatus = statusFilter === 'all' || displayStatus === statusFilter;
    return matchQ && matchStatus;
  });
  const filteredApproved = approved.filter(d =>
    !q || d.decision_title.toLowerCase().includes(q)
  );

  const overdueCount = pending.filter(d => isOverdue(d.needed_by_date)).length;
  const allPendingCount = pending.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Selections &amp; Decisions</span>
          {!loading && pending.length > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${overdueCount > 0 ? 'bg-red-600 text-white' : 'bg-steel-800 text-white'}`}>
              {pending.length}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-6 space-y-5">

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading decisions...</span>
          </div>
        ) : (pending.length + responded.length + approved.length) === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm py-16 text-center">
            <FileCheck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No decisions needed right now</p>
            <p className="text-xs text-slate-400 mt-1">Your DECKARC coordinator will add items here when your input is needed.</p>
          </div>
        ) : (
          <>
            {/* Search + filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search decisions..."
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Needs Decision">Needs Decision</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>

            {/* Pending decisions */}
            {pending.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Awaiting Your Input</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Your responses help keep the project on schedule.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="pl-5 pr-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Decision</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Needed By</th>
                        <th className="pl-3 pr-5 py-2.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPending.length === 0 ? (
                        <tr><td colSpan={4} className="py-8 text-center text-xs text-slate-400">No items match your search.</td></tr>
                      ) : filteredPending.map(d => {
                        const displayStatus = getDisplayStatus(d);
                        const cfg = STATUS_CFG[displayStatus] || STATUS_CFG['Pending'];
                        const isExpanded = expanded === d.id;
                        const isSubmitted = submitted[d.id];
                        const overdue = isOverdue(d.needed_by_date);
                        return (
                          <>
                            <tr
                              key={d.id}
                              className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}
                            >
                              <td className="pl-5 pr-3 py-3.5 whitespace-nowrap align-middle">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                                  {displayStatus}
                                </span>
                              </td>
                              <td className="px-3 py-3.5 align-middle">
                                <p className="text-sm font-medium text-slate-800">{d.decision_title}</p>
                                <p className="text-xs text-slate-500 mt-0.5 hidden sm:block max-w-xs truncate">{d.description}</p>
                                {d.project?.project_name && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">{d.project.project_name}</p>
                                )}
                                {d.time_impact_days > 0 && (
                                  <p className="text-[10px] text-amber-600 mt-0.5">
                                    Schedule impact: {d.time_impact_days} day{d.time_impact_days !== 1 ? 's' : ''} if delayed
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3.5 whitespace-nowrap align-middle hidden sm:table-cell">
                                <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                                  {fmtDate(d.needed_by_date) || 'ASAP'}
                                </span>
                              </td>
                              <td className="pl-3 pr-5 py-3.5 whitespace-nowrap align-middle text-right">
                                {isSubmitted ? (
                                  <span className="text-[11px] text-green-600 font-semibold flex items-center justify-end gap-1">
                                    <CheckCircle className="w-3.5 h-3.5" /> Submitted
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setExpanded(isExpanded ? null : d.id)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-all"
                                  >
                                    {isExpanded ? 'Close' : 'Respond'}
                                  </button>
                                )}
                              </td>
                            </tr>

                            {isExpanded && !isSubmitted && (
                              <tr key={`${d.id}-expand`} className="border-b border-slate-100 bg-slate-50">
                                <td colSpan={4} className="pl-5 pr-5 pt-2 pb-4">
                                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">{d.description}</p>
                                  {d.client_visible_note && (
                                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
                                      <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                                      <p className="text-xs text-blue-700">{d.client_visible_note}</p>
                                    </div>
                                  )}
                                  <textarea
                                    value={responses[d.id] || ''}
                                    onChange={e => setResponses(r => ({ ...r, [d.id]: e.target.value }))}
                                    placeholder="Type your response or selection here..."
                                    rows={3}
                                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none mb-3 text-slate-700 placeholder:text-slate-400"
                                  />
                                  {responses[d.id]?.trim() && (
                                    <button
                                      onClick={() => submitResponse(d)}
                                      disabled={saving === d.id}
                                      className="flex items-center gap-1.5 text-xs font-semibold bg-steel-800 text-white px-4 py-2 rounded-lg hover:bg-steel-700 transition-colors disabled:opacity-50"
                                    >
                                      {saving === d.id
                                        ? <Loader className="w-3 h-3 animate-spin" />
                                        : <Send className="w-3 h-3" />}
                                      Submit Response
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Responded — awaiting admin confirmation */}
            {responded.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Response Submitted — Awaiting Confirmation</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Your response was received. Your coordinator will confirm shortly.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="pl-5 pr-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Decision</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">Your Response</th>
                        <th className="pl-3 pr-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {responded.map(d => (
                        <tr key={d.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                          <td className="pl-5 pr-3 py-3.5 align-middle">
                            <p className="text-sm font-medium text-slate-700">{d.decision_title}</p>
                            {d.project?.project_name && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{d.project.project_name}</p>
                            )}
                          </td>
                          <td className="px-3 py-3.5 align-middle hidden sm:table-cell">
                            <p className="text-xs text-slate-600 max-w-xs truncate">{d.client_response}</p>
                          </td>
                          <td className="pl-3 pr-5 py-3.5 align-middle whitespace-nowrap">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                              Awaiting Confirmation
                            </span>
                            {d.client_responded_at && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(d.client_responded_at.split('T')[0])}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Approved decisions */}
            {approved.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Confirmed Decisions</h2>
                  <p className="text-xs text-slate-400 mt-0.5">These have been confirmed and locked in.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="pl-5 pr-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Decision</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">Project</th>
                        <th className="pl-3 pr-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApproved.map(d => (
                        <tr key={d.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                          <td className="pl-5 pr-3 py-3.5 align-middle">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-slate-700 block truncate">{d.decision_title}</span>
                                {d.client_visible_note && (
                                  <span className="text-xs text-slate-400 truncate block max-w-xs">{d.client_visible_note}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 align-middle hidden sm:table-cell">
                            <span className="text-xs text-slate-500">{d.project?.project_name || '—'}</span>
                          </td>
                          <td className="pl-3 pr-5 py-3.5 align-middle whitespace-nowrap">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                              Approved
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-2 justify-center text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <p>All responses are reviewed by your DECKARC coordinator before being confirmed.</p>
        </div>
      </div>
    </div>
  );
}
