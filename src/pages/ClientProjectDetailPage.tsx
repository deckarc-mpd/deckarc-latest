import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { normalizePaymentStatus } from '../components/project/PaymentsTab';
import {
  ArrowLeft, Home, ListChecks, CheckSquare, Newspaper,
  CalendarDays, FileCheck, FolderOpen, CreditCard, MessageSquare,
  MapPin, Calendar, CheckCircle, Clock, AlertTriangle, Info,
  Send, Loader, DollarSign, TrendingUp, Image, FileText, Eye,
  ChevronDown, ShieldCheck, ShieldOff, ShieldAlert,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  project_name: string;
  project_type: string | null;
  status: string;
  progress_percentage: number;
  start_date: string | null;
  expected_finish_date: string | null;
  projected_finish_date: string | null;
  city: string | null;
  state: string | null;
  client_visible_notes: string | null;
  description: string | null;
  permits_applicability: string | null;
}

interface ClientPermit {
  id: string;
  permit_type: string;
  permit_status: string;
  client_message: string | null;
}

interface ClientInspection {
  id: string;
  inspection_type: string;
  result: string | null;
  inspection_status: string | null;
}

interface Task {
  id: string;
  task_name: string;
  category: string;
  status: string;
  progress_percentage: number;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  projected_finish_date: string | null;
  actual_finish_date: string | null;
  client_visible_notes: string;
  delay_days: number;
}

interface ClientDecision {
  id: string;
  decision_title: string;
  description: string;
  needed_by_date: string | null;
  status: string;
  time_impact_days: number;
  client_visible_note: string;
  client_response: string;
  client_responded_at: string | null;
}

interface DelayReason {
  id: string;
  client_safe_reason: string;
  estimated_delay_days: number;
  revised_projected_completion: string | null;
  created_at: string;
}

interface PaymentMilestone {
  id: string;
  milestone_name: string;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: string;
}

interface ProjectFile {
  id: string;
  file_name: string;
  file_type: string;
  document_category: string;
  file_description: string | null;
  uploaded_at: string;
  storage_path_or_placeholder: string | null;
}

interface Message {
  id: string;
  sender_role: string;
  message_body: string;
  visibility: string;
  created_at: string;
}

type Section =
  | 'overview'
  | 'milestones'
  | 'decisions'
  | 'update'
  | 'schedule'
  | 'selections'
  | 'files'
  | 'payments'
  | 'messages';

