import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, X, ChevronDown, RefreshCw, Loader2, AlertCircle,
  Eye, Edit3, Copy, Archive, MessageSquare, BarChart3, Inbox,
} from 'lucide-react';
import {
  OUTCOMES, OUTCOME_BADGE_STYLES, STATUS_BADGE_STYLES,
  CURRENT_SOFTWARE_OPTIONS,
  type DiscoverySession,
} from '../components/customerDiscovery/types';
import {
  Badge, fmtDate, daysUntil,
  followUpStatusClass, followUpStatusLabel,
} from '../components/customerDiscovery/ui';
import AnalyticsView from '../components/customerDiscovery/AnalyticsView';
import Modal from '../components/Modal';

interface Props {
  onNewSession: () => void;
  onViewSession: (id: string) => void;
  onEditSession: (id: string) => void;
}

export default function CustomerDiscoveryListPage({ onNewSession, onViewSession, onEditSession }: Props) {
  const [sessions, setSessions] = useState<DiscoverySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'analytics'>('list');

  // Filters
  const [search, setSearch] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterPresenter, setFilterPresenter] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterFollowUp, setFilterFollowUp] = useState('');
  const [filterSoftware, setFilterSoftware] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Duplicate modal
  const [dupSource, setDupSource] = useState<DiscoverySession | null>(null);
  const [dupCompany, setDupCompany] = useState('');
  const [dupContact, setDupContact] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let q = supabase.from('customer_discovery_sessions').select('*');
    if (!showArchived) {
      q = q.is('archived_at', null);
    }
    q = q.order('demo_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    const { data, error: err } = await q;
    if (err) {
      setError('Unable to load demo sessions.');
      setLoading(false);
      return;
    }
    setSessions((data ?? []) as DiscoverySession[]);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  const presenters = Array.from(new Set(sessions.map(s => s.presenter).filter(Boolean)));

  const filtered = sessions.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.company_name?.toLowerCase().includes(q) && !s.contact_name?.toLowerCase().includes(q)) return false;
    }
    if (filterOutcome && s.outcome !== filterOutcome) return false;
    if (filterPresenter && s.presenter !== filterPresenter) return false;
    if (filterDateFrom && s.demo_date && s.demo_date < filterDateFrom) return false;
    if (filterDateTo && s.demo_date && s.demo_date > filterDateTo) return false;
    if (filterFollowUp === 'required' && !s.follow_up_required) return false;
    if (filterFollowUp === 'overdue' && !(s.follow_up_required && !s.follow_up_completed && (daysUntil(s.follow_up_date) ?? 1) < 0)) return false;
    if (filterFollowUp === 'upcoming' && !(s.follow_up_required && !s.follow_up_completed && (daysUntil(s.follow_up_date) ?? 99) >= 0 && (daysUntil(s.follow_up_date) ?? 99) <= 3)) return false;
    if (filterSoftware && !s.current_software.includes(filterSoftware)) return false;
    return true;
  });

  // Summary cards
  const total = sessions.filter(s => !s.archived_at).length;
  const strongInterest = sessions.filter(s => !s.archived_at && s.outcome === 'Strong Interest').length;
  const followUpsRequired = sessions.filter(s => !s.archived_at && s.follow_up_required && !s.follow_up_completed).length;
  const ratedSessions = sessions.filter(s => !s.archived_at && s.overall_rating > 0);
  const avgRating = ratedSessions.length > 0
    ? (ratedSessions.reduce((sum, s) => sum + s.overall_rating, 0) / ratedSessions.length).toFixed(1)
    : '—';

  const hasFilters = search || filterOutcome || filterPresenter || filterDateFrom || filterDateTo || filterFollowUp || filterSoftware;

  async function duplicate(s: DiscoverySession) {
    setDupSource(s);
    setDupCompany(`${s.company_name} (Copy)`);
    setDupContact(s.contact_name);
  }

  async function confirmDuplicate() {
    if (!dupSource) return;
    const { id, created_at, updated_at, archived_at, ...rest } = dupSource;
    const payload = {
      ...rest,
      company_name: dupCompany,
      contact_name: dupContact,
      status: 'Draft' as const,
      archived_at: null,
      follow_up_required: false,
      follow_up_date: null,
      follow_up_owner: '',
      follow_up_completed: false,
      ai_summary: '',
      task_completion_rate: 0,
      tasks_needing_help: 0,
      average_confusion_level: '',
    };
    const { data, error: err } = await supabase
      .from('customer_discovery_sessions')
      .insert(payload)
      .select('id')
      .single();
    if (err || !data) return;
    // copy observations
    const { data: obs } = await supabase.from('customer_discovery_observations').select('*').eq('session_id', id);
    if (obs && obs.length > 0) {
      await supabase.from('customer_discovery_observations').insert(
        obs.map((o: any) => ({
          session_id: data.id,
          sort_order: o.sort_order,
          task_name: o.task_name,
          completed: o.completed,
          needed_help: o.needed_help,
          time_taken: o.time_taken,
          confusion_level: o.confusion_level,
          observer_notes: o.observer_notes,
        }))
      );
    }
    // copy feature requests
    const { data: frs } = await supabase.from('customer_discovery_feature_requests').select('*').eq('session_id', id);
    if (frs && frs.length > 0) {
      await supabase.from('customer_discovery_feature_requests').insert(
        frs.map((f: any) => ({
          session_id: data.id,
          sort_order: f.sort_order,
          request_text: f.request_text,
          underlying_problem: f.underlying_problem,
          product_area: f.product_area,
          importance: f.importance,
          frequency: f.frequency,
          admin_notes: f.admin_notes,
        }))
      );
    }
    // log activity
    await supabase.from('customer_discovery_activities').insert({
      session_id: data.id,
      activity_type: 'created',
      description: 'Session duplicated',
    });
    setDupSource(null);
    load();
    onEditSession(data.id);
  }

  async function archive(s: DiscoverySession) {
    await supabase.from('customer_discovery_sessions').update({ archived_at: new Date().toISOString(), status: 'Archived' }).eq('id', s.id);
    await supabase.from('customer_discovery_activities').insert({
      session_id: s.id,
      activity_type: 'archived',
      description: 'Session archived',
    });
    load();
  }

  const SEL = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-colors appearance-none cursor-pointer';

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-[1200px] mx-auto px-5 py-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Discovery</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Capture what contractors understand, where they struggle, and what they are willing to pay for.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView(view === 'list' ? 'analytics' : 'list')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-800 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              {view === 'list' ? <BarChart3 className="w-3.5 h-3.5" /> : <Inbox className="w-3.5 h-3.5" />}
              {view === 'list' ? 'Analytics' : 'Sessions'}
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-800 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onNewSession}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Demo Session
            </button>
          </div>
        </div>

        {view === 'analytics' ? (
          <AnalyticsView sessions={sessions} />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Demo Sessions', value: total, color: 'text-slate-900' },
                { label: 'Strong Interest', value: strongInterest, color: 'text-emerald-700' },
                { label: 'Follow-ups Required', value: followUpsRequired, color: 'text-amber-700' },
                { label: 'Average Usability Rating', value: avgRating, color: 'text-blue-700' },
              ].map(card => (
                <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
                  <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-tight">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filters</span>
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(''); setFilterOutcome(''); setFilterPresenter(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterFollowUp(''); setFilterSoftware(''); }}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search company or contact..."
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-colors"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className={SEL + ' pr-7'}>
                    <option value="">All Outcomes</option>
                    {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={filterPresenter} onChange={e => setFilterPresenter(e.target.value)} className={SEL + ' pr-7'}>
                    <option value="">All Presenters</option>
                    {presenters.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className={SEL} />
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className={SEL} />
                <div className="relative">
                  <select value={filterFollowUp} onChange={e => setFilterFollowUp(e.target.value)} className={SEL + ' pr-7'}>
                    <option value="">All Follow-ups</option>
                    <option value="required">Required</option>
                    <option value="overdue">Overdue</option>
                    <option value="upcoming">Due ≤3 days</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={filterSoftware} onChange={e => setFilterSoftware(e.target.value)} className={SEL + ' pr-7'}>
                    <option value="">All Software</option>
                    {CURRENT_SOFTWARE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600 px-2">
                  <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
                  Show Archived
                </label>
              </div>
            </div>

            {/* Results count */}
            {!loading && !error && (
              <div className="text-xs text-slate-400 mb-3 px-0.5">
                {filtered.length === total
                  ? `${total} session${total !== 1 ? 's' : ''}`
                  : `${filtered.length} of ${total} sessions`}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading demo sessions...</p>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">{error}</p>
                  <button onClick={load} className="text-xs text-red-600 underline mt-1 hover:text-red-700">Try again</button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  {hasFilters ? 'No sessions match your filters.' : 'No demo sessions yet.'}
                </p>
                {!hasFilters && (
                  <>
                    <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
                      Start with your first contractor demo and document what they understand, where they struggle, and what they value.
                    </p>
                    <button
                      onClick={onNewSession}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create First Demo Session
                    </button>
                  </>
                )}
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(''); setFilterOutcome(''); setFilterPresenter(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterFollowUp(''); setFilterSoftware(''); }}
                    className="text-xs text-amber-600 hover:text-amber-700 mt-1"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {/* Desktop table */}
            {!loading && !error && filtered.length > 0 && (
              <>
                <div className="hidden lg:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="text-sm" style={{ minWidth: '1100px', width: '100%' }}>
                      <thead>
                        <tr className="border-b border-slate-100">
                          {['Company', 'Contact', 'Demo Date', 'Presenter', 'Active Projects', 'Current Software', 'Rating', 'Outcome', 'Follow-up', 'Actions'].map((h, i) => (
                            <th key={h} className={`text-left px-4 py-3 ${i === 0 ? 'pl-5' : ''} text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 9 ? 'pr-5 bg-white' : ''}`} style={i === 9 ? { position: 'sticky', right: 0, boxShadow: '-4px 0 8px -2px rgba(0,0,0,0.06)', zIndex: 10 } : undefined}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filtered.map(s => {
                          const fuDays = daysUntil(s.follow_up_date);
                          const fuOverdue = s.follow_up_required && !s.follow_up_completed && fuDays !== null && fuDays < 0;
                          const fuSoon = s.follow_up_required && !s.follow_up_completed && fuDays !== null && fuDays >= 0 && fuDays <= 3;
                          return (
                            <tr
                              key={s.id}
                              onClick={() => onViewSession(s.id)}
                              className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3 pl-5 text-[13px] font-medium text-slate-900 whitespace-nowrap" style={{ maxWidth: 140 }}>
                                <div className="truncate" title={s.company_name}>{s.company_name}</div>
                                {s.status === 'Draft' && <Badge label="Draft" className="bg-slate-100 text-slate-500 border-slate-200 mt-0.5" />}
                                {s.archived_at && <Badge label="Archived" className="bg-slate-200 text-slate-500 border-slate-300 mt-0.5" />}
                              </td>
                              <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap" style={{ maxWidth: 130 }}>
                                <div className="truncate" title={s.contact_name}>{s.contact_name}</div>
                              </td>
                              <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">{fmtDate(s.demo_date)}</td>
                              <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap" style={{ maxWidth: 120 }}>
                                <div className="truncate" title={s.presenter}>{s.presenter || '—'}</div>
                              </td>
                              <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap text-center">{s.active_projects || '—'}</td>
                              <td className="px-4 py-3 text-[13px] text-slate-600" style={{ maxWidth: 130 }}>
                                <div className="truncate whitespace-nowrap" title={s.current_software.join(', ') || undefined}>
                                  {s.current_software.length > 0 ? s.current_software.join(', ') : '—'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">
                                {s.overall_rating > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <span className="text-amber-500">{'★'.repeat(s.overall_rating)}</span>
                                    <span className="text-slate-400 text-xs">{s.overall_rating}/5</span>
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {s.outcome ? <Badge label={s.outcome} className={OUTCOME_BADGE_STYLES[s.outcome] ?? 'bg-slate-100 text-slate-500 border-slate-200'} /> : <span className="text-slate-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {s.follow_up_required ? (
                                  <Badge
                                    label={followUpStatusLabel(s.follow_up_required, s.follow_up_completed, s.follow_up_date)}
                                    className={followUpStatusClass(s.follow_up_required, s.follow_up_completed, s.follow_up_date)}
                                  />
                                ) : <span className="text-slate-400 text-xs">—</span>}
                              </td>
                              <td
                                className="px-4 py-3 pr-5 whitespace-nowrap bg-white"
                                style={{ position: 'sticky', right: 0, boxShadow: '-4px 0 8px -2px rgba(0,0,0,0.06)', zIndex: 10 }}
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1">
                                  <button onClick={() => onViewSession(s.id)} title="View" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => onEditSession(s.id)} title="Edit" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => duplicate(s)} title="Duplicate" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  {!s.archived_at && (
                                    <button onClick={() => archive(s)} title="Archive" className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                      <Archive className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="lg:hidden space-y-3">
                  {filtered.map(s => (
                    <div key={s.id} onClick={() => onViewSession(s.id)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-[15px] leading-tight truncate">{s.company_name}</p>
                          <p className="text-sm text-slate-500 mt-0.5 truncate">{s.contact_name}</p>
                        </div>
                        {s.outcome && <Badge label={s.outcome} className={OUTCOME_BADGE_STYLES[s.outcome] ?? 'bg-slate-100 text-slate-500 border-slate-200'} />}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 text-[13px]">
                        <div className="text-slate-600"><span className="text-slate-400">Date:</span> {fmtDate(s.demo_date)}</div>
                        <div className="text-slate-600"><span className="text-slate-400">Rating:</span> {s.overall_rating > 0 ? `${s.overall_rating}/5` : '—'}</div>
                        <div className="text-slate-600"><span className="text-slate-400">Projects:</span> {s.active_projects || '—'}</div>
                        <div className="text-slate-600 truncate"><span className="text-slate-400">Software:</span> {s.current_software.length > 0 ? s.current_software[0] : '—'}</div>
                      </div>
                      {s.follow_up_required && (
                        <div className="mb-3">
                          <Badge label={followUpStatusLabel(s.follow_up_required, s.follow_up_completed, s.follow_up_date)} className={followUpStatusClass(s.follow_up_required, s.follow_up_completed, s.follow_up_date)} />
                        </div>
                      )}
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onEditSession(s.id)} className="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors">
                          Edit
                        </button>
                        <button onClick={() => duplicate(s)} className="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors">
                          Duplicate
                        </button>
                        {!s.archived_at && (
                          <button onClick={() => archive(s)} className="text-xs font-medium text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-600 px-2.5 py-1.5 rounded-lg transition-colors">
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Duplicate modal */}
      {dupSource && (
        <Modal title="Duplicate Demo Session" onClose={() => setDupSource(null)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Creates a new draft session copied from <span className="font-semibold">{dupSource.company_name}</span>. Observations and feature requests are copied. Follow-up and AI summary are reset.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Company Name</label>
                <input value={dupCompany} onChange={e => setDupCompany(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Contact Name</label>
                <input value={dupContact} onChange={e => setDupContact(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setDupSource(null)} className="text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={confirmDuplicate} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3.5 py-2 rounded-lg transition-colors">
                <Copy className="w-3.5 h-3.5" />
                Create Copy
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