// ─── Shared small helpers ─────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined, includeYear = false) {
  if (!d) return null;
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function fmtCurrency(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="w-10 h-10 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{body}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Task status helpers ──────────────────────────────────────────────────────

function normTaskStatus(s: string) {
  if (s === 'Completed' || s === 'Done') return 'Completed';
  if (s === 'In Progress') return 'In Progress';
  if (s === 'Delayed') return 'Delayed';
  if (s === 'Blocked') return 'Blocked';
  if (s === 'Waiting') return 'Waiting';
  return 'Not Started';
}

const TASK_PILL: Record<string, string> = {
  'Completed':   'bg-green-50 text-green-700 border-green-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Delayed':     'bg-amber-50 text-amber-700 border-amber-200',
  'Blocked':     'bg-red-50 text-red-700 border-red-200',
  'Waiting':     'bg-slate-50 text-slate-500 border-slate-200',
  'Not Started': 'bg-slate-50 text-slate-400 border-slate-200',
};

// ─── Sub-section components ───────────────────────────────────────────────────

const CLIENT_SAFE_PERMIT_STATUSES = new Set([
  'Not Started', 'Submitted', 'Approved', 'Inspection Scheduled', 'Passed',
]);

function permitStatusPill(status: string) {
  if (status === 'Approved' || status === 'Passed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Submitted' || status === 'Inspection Scheduled') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-50 text-slate-500 border-slate-200';
}

// Maps raw inspection statuses to client-safe display labels
function inspectionClientLabel(raw: string | null): string {
  const s = raw || 'Not Scheduled';
  if (s === 'Passed' || s === 'Reinspection Passed') return 'Passed';
  if (s === 'Scheduled' || s === 'Reinspection Scheduled') return 'Scheduled';
  if (s === 'Requested' || s === 'Reinspection Required') return 'Scheduled';
  if (s === 'Failed' || s === 'Correction Required') return 'Correction Needed';
  return 'Pending';
}

function inspectionPill(label: string) {
  if (label === 'Passed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (label === 'Scheduled') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (label === 'Correction Needed') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-400 border-slate-200';
}

function PermitsCard({ applicability, permits, inspections }: {
  applicability: string | null;
  permits: ClientPermit[];
  inspections: ClientInspection[];
}) {
  const val = applicability || 'To Be Confirmed';

  if (val === 'Not Applicable') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ShieldOff className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Permits &amp; Inspections</p>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Permits &amp; Inspections are not applicable for this project.
        </p>
      </div>
    );
  }

  if (val === 'To Be Confirmed') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-slate-700">Permits &amp; Inspections</p>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Permit requirements are being reviewed for this project.
        </p>
      </div>
    );
  }

  // Applicable — build inspection summary
  const visiblePermits = permits.filter(p => CLIENT_SAFE_PERMIT_STATUSES.has(p.permit_status));

  const total     = inspections.length;
  const passed    = inspections.filter(i => inspectionClientLabel(i.result ?? i.inspection_status) === 'Passed').length;
  const scheduled = inspections.filter(i => inspectionClientLabel(i.result ?? i.inspection_status) === 'Scheduled').length;
  const correction = inspections.filter(i => inspectionClientLabel(i.result ?? i.inspection_status) === 'Correction Needed').length;
  const pending   = total - passed - scheduled - correction;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <p className="text-sm font-semibold text-slate-700">Permits &amp; Inspections</p>
      </div>

      <p className="text-sm text-slate-500 mb-4 leading-relaxed">
        Permit requirements apply to this project.
      </p>

      {/* Permit list */}
      {visiblePermits.length > 0 && (
        <div className="space-y-2 mb-4">
          {visiblePermits.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
              <p className="text-xs text-slate-700 font-medium truncate">{p.permit_type || 'Permit'}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${permitStatusPill(p.permit_status)}`}>
                {p.permit_status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Inspection summary */}
      {total === 0 ? (
        <p className="text-xs text-slate-400 leading-relaxed">
          Inspection schedule will be shared once confirmed.
        </p>
      ) : (
        <>
          {/* Count chips */}
          <div className="border-t border-slate-100 pt-3 mb-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Inspection Summary</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-slate-700">{total}</p>
                <p className="text-[10px] text-slate-400">Required</p>
              </div>
              <div className="bg-emerald-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-emerald-700">{passed}</p>
                <p className="text-[10px] text-emerald-600">Passed</p>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-blue-700">{scheduled}</p>
                <p className="text-[10px] text-blue-600">Scheduled</p>
              </div>
              {correction > 0 ? (
                <div className="bg-amber-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-lg font-bold text-amber-700">{correction}</p>
                  <p className="text-[10px] text-amber-600">Needs Recheck</p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-lg font-bold text-slate-500">{pending}</p>
                  <p className="text-[10px] text-slate-400">Pending</p>
                </div>
              )}
            </div>
          </div>

          {/* Individual inspection list */}
          <div className="space-y-1.5">
            {inspections.map(i => {
              const label = inspectionClientLabel(i.result ?? i.inspection_status);
              return (
                <div key={i.id} className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 truncate">{i.inspection_type || 'Inspection'}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${inspectionPill(label)}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function OverviewSection({ project, delays, permits, inspections }: { project: Project; delays: DelayReason[]; permits: ClientPermit[]; inspections: ClientInspection[] }) {
  const finishDate = project.projected_finish_date || project.expected_finish_date;
  const isDelayed = project.projected_finish_date && project.expected_finish_date
    && project.projected_finish_date !== project.expected_finish_date;

  const barColor = project.status === 'Delayed' ? 'bg-amber-400'
    : project.status === 'Completed' ? 'bg-green-500' : 'bg-steel-500';

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Project Status</p>
            <p className="text-2xl font-bold text-slate-800">{project.progress_percentage}%</p>
            <p className="text-xs text-slate-500 mt-0.5">Overall completion</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap
            ${project.status === 'Delayed'     ? 'bg-amber-100 text-amber-700' :
              project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
              project.status === 'Completed'   ? 'bg-green-100 text-green-700' :
                                                 'bg-slate-100 text-slate-600'}`}>
            {project.status}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${project.progress_percentage}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          {project.start_date && (
            <div>
              <p className="text-slate-400">Start Date</p>
              <p className="font-medium text-slate-700 mt-0.5">{fmtDate(project.start_date, true)}</p>
            </div>
          )}
          {finishDate && (
            <div>
              <p className="text-slate-400">Est. Completion</p>
              {isDelayed ? (
                <div className="mt-0.5">
                  <p className="line-through text-slate-300">{fmtDate(project.expected_finish_date, true)}</p>
                  <p className="font-semibold text-amber-600">{fmtDate(project.projected_finish_date, true)}</p>
                </div>
              ) : (
                <p className="font-medium text-slate-700 mt-0.5">{fmtDate(finishDate, true)}</p>
              )}
            </div>
          )}
          {(project.city || project.state) && (
            <div>
              <p className="text-slate-400">Location</p>
              <p className="font-medium text-slate-700 mt-0.5 flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {project.city}{project.city && project.state ? ', ' : ''}{project.state}
              </p>
            </div>
          )}
          {project.project_type && (
            <div>
              <p className="text-slate-400">Project Type</p>
              <p className="font-medium text-slate-700 mt-0.5">{project.project_type}</p>
            </div>
          )}
        </div>
      </div>

      {/* Client notes */}
      {project.client_visible_notes && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm text-slate-600 leading-relaxed">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Note from your coordinator</p>
          {project.client_visible_notes}
        </div>
      )}

      {/* Recent schedule updates */}
      {delays.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">Schedule Update</p>
          </div>
          {delays.slice(0, 2).map(d => (
            <div key={d.id} className="px-4 py-3.5 border-b border-amber-100 last:border-b-0">
              <p className="text-sm text-amber-900 leading-relaxed">{d.client_safe_reason}</p>
              {d.revised_projected_completion && (
                <p className="text-xs text-amber-700 mt-1">
                  Revised completion: <span className="font-semibold">{fmtDate(d.revised_projected_completion, true)}</span>
                  {d.estimated_delay_days > 0 && ` (+${d.estimated_delay_days} day${d.estimated_delay_days !== 1 ? 's' : ''})`}
                </p>
              )}
              <p className="text-[10px] text-amber-600 mt-1">{fmtDate(d.created_at)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Permits & Inspections card */}
      <PermitsCard applicability={project.permits_applicability} permits={permits} inspections={inspections} />
    </div>
  );
}

function MilestonesSection({ tasks }: { tasks: Task[] }) {
  const clientTasks = tasks.filter(t => true); // already filtered is_client_visible from query
  const completed = clientTasks.filter(t => normTaskStatus(t.status) === 'Completed').length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Project Milestones"
        subtitle={`${completed} of ${clientTasks.length} milestones completed`}
      />

      {clientTasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="No milestones yet" body="Your project coordinator will add milestones here once they're set up." />
      ) : (
        <>
          {/* Progress bar */}
          {clientTasks.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600">Overall Progress</p>
                <p className="text-xs font-semibold text-slate-500 tabular-nums">
                  {Math.round((completed / clientTasks.length) * 100)}%
                </p>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-steel-500 rounded-full transition-all"
                  style={{ width: `${Math.round((completed / clientTasks.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            {clientTasks.map(t => {
              const norm = normTaskStatus(t.status);
              const pill = TASK_PILL[norm] || TASK_PILL['Not Started'];
              const isActive = norm === 'In Progress';
              const isDelayed = norm === 'Delayed' || t.delay_days > 0;

              return (
                <div
                  key={t.id}
                  className={`bg-white border rounded-xl px-4 py-3.5 shadow-sm ${
                    isActive ? 'border-blue-200 bg-blue-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className={`text-sm font-medium ${norm === 'Completed' ? 'text-slate-400' : 'text-slate-800'}`}>
                          {t.task_name}
                        </p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pill}`}>
                          {norm}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                        {t.category && <span>{t.category}</span>}
                        {(t.projected_finish_date || t.planned_finish_date) && (
                          <span className={isDelayed ? 'text-amber-600' : ''}>
                            Est. {fmtDate(t.projected_finish_date || t.planned_finish_date, true)}
                          </span>
                        )}
                        {t.actual_finish_date && norm === 'Completed' && (
                          <span className="text-green-600">Completed {fmtDate(t.actual_finish_date, true)}</span>
                        )}
                      </div>
                      {t.client_visible_notes && (
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{t.client_visible_notes}</p>
                      )}
                    </div>
                    {norm === 'Completed' && (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DecisionsSection({ decisions, projectId, onResponded, previewMode = false }: {
  decisions: ClientDecision[];
  projectId: string;
  onResponded: () => void;
  previewMode?: boolean;
}) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const pending = decisions.filter(d => d.status !== 'Approved' && !d.client_response);
  const awaiting = decisions.filter(d => d.status !== 'Approved' && d.client_response);
  const approved = decisions.filter(d => d.status === 'Approved');

  async function submit(d: ClientDecision) {
    const response = responses[d.id];
    if (!response?.trim() || !profile) return;
    setSaving(d.id);
    const now = new Date().toISOString();
    await supabase.from('client_decisions').update({
      status: 'Approved',
      client_response: response.trim(),
      client_responded_at: now,
      client_responded_by: profile.id,
    }).eq('id', d.id);
    await supabase.from('activity_log').insert({
      project_id: projectId,
      user_id: profile.id,
      user_full_name: profile.full_name,
      user_role: 'CLIENT',
      action_type: 'Client Response Submitted',
      module: 'Client Decisions',
      related_record_id: d.id,
      related_record_type: 'client_decisions',
      old_value: d.status,
      new_value: 'Approved',
      notes: `Client response: ${response.trim().slice(0, 200)}`,
    });
    setSubmitted(s => ({ ...s, [d.id]: true }));
    setExpanded(null);
    setSaving(null);
    onResponded();
  }

  function isOverdue(dateStr: string | null) {
    if (!dateStr) return false;
    return new Date(dateStr + 'T00:00:00') < new Date();
  }

  if (decisions.length === 0) {
    return (
      <>
        <SectionHeader title="Decisions & Selections" subtitle="Items that need your response" />
        <EmptyState icon={CheckSquare} title="No decisions needed right now" body="Your coordinator will add items here when your input is required." />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Decisions & Selections" subtitle={`${pending.length} awaiting your response`} />

      {/* Pending */}
      {pending.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Awaiting Your Input</p>
          </div>
          <div className="divide-y divide-slate-100">
            {pending.map(d => {
              const overdue = isOverdue(d.needed_by_date);
              const isExpanded = expanded === d.id;
              const isDone = submitted[d.id];
              return (
                <div key={d.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{d.decision_title}</p>
                      {d.needed_by_date && (
                        <p className={`text-xs mt-0.5 flex items-center gap-1 ${overdue ? 'text-red-600' : 'text-slate-400'}`}>
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {overdue ? 'Overdue — ' : 'Needed by '}
                          {fmtDate(d.needed_by_date, true)}
                        </p>
                      )}
                      {d.time_impact_days > 0 && (
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          Schedule impact: {d.time_impact_days} day{d.time_impact_days !== 1 ? 's' : ''} if delayed
                        </p>
                      )}
                    </div>
                    {!isDone && !previewMode && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : d.id)}
                        className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-all"
                      >
                        {isExpanded ? 'Close' : 'Respond'}
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    {!isDone && previewMode && (
                      <span className="text-[10px] text-slate-400 italic">Disabled in preview</span>
                    )}
                    {isDone && (
                      <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Sent
                      </span>
                    )}
                  </div>

                  {isExpanded && !isDone && !previewMode && (
                    <div className="mt-3 space-y-2.5">
                      <p className="text-xs text-slate-600 leading-relaxed">{d.description}</p>
                      {d.client_visible_note && (
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700">{d.client_visible_note}</p>
                        </div>
                      )}
                      <textarea
                        value={responses[d.id] || ''}
                        onChange={e => setResponses(r => ({ ...r, [d.id]: e.target.value }))}
                        placeholder="Type your response or selection here..."
                        rows={3}
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none text-slate-700 placeholder:text-slate-400"
                      />
                      {responses[d.id]?.trim() && (
                        <button
                          onClick={() => submit(d)}
                          disabled={saving === d.id}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-steel-800 text-white px-4 py-2 rounded-lg hover:bg-steel-700 transition-colors disabled:opacity-50"
                        >
                          {saving === d.id ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Submit Response
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Awaiting confirmation */}
      {awaiting.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Response Submitted — Awaiting Confirmation</p>
          </div>
          <div className="divide-y divide-slate-100">
            {awaiting.map(d => (
              <div key={d.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{d.decision_title}</p>
                  {d.client_responded_at && (
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDate(d.client_responded_at)}</p>
                  )}
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                  Awaiting Confirmation
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Confirmed Decisions</p>
          </div>
          <div className="divide-y divide-slate-100">
            {approved.map(d => (
              <div key={d.id} className="px-4 py-3.5 flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-sm text-slate-600 flex-1 min-w-0 truncate">{d.decision_title}</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 flex-shrink-0">
                  Approved
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectUpdateSection({ project, delays }: { project: Project; delays: DelayReason[] }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Project Update" subtitle="Latest updates from your coordinator" />

      {/* Status snapshot */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d1e36 0%, #1e3f6e 100%)' }}>
            <Newspaper className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Current Status</p>
            <p className="text-xs text-slate-400">{project.project_name}</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-xs text-slate-500">Progress</span>
            <span className="text-xs font-semibold text-slate-700">{project.progress_percentage}%</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-xs text-slate-500">Status</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border
              ${project.status === 'Delayed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {project.status}
            </span>
          </div>
          {(project.projected_finish_date || project.expected_finish_date) && (
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-slate-500">Est. Completion</span>
              <span className="text-xs font-semibold text-slate-700">
                {fmtDate(project.projected_finish_date || project.expected_finish_date, true)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Coordinator note */}
      {project.client_visible_notes && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Note from your coordinator</p>
          <p className="text-sm text-slate-600 leading-relaxed">{project.client_visible_notes}</p>
        </div>
      )}

      {/* Schedule updates / delays */}
      {delays.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700">No schedule changes — your project is on track.</p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">Schedule Updates ({delays.length})</p>
          </div>
          <div className="divide-y divide-amber-100">
            {delays.map(d => (
              <div key={d.id} className="px-4 py-3.5">
                <p className="text-sm text-amber-900 leading-relaxed">{d.client_safe_reason}</p>
                {d.revised_projected_completion && (
                  <p className="text-xs text-amber-700 mt-1">
                    Revised completion: <span className="font-semibold">{fmtDate(d.revised_projected_completion, true)}</span>
                    {d.estimated_delay_days > 0 && ` (+${d.estimated_delay_days} days)`}
                  </p>
                )}
                <p className="text-[10px] text-amber-600 mt-1">{fmtDate(d.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleSection({ tasks, project }: { tasks: Task[]; project: Project }) {
  const activeTask = tasks.find(t => normTaskStatus(t.status) === 'In Progress');
  const completed = tasks.filter(t => normTaskStatus(t.status) === 'Completed').length;

  return (
    <div className="space-y-4">
      <SectionHeader title="Schedule" subtitle="Project timeline and milestones" />

      {tasks.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No schedule yet" body="Your project timeline will appear here once milestones are set up by your coordinator." />
      ) : (
        <>
          {/* Active phase callout */}
          {activeTask && (
            <div className="rounded-xl px-5 py-4 flex items-center gap-4"
              style={{ background: 'linear-gradient(135deg, #0d1e36 0%, #1e3f6e 100%)', boxShadow: '0 4px 20px rgba(13,30,54,0.25)' }}>
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Currently In Progress</p>
                <p className="text-sm font-bold text-white truncate">{activeTask.task_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeTask.progress_percentage}% complete
                  {activeTask.planned_finish_date && ` · Est. ${fmtDate(activeTask.planned_finish_date, true)}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-bold text-white">{completed}/{tasks.length}</p>
                <p className="text-[11px] text-slate-400">done</p>
              </div>
            </div>
          )}

          {/* Timeline list */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {tasks.map((t, idx) => {
                const norm = normTaskStatus(t.status);
                const pill = TASK_PILL[norm] || TASK_PILL['Not Started'];
                const isActive = norm === 'In Progress';
                const isDelayed = norm === 'Delayed' || t.delay_days > 0;
                const isDone = norm === 'Completed';

                return (
                  <div
                    key={t.id}
                    className={`flex items-start gap-4 px-4 py-3.5 ${isActive ? 'bg-blue-50/30' : ''}`}
                  >
                    {/* Step number / check */}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold
                      ${isDone ? 'bg-green-500 text-white' :
                        isActive ? 'bg-blue-500 text-white' :
                        'bg-slate-100 text-slate-400'}`}>
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className={`text-sm font-medium ${isDone ? 'text-slate-400' : 'text-slate-800'}`}>
                          {t.task_name}
                        </p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pill}`}>
                          {norm}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-slate-400">
                        {t.planned_start_date && <span>Start: {fmtDate(t.planned_start_date, true)}</span>}
                        {(t.projected_finish_date || t.planned_finish_date) && (
                          <span className={isDelayed ? 'text-amber-600' : ''}>
                            End: {fmtDate(t.projected_finish_date || t.planned_finish_date, true)}
                          </span>
                        )}
                        {isDone && t.actual_finish_date && (
                          <span className="text-green-600">Finished: {fmtDate(t.actual_finish_date, true)}</span>
                        )}
                      </div>
                      {t.client_visible_notes && (
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.client_visible_notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        Schedule maintained by your project coordinator.
      </div>
    </div>
  );
}

function SelectionsSection({ decisions, projectId, onResponded, previewMode = false }: {
  decisions: ClientDecision[];
  projectId: string;
  onResponded: () => void;
  previewMode?: boolean;
}) {
  return (
    <div>
      <SectionHeader title="Selections & Decisions" subtitle="Your input helps keep the project on schedule" />
      <DecisionsSection decisions={decisions} projectId={projectId} onResponded={onResponded} previewMode={previewMode} />
    </div>
  );
}

const PHOTO_CATS = new Set(['Before Photo', 'Progress Photo', 'After Photo', 'Issue / Damage Photo', 'Daily Update Photo']);

function FilesSection({ files }: { files: ProjectFile[] }) {
  const photos = files.filter(f => PHOTO_CATS.has(f.document_category));
  const docs = files.filter(f => !PHOTO_CATS.has(f.document_category));

  function isImage(fileType: string) {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes((fileType || '').toLowerCase());
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Files & Photos" subtitle="Documents and images shared by your project team" />

      {files.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No files shared yet" body="Your coordinator will share project documents and progress photos here." />
      ) : (
        <>
          {/* Photos grid */}
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Photos ({photos.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {photos.map(f => (
                  <div key={f.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="aspect-video bg-slate-100 flex items-center justify-center">
                      {f.storage_path_or_placeholder && isImage(f.file_type) ? (
                        <img
                          src={f.storage_path_or_placeholder}
                          alt={f.file_name}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Image className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="text-xs font-medium text-slate-700 truncate">{f.file_name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(f.uploaded_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents list */}
          {docs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Documents ({docs.length})</p>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {docs.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{f.file_name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{f.document_category}</span>
                          <span>·</span>
                          <span>{fmtDate(f.uploaded_at, true)}</span>
                        </div>
                        {f.file_description && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{f.file_description}</p>
                        )}
                      </div>
                      {f.storage_path_or_placeholder && (
                        <a
                          href={f.storage_path_or_placeholder}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                          title="View file"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PaymentsSection({ milestones }: { milestones: PaymentMilestone[] }) {
  if (milestones.length === 0) {
    return (
      <>
        <SectionHeader title="Payments" subtitle="Your project payment schedule" />
        <EmptyState
          icon={CreditCard}
          title="Payment schedule not yet available"
          body="Your financial summary will appear here once a payment schedule has been added by your project coordinator."
        />
      </>
    );
  }

  const total    = milestones.reduce((s, m) => s + (m.amount || 0), 0);
  const paid     = milestones.filter(m => normalizePaymentStatus(m.status) === 'Paid').reduce((s, m) => s + (m.amount || 0), 0);
  const pctPaid  = total > 0 ? Math.round((paid / total) * 100) : 0;
  const nextDue  = milestones.find(m => normalizePaymentStatus(m.status) === 'Due' || normalizePaymentStatus(m.status) === 'Overdue');
  const isOverdue = nextDue ? normalizePaymentStatus(nextDue.status) === 'Overdue' : false;

  const PILL: Record<string, string> = {
    Paid:     'bg-green-50 text-green-700 border-green-200',
    Due:      'bg-amber-50 text-amber-700 border-amber-200',
    Overdue:  'bg-red-50 text-red-700 border-red-200',
    Upcoming: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Payments" subtitle="Your project payment schedule" />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Project Total',  value: fmtCurrency(total),        icon: DollarSign,  cls: 'text-slate-800' },
          { label: 'Paid to Date',   value: fmtCurrency(paid),         icon: CheckCircle, cls: 'text-green-600' },
          { label: 'Remaining',      value: fmtCurrency(total - paid), icon: TrendingUp,  cls: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-3 py-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
            <p className={`text-lg font-bold tabular-nums ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-slate-600">Payment Progress</p>
          <p className="text-xs font-semibold text-slate-500 tabular-nums">{pctPaid}%</p>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
        </div>
      </div>

      {/* Next due callout */}
      {nextDue && (
        <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <CreditCard className={`w-5 h-5 flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
              {isOverdue ? 'Payment Overdue' : 'Next Payment Due'}
            </p>
            <p className="text-sm font-semibold text-slate-800 truncate">{nextDue.milestone_name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-sm font-bold tabular-nums ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
              {fmtCurrency(nextDue.amount)}
            </p>
            {nextDue.due_date && (
              <p className="text-[10px] text-slate-500 mt-0.5">{fmtDate(nextDue.due_date, true)}</p>
            )}
          </div>
        </div>
      )}

      {/* Milestone list */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {milestones.map(m => {
            const norm = normalizePaymentStatus(m.status);
            const pill = PILL[norm] || PILL['Upcoming'];
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.milestone_name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    {m.due_date && <span className={norm === 'Overdue' ? 'text-red-600' : ''}>Due {fmtDate(m.due_date, true)}</span>}
                    {m.paid_date && <span className="text-green-600">Paid {fmtDate(m.paid_date, true)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-800 tabular-nums">{fmtCurrency(m.amount)}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pill}`}>{norm}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Payment schedule managed by your project coordinator.
      </p>
    </div>
  );
}

function MessagesSection({ projectId, previewMode = false }: { projectId: string; previewMode?: boolean }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('communication_messages')
      .select('id, sender_role, message_body, visibility, created_at, sender_user_id')
      .eq('project_id', projectId)
      .not('visibility', 'in', '("Admin Only","Internal Only")')
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function send() {
    if (!body.trim() || !profile) return;
    setSending(true);
    await supabase.from('communication_messages').insert({
      project_id: projectId,
      sender_user_id: profile.id,
      sender_role: 'CLIENT',
      message_body: body.trim(),
      visibility: 'Client Visible',
    });
    setBody('');
    setSending(false);
    load();
  }

  function fmtTime(d: string) {
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Messages" subtitle="Communicate with your project team" />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 360 }}>
        {/* Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 420 }}>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading messages...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageSquare className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-500">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1">Send a message to your project coordinator below.</p>
            </div>
          ) : messages.map(m => {
            const isMe = m.sender_role === 'CLIENT';
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                  isMe
                    ? 'bg-steel-800 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                  {!isMe && (
                    <p className="text-[10px] font-semibold text-slate-500 mb-1 capitalize">
                      {m.sender_role.replace(/_/g, ' ').toLowerCase()}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{m.message_body}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-slate-400' : 'text-slate-400'}`}>
                    {fmtTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        {previewMode ? (
          <div className="border-t border-slate-100 p-3">
            <p className="text-xs text-center text-slate-400 italic py-1">
              Disabled in Client Portal Preview — messages cannot be sent on behalf of the client.
            </p>
          </div>
        ) : (
        <div className="border-t border-slate-100 p-3 flex items-end gap-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message to your coordinator..."
            rows={2}
            className="flex-1 text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none text-slate-700 placeholder:text-slate-400"
          />
          <button
            onClick={send}
            disabled={!body.trim() || sending}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-steel-800 hover:bg-steel-700 text-white flex items-center justify-center transition-colors disabled:opacity-40"
          >
            {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar nav config ───────────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'overview',   label: 'Overview',            icon: Home        },
  { id: 'milestones', label: 'Milestones',           icon: ListChecks  },
  { id: 'decisions',  label: 'Decisions Needed',     icon: CheckSquare },
  { id: 'update',     label: 'Project Update',       icon: Newspaper   },
  { id: 'schedule',   label: 'Schedule',             icon: CalendarDays },
  { id: 'selections', label: 'Selections',           icon: FileCheck   },
  { id: 'files',      label: 'Files & Photos',       icon: FolderOpen  },
  { id: 'payments',   label: 'Payments',             icon: CreditCard  },
  { id: 'messages',   label: 'Messages',             icon: MessageSquare },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientProjectDetailPage({
  projectId,
  onBack,
  backLabel = 'My Projects',
  previewMode = false,
}: {
  projectId: string;
  onBack: () => void;
  backLabel?: string;
  previewMode?: boolean;
}) {
  const { profile } = useAuth();

  const [section, setSection] = useState<Section>('overview');
  const [project, setProject]       = useState<Project | null>(null);
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [decisions, setDecisions]   = useState<ClientDecision[]>([]);
  const [delays, setDelays]         = useState<DelayReason[]>([]);
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);
  const [files, setFiles]           = useState<ProjectFile[]>([]);
  const [permits, setPermits]             = useState<ClientPermit[]>([]);
  const [inspections, setInspections]     = useState<ClientInspection[]>([]);
  const [loading, setLoading]             = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => { if (profile) load(); }, [profile, projectId]);

  async function load() {
    setLoading(true);
    const [projRes, tasksRes, decisRes, delaysRes, pmRes, filesRes, permitsRes, inspectionsRes] = await Promise.all([
      supabase.from('projects')
        .select('id, project_name, project_type, status, progress_percentage, start_date, expected_finish_date, projected_finish_date, city, state, client_visible_notes, description, permits_applicability')
        .eq('id', projectId)
        .eq('is_archived', false)
        .maybeSingle(),
      supabase.from('tasks')
        .select('id, task_name, category, status, progress_percentage, planned_start_date, planned_finish_date, projected_finish_date, actual_finish_date, client_visible_notes, delay_days')
        .eq('project_id', projectId)
        .eq('is_client_visible', true)
        .order('planned_start_date', { ascending: true }),
      supabase.from('client_decisions')
        .select('id, decision_title, description, needed_by_date, status, time_impact_days, client_visible_note, client_response, client_responded_at')
        .eq('project_id', projectId)
        .neq('status', 'Received')
        .order('needed_by_date', { ascending: true }),
      supabase.from('project_delay_reasons')
        .select('id, client_safe_reason, estimated_delay_days, revised_projected_completion, created_at')
        .eq('project_id', projectId)
        .eq('client_visible', true)
        .eq('client_visibility_status', 'Visible to Client')
        .order('created_at', { ascending: false }),
      supabase.from('payment_milestones')
        .select('id, milestone_name, amount, due_date, paid_date, status')
        .eq('project_id', projectId)
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('project_files')
        .select('id, file_name, file_type, document_category, file_description, uploaded_at, storage_path_or_placeholder')
        .eq('project_id', projectId)
        .eq('client_visible', true)
        .eq('is_deleted', false)
        .order('uploaded_at', { ascending: false }),
      supabase.from('permits')
        .select('id, permit_type, permit_status, client_message')
        .eq('project_id', projectId)
        .eq('client_visible', true)
        .order('created_at', { ascending: true }),
      supabase.from('inspections')
        .select('id, inspection_type, result, inspection_status')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
    ]);

    if (projRes.data) setProject(projRes.data as Project);
    setTasks((tasksRes.data || []) as Task[]);
    setDecisions((decisRes.data || []) as ClientDecision[]);
    setDelays((delaysRes.data || []) as DelayReason[]);
    setMilestones((pmRes.data || []) as PaymentMilestone[]);
    setFiles((filesRes.data || []) as ProjectFile[]);
    setPermits((permitsRes.data || []) as ClientPermit[]);
    setInspections((inspectionsRes.data || []) as ClientInspection[]);
    setLoading(false);
  }

  // Badge counts for sidebar items
  const pendingDecisions = decisions.filter(d => d.status !== 'Approved' && !d.client_response).length;
  const pendingSelections = pendingDecisions;

  function badge(id: Section): number {
    if (id === 'decisions' || id === 'selections') return pendingDecisions;
    return 0;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center gap-2 text-slate-400">
        <Loader className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading project...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500">Project not found</p>
          <button onClick={onBack} className="mt-3 text-xs text-steel-700 hover:underline">Go back</button>
        </div>
      </div>
    );
  }

  const activeNavItem = NAV_ITEMS.find(n => n.id === section)!;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 flex-shrink-0">
        <div className="h-14 px-4 sm:px-5 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </button>
          <div className="w-px h-4 bg-slate-200 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{project.project_name}</p>
          </div>
          {/* Mobile: current section indicator */}
          <button
            onClick={() => setMobileSidebarOpen(v => !v)}
            className="flex items-center gap-1.5 sm:hidden text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5"
          >
            <activeNavItem.icon className="w-3.5 h-3.5" />
            {activeNavItem.label}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mobileSidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {/* Mobile dropdown nav */}
        {mobileSidebarOpen && (
          <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-2 grid grid-cols-2 gap-1">
            {NAV_ITEMS.map(item => {
              const b = badge(item.id);
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setSection(item.id); setMobileSidebarOpen(false); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {b > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
                      {b}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden sm:flex flex-col w-52 lg:w-56 flex-shrink-0 bg-white border-r border-slate-200 py-4 px-2">
          {/* Project pill */}
          <div className="px-3 mb-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Project</p>
            <p className="text-xs font-semibold text-slate-700 truncate">{project.project_name}</p>
          </div>

          <nav className="flex-1 space-y-0.5">
            {NAV_ITEMS.map((item, i) => {
              const active = section === item.id;
              const b = badge(item.id);

              // Tree connector line — after overview, add a thin left border to child rows
              const isChild = i > 0;

              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all
                    ${isChild ? 'ml-2 pl-4 relative' : ''}
                    ${active
                      ? 'bg-slate-100 text-slate-800'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                  `}
                  style={isChild ? { borderLeft: '1.5px solid #e2e8f0', borderRadius: '0 8px 8px 0', marginLeft: 12 } : undefined}
                >
                  {!isChild && <item.icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-slate-700' : 'text-slate-400'}`} />}
                  <span className={`text-xs flex-1 min-w-0 truncate ${active ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                  {b > 0 && (
                    <span className="flex-shrink-0 text-[10px] font-bold bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center">
                      {b}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
            {section === 'overview'   && <OverviewSection project={project} delays={delays} permits={permits} inspections={inspections} />}
            {section === 'milestones' && <MilestonesSection tasks={tasks} />}
            {section === 'decisions'  && <DecisionsSection decisions={decisions} projectId={projectId} onResponded={load} previewMode={previewMode} />}
            {section === 'update'     && <ProjectUpdateSection project={project} delays={delays} />}
            {section === 'schedule'   && <ScheduleSection tasks={tasks} project={project} />}
            {section === 'selections' && <SelectionsSection decisions={decisions} projectId={projectId} onResponded={load} previewMode={previewMode} />}
            {section === 'files'      && <FilesSection files={files} />}
            {section === 'payments'   && <PaymentsSection milestones={milestones} />}
            {section === 'messages'   && <MessagesSection projectId={projectId} previewMode={previewMode} />}
          </div>
        </main>
      </div>
    </div>
  );
}
