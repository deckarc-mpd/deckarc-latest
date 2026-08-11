import { useEffect, useState } from 'react';
import { supabase, Project, Task, ClientDecision } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ProjectPulse from '../components/ProjectPulse';
import Modal from '../components/Modal';
import { logActivity } from '../components/project/ActivityLogTab';
import { normalizePaymentStatus } from '../components/project/PaymentsTab';
import {
  Home, CheckCircle, RefreshCw,
  MessageSquare, ChevronRight, FileText, Clock,
  HardHat, CalendarDays, FolderOpen, ImageIcon,
  ArrowRight, Bell, Send, ShieldCheck, Phone, Award, Sparkles,
  AlertCircle, ThumbsUp, X, Info, Search, Reply,
  DollarSign, CreditCard, ListChecks, Image as ImageIcon2,
  TrendingUp, FileCheck,
} from 'lucide-react';

// ─── Finance data model (for future estimate module integration) ─────────────
// Approved Project Total  = approved_estimate_total + approved_change_order_total
// Balance Remaining       = Approved Project Total − total_paid
// Next Payment Due        = next payment_milestone with status 'Due' or 'Upcoming'
// ─────────────────────────────────────────────────────────────────────────────

type UrgencyLevel = 'Informational' | 'Action Needed' | 'Time Sensitive' | 'Urgent';

interface ClientUpdate {
  id: string;
  type: UrgencyLevel;
  title: string;
  detail: string;
  project: string;
  dueDate?: string;
}

const URGENCY: Record<UrgencyLevel, { accent: string; pill: string; label: string }> = {
  Urgent:           { accent: 'border-l-red-500',   pill: 'bg-red-50 text-red-700 border-red-200',       label: 'Response Needed Today' },
  'Time Sensitive': { accent: 'border-l-slate-400', pill: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Due Soon' },
  'Action Needed':  { accent: 'border-l-steel-700',  pill: 'bg-steel-800 text-white border-steel-700',    label: 'Your Input Needed' },
  Informational:    { accent: 'border-l-slate-200', pill: 'bg-slate-50 text-slate-500 border-slate-200',  label: 'Update' },
};

interface DelayItem {
  id: string;
  project_id: string;
  task_id: string | null;
  client_safe_reason: string;
  estimated_delay_days: number;
  client_response_required: boolean;
  client_response_status: string;
  auto_acknowledgement_enabled: boolean;
  response_deadline: string | null;
  status: string;
  created_at: string;
  admin_reply: string;
  admin_replied_at: string | null;
  project_name?: string;
  task_name?: string;
}

interface PaymentMilestone {
  id: string;
  project_id: string;
  milestone_name: string;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: string; // Paid | Due | Upcoming | Overdue | Pending
}

interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  document_category: string;
  file_description: string | null;
  uploaded_at: string;
  storage_path_or_placeholder: string | null;
  client_visible: boolean;
}

interface CommMessage {
  id: string;
  project_id: string;
  message_body: string;
  created_at: string;
  sender_role: string;
}

interface DecisionModalState {
  item: ClientUpdate;
  decision: ClientDecision;
}

type DelayActionMode = 'none' | 'question' | 'review';

interface DelayModalState {
  delay: DelayItem;
  mode: DelayActionMode;
  text: string;
  textError: string;
  submitting: boolean;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Divider() {
  return <hr className="border-slate-100" />;
}

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({
  title, subtitle, badge, action,
}: {
  title: string; subtitle?: string; badge?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function NavLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
    >
      {label} <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-5 text-center">
      <div className="w-9 h-9 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-4 h-4 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{body}</p>
    </div>
  );
}

function ActionRow({ item, onOpen }: { item: ClientUpdate; onOpen: (i: ClientUpdate) => void }) {
  const u = URGENCY[item.type];
  return (
    <div className={`flex items-start gap-3 px-5 py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors`}>
      <span className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${u.pill}`}>
        {u.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 leading-snug">{item.title}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{item.detail}</p>
        {item.dueDate && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 flex-shrink-0" />
            Due {new Date(item.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
      <button
        onClick={() => onOpen(item)}
        className="flex-shrink-0 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
      >
        Respond <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}

function statusColor(status: string) {
  if (status === 'In Progress' || status === 'Completed') return 'green';
  if (status === 'Delayed') return 'red';
  return 'yellow';
}

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    'In Progress': 'In Progress', Delayed: 'Update Available',
    Completed: 'Completed', Planning: 'Scheduled',
  };
  const color = statusColor(status);
  const cls =
    color === 'green' ? 'bg-green-50 text-green-700 border-green-200' :
    color === 'red'   ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-yellow-50 text-yellow-700 border-yellow-200';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label[status] ?? status}</span>
  );
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const color = statusColor(status);
  const fill = color === 'green' ? 'bg-green-500' : color === 'red' ? 'bg-red-400' : 'bg-yellow-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-500 w-9 text-right tabular-nums">{pct}%</span>
    </div>
  );
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Financial summary ────────────────────────────────────────────────────────

function FinancialSummary({
  milestones,
  onNavigate,
}: {
  milestones: PaymentMilestone[];
  onNavigate?: () => void;
}) {
  if (milestones.length === 0) {
    return (
      <Section>
        <SectionTitle title="Financial Summary" subtitle="Your project investment overview" action={onNavigate ? <NavLink label="View Payments" onClick={onNavigate} /> : undefined} />
        <Divider />
        <EmptyState
          icon={DollarSign}
          title="Financial summary not yet available"
          body="Your financial summary will appear here once a payment schedule has been added to your project."
        />
      </Section>
    );
  }

  const totalContract = milestones.reduce((s, m) => s + (m.amount || 0), 0);
  const totalPaid     = milestones.filter(m => normalizePaymentStatus(m.status) === 'Paid').reduce((s, m) => s + (m.amount || 0), 0);
  const remaining     = totalContract - totalPaid;
  const paidPct       = totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0;
  const nextDue       = milestones.find(m => normalizePaymentStatus(m.status) === 'Due' || normalizePaymentStatus(m.status) === 'Overdue');
  const isOverdue     = nextDue ? normalizePaymentStatus(nextDue.status) === 'Overdue' : false;

  return (
    <Section>
      <SectionTitle
        title="Financial Summary"
        subtitle="Your project investment overview"
        action={onNavigate ? <NavLink label="View Payments" onClick={onNavigate} /> : undefined}
      />
      <Divider />
      <div className="px-5 py-5 space-y-5">
        {/* 3-column stat row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Project Total',    value: fmtCurrency(totalContract), sub: 'Payment schedule total' },
            { label: 'Paid to Date',     value: fmtCurrency(totalPaid),     sub: `${paidPct}% of total` },
            { label: 'Balance Remaining',value: fmtCurrency(remaining),     sub: 'Still to be paid' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-base font-bold text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-xs font-medium text-slate-600 mt-0.5">{s.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-slate-500">Payment progress</p>
            <p className="text-xs font-semibold text-slate-600">{paidPct}% paid</p>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
          </div>
        </div>

        {/* Next payment due */}
        {nextDue && (
          <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border ${
            isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <CreditCard className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-amber-600'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                {isOverdue ? 'Payment Overdue' : 'Next Payment Due'}
              </p>
              <p className="text-xs text-slate-600 mt-0.5 truncate">{nextDue.milestone_name}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold tabular-nums ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                {fmtCurrency(nextDue.amount)}
              </p>
              {nextDue.due_date && (
                <p className="text-[10px] text-slate-500 mt-0.5">{fmtDate(nextDue.due_date)}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Payment records preview ──────────────────────────────────────────────────

function PaymentRecords({
  milestones,
  onNavigate,
}: {
  milestones: PaymentMilestone[];
  onNavigate?: () => void;
}) {
  const recent = milestones.slice(0, 4);

  const pillClass: Record<string, string> = {
    Paid:     'bg-green-50 text-green-700 border-green-200',
    Due:      'bg-amber-50 text-amber-700 border-amber-200',
    Overdue:  'bg-red-50 text-red-700 border-red-200',
    Upcoming: 'bg-slate-50 text-slate-500 border-slate-200',
    Pending:  'bg-slate-50 text-slate-500 border-slate-200',
  };

  return (
    <Section>
      <SectionTitle
        title="Payments"
        subtitle="Your payment schedule"
        action={onNavigate ? <NavLink label="View All" onClick={onNavigate} /> : undefined}
      />
      <Divider />
      {milestones.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payment schedule yet" body="Your payment schedule will appear here once set up by your project coordinator." />
      ) : (
        <div className="divide-y divide-slate-100">
          {recent.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.milestone_name}</p>
                {(m.due_date || m.paid_date) && (
                  <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <CalendarDays className="w-3 h-3 flex-shrink-0" />
                    {m.paid_date ? `Paid ${fmtDate(m.paid_date)}` : m.due_date ? `Due ${fmtDate(m.due_date)}` : ''}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900 tabular-nums">{fmtCurrency(m.amount)}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${pillClass[m.status] ?? 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  {m.status}
                </span>
              </div>
            </div>
          ))}
          {milestones.length > 4 && (
            <div className="px-5 py-3 text-center">
              <button onClick={onNavigate} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
                View {milestones.length - 4} more payment{milestones.length - 4 !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Selections section ───────────────────────────────────────────────────────
// Selections are currently driven by client_decisions.
// Future integration: each selection will link to an approved estimate line item,
// with an allowance amount. If the selected item exceeds the allowance, a change
// order is generated. For now we display client_decisions as selection cards.

function SelectionsSection({
  decisions,
  projects,
  onNavigate,
}: {
  decisions: ClientDecision[];
  projects: Project[];
  onNavigate?: () => void;
}) {
  const projectMap = new Map(projects.map(p => [p.id, p.project_name]));

  // Group decisions into selections vs. other actions
  // For now all client_decisions serve dual-purpose; we show up to 5
  const shown = decisions.slice(0, 5);

  const statusCls = (status: string) => {
    if (status === 'Approved' || status === 'Received') return 'bg-green-50 text-green-700 border-green-200';
    if (status === 'Overdue') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'Pending') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 text-slate-500 border-slate-200';
  };

  return (
    <Section>
      <SectionTitle
        title="Selections"
        subtitle="Items waiting for your choice or approval"
        badge={decisions.filter(d => d.status === 'Pending').length > 0 ? (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            {decisions.filter(d => d.status === 'Pending').length} pending
          </span>
        ) : undefined}
        action={onNavigate ? <NavLink label="View All" onClick={onNavigate} /> : undefined}
      />
      <Divider />
      {decisions.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No selections yet"
          body="Your project coordinator will add selections here when your input is needed. Selections will connect to approved estimate items when the estimate module is enabled."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {shown.map(d => (
            <div key={d.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-medium text-slate-800">{d.decision_title}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${statusCls(d.status)}`}>
                      {d.status === 'Received' ? 'Submitted' : d.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {d.client_visible_note || d.description || 'Your input is needed for this selection.'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {d.needed_by_date && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        Due {fmtDate(d.needed_by_date)}
                      </p>
                    )}
                    {d.cost_impact > 0 && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                        <DollarSign className="w-3 h-3 flex-shrink-0" />
                        {fmtCurrency(d.cost_impact)} cost impact
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">{projectMap.get(d.project_id) || 'Your Project'}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {decisions.length > 5 && (
            <div className="px-5 py-3 text-center">
              <button onClick={onNavigate} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
                View {decisions.length - 5} more selection{decisions.length - 5 !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Messages preview ─────────────────────────────────────────────────────────

function MessagesPreview({
  messages,
  onNavigate,
}: {
  messages: CommMessage[];
  onNavigate?: () => void;
}) {
  return (
    <Section>
      <SectionTitle
        title="Messages"
        subtitle="Latest updates from your project team"
        badge={messages.length > 0 ? (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
        ) : undefined}
        action={onNavigate ? <NavLink label="Open Messages" onClick={onNavigate} /> : undefined}
      />
      <Divider />
      {messages.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No messages yet" body="Your project team will send updates here as work progresses." />
      ) : (
        <div className="divide-y divide-slate-100">
          {messages.slice(0, 3).map(m => (
            <div key={m.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer" onClick={onNavigate}>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-600">{m.sender_role === 'DECKARC_ADMIN' ? 'DECKARC Team' : 'Project Update'}</p>
                  <p className="text-sm text-slate-700 leading-relaxed line-clamp-2 mt-0.5">{m.message_body}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          <div className="px-5 py-3">
            <button
              onClick={onNavigate}
              className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors py-1"
            >
              View all messages <ArrowRight className="inline w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Schedule preview ─────────────────────────────────────────────────────────

function SchedulePreview({
  tasks,
  project,
  onNavigate,
}: {
  tasks: Task[];
  project: Project | null;
  onNavigate?: () => void;
}) {
  const upcoming = tasks
    .filter(t => t.status !== 'Completed' && t.planned_finish_date)
    .sort((a, b) => (a.planned_finish_date || '').localeCompare(b.planned_finish_date || ''))
    .slice(0, 3);

  const taskStatusCls = (s: string) => {
    if (s === 'In Progress') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'Delayed' || s === 'Blocked') return 'bg-red-50 text-red-700 border-red-200';
    if (s === 'Completed') return 'bg-green-50 text-green-700 border-green-200';
    return 'bg-slate-50 text-slate-500 border-slate-200';
  };

  return (
    <Section>
      <SectionTitle
        title="Schedule"
        subtitle="Upcoming milestones"
        action={onNavigate ? <NavLink label="Full Schedule" onClick={onNavigate} /> : undefined}
      />
      <Divider />
      {project && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Overall progress</p>
              {project.expected_finish_date && (
                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  Est. completion: <span className="font-medium text-slate-600 ml-1">{fmtDate(project.expected_finish_date)}</span>
                </p>
              )}
            </div>
            <p className="text-lg font-bold text-slate-800 tabular-nums">{project.progress_percentage}%</p>
          </div>
          <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${project.progress_percentage}%` }} />
          </div>
        </div>
      )}
      {upcoming.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No upcoming milestones" body="Your schedule milestones will appear here as your project progresses." />
      ) : (
        <div className="divide-y divide-slate-100">
          {upcoming.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {t.client_visible_notes || t.task_name}
                </p>
                {t.planned_finish_date && (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <CalendarDays className="w-3 h-3 flex-shrink-0" />
                    {fmtDate(t.planned_finish_date)}
                  </p>
                )}
              </div>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${taskStatusCls(t.status)}`}>
                {t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Files & Photos preview ───────────────────────────────────────────────────

function FilesPreview({
  files,
  onNavigate,
}: {
  files: ProjectFile[];
  onNavigate?: () => void;
}) {
  return (
    <Section>
      <SectionTitle
        title="Files & Photos"
        subtitle="Documents and photos shared with you"
        action={onNavigate ? <NavLink label="View All" onClick={onNavigate} /> : undefined}
      />
      <Divider />
      {files.length === 0 ? (
        <EmptyState
          icon={ImageIcon2}
          title="No shared files yet"
          body="Photos and documents approved for your review will appear here."
        />
      ) : (
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {files.slice(0, 6).map(f => {
            const isImage = ['jpg','jpeg','png','gif','webp','heic'].some(ext => f.file_name.toLowerCase().endsWith(ext)) || f.file_type?.startsWith('image/');
            return (
              <div key={f.id} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 hover:border-slate-200 transition-colors">
                <div className="w-full h-8 flex items-center justify-center mb-1.5">
                  {isImage ? <ImageIcon className="w-4 h-4 text-slate-300" /> : <FileText className="w-4 h-4 text-slate-300" />}
                </div>
                <p className="text-[11px] text-slate-600 font-medium truncate text-center">{f.file_name}</p>
                <p className="text-[10px] text-slate-400 text-center mt-0.5">{f.document_category || f.file_type || 'File'}</p>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* ── Main page ── */
export default function ClientDashboardPage({
  onNavigateToProjects,
  onNavigateToMessages,
  onNavigateToPayments,
  onNavigateToSchedule,
  onNavigateToSelections,
  onNavigateToFiles,
  previewMode = false,
}: {
  onNavigateToProjects?: () => void;
  onNavigateToMessages?: () => void;
  onNavigateToPayments?: () => void;
  onNavigateToSchedule?: () => void;
  onNavigateToSelections?: () => void;
  onNavigateToFiles?: () => void;
  previewMode?: boolean;
}) {
  const { profile } = useAuth();
  const [loading, setLoading]                       = useState(true);
  const [projects, setProjects]                     = useState<Project[]>([]);
  const [actionItems, setActionItems]               = useState<ClientUpdate[]>([]);
  const [activeDecisions, setActiveDecisions]       = useState<ClientDecision[]>([]);
  const [allDecisions, setAllDecisions]             = useState<ClientDecision[]>([]);
  const [modalState, setModalState]                 = useState<DecisionModalState | null>(null);
  const [response, setResponse]                     = useState('');
  const [submitting, setSubmitting]                 = useState(false);
  const [submitSuccess, setSubmitSuccess]           = useState(false);
  const [pendingDelays, setPendingDelays]           = useState<DelayItem[]>([]);
  const [adminRespondedDelays, setAdminRespondedDelays] = useState<DelayItem[]>([]);
  const [settledDelays, setSettledDelays]           = useState<DelayItem[]>([]);
  const [delayModal, setDelayModal]                 = useState<DelayModalState | null>(null);
  const [inspProgress, setInspProgress]             = useState<{total:number;passed:number;scheduled:number;attention:number}>({total:0,passed:0,scheduled:0,attention:0});
  // New portal sections
  const [payments, setPayments]                     = useState<PaymentMilestone[]>([]);
  const [recentFiles, setRecentFiles]               = useState<ProjectFile[]>([]);
  const [recentMessages, setRecentMessages]         = useState<CommMessage[]>([]);
  const [clientTasks, setClientTasks]               = useState<Task[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [projectsRes, tasksRes, decisionsRes, delayRes, inspReqRes, paymentsRes, filesRes, messagesRes] = await Promise.all([
      supabase.from('projects').select('*').eq('is_archived', false),
      supabase.from('tasks').select('*').eq('is_client_visible', true).eq('is_deleted', false),
      supabase.from('client_decisions').select('*').neq('status', 'Received'),
      supabase.from('project_delay_reasons').select('*').eq('client_visible', true).eq('client_visibility_status', 'Visible to Client').order('created_at', { ascending: false }),
      supabase.from('project_inspection_requirements').select('status,readiness_status,attention_flag,client_visible,required').eq('client_visible', true),
      supabase.from('payment_milestones').select('*').order('due_date', { ascending: true }),
      supabase.from('project_files').select('id,project_id,file_name,file_type,document_category,file_description,uploaded_at,storage_path_or_placeholder,client_visible').eq('client_visible', true).eq('is_deleted', false).order('uploaded_at', { ascending: false }).limit(12),
      supabase.from('communication_messages').select('id,project_id,message_body,created_at,sender_role').not('visibility', 'in', '("Admin Only","Internal Only")').order('created_at', { ascending: false }).limit(10),
    ]);

    const allProjects: Project[]       = projectsRes.data  || [];
    const tasks: Task[]                = tasksRes.data     || [];
    const decisions: ClientDecision[]  = decisionsRes.data || [];
    const rawDelays: DelayItem[]       = delayRes.data     || [];
    const inspReqs: any[]              = (inspReqRes.data  || []).filter((r: any) => r.required);

    const projectMap = new Map(allProjects.map(p => [p.id, p.project_name]));

    setInspProgress({
      total:     inspReqs.length,
      passed:    inspReqs.filter((r: any) => r.status === 'Passed').length,
      scheduled: inspReqs.filter((r: any) => r.status === 'Scheduled').length,
      attention: inspReqs.filter((r: any) => r.attention_flag || r.readiness_status === 'Needs Attention').length,
    });

    // Enrich delays with task names
    const taskIds = [...new Set(rawDelays.map(d => d.task_id).filter(Boolean))] as string[];
    let taskNameMap = new Map<string, string>();
    if (taskIds.length > 0) {
      const { data: taskRows } = await supabase.from('tasks').select('id, task_name').in('id', taskIds);
      (taskRows || []).forEach((t: { id: string; task_name: string }) => taskNameMap.set(t.id, t.task_name));
    }
    const enrichedDelays: DelayItem[] = rawDelays.map(d => ({
      ...d, project_name: projectMap.get(d.project_id) || 'Your Project',
      task_name: d.task_id ? taskNameMap.get(d.task_id) : undefined,
    }));

    const pending       = enrichedDelays.filter(d => d.client_response_required && d.client_response_status === 'Pending Response');
    const adminResponded = enrichedDelays.filter(d => d.client_response_status === 'Admin Responded');
    const settled       = enrichedDelays.filter(d =>
      ['Acknowledged by Client','Auto-Acknowledged','Closed','Resolved'].includes(d.client_response_status) ||
      (!d.client_response_required && !['Resolved','Closed'].includes(d.status))
    );

    const decisionActions: ClientUpdate[] = decisions.map(d => ({
      id: d.id,
      type: (d.needed_by_date && d.needed_by_date < today ? 'Urgent' : 'Action Needed') as UrgencyLevel,
      title: d.decision_title,
      detail: d.client_visible_note || 'Your input is needed to keep the project on schedule.',
      project: projectMap.get(d.project_id) || 'Your Project',
      dueDate: d.needed_by_date || undefined,
    }));
    const delayActions: ClientUpdate[] = pending.map(d => ({
      id: 'delay-' + d.id,
      type: (d.response_deadline && d.response_deadline < new Date().toISOString() ? 'Urgent' : 'Action Needed') as UrgencyLevel,
      title: 'Schedule Update Review',
      detail: d.client_safe_reason || 'A schedule update is ready for your review.',
      project: d.project_name || 'Your Project',
      dueDate: d.response_deadline ? d.response_deadline.split('T')[0] : undefined,
    }));
    const adminRespondedActions: ClientUpdate[] = adminResponded.map(d => ({
      id: 'delay-ack-' + d.id,
      type: 'Action Needed' as UrgencyLevel,
      title: 'DECKARC Replied to Your Review Request',
      detail: d.admin_reply || 'Your review request has been addressed. Please acknowledge to confirm.',
      project: d.project_name || 'Your Project',
    }));

    setProjects(allProjects);
    setActiveDecisions(decisions);
    setAllDecisions(decisions);
    setActionItems([...decisionActions, ...adminRespondedActions, ...delayActions].slice(0, 8));
    setPendingDelays(pending);
    setAdminRespondedDelays(adminResponded);
    setSettledDelays(settled);
    setClientTasks(tasks);
    setPayments(paymentsRes.data || []);
    setRecentFiles(filesRes.data || []);
    setRecentMessages(messagesRes.data || []);
    setLoading(false);
  }

  function openModal(item: ClientUpdate) {
    if (item.id.startsWith('delay-ack-')) {
      const delay = adminRespondedDelays.find(d => d.id === item.id.replace('delay-ack-', ''));
      if (delay) { setDelayModal({ delay, mode: 'none', text: '', textError: '', submitting: false }); return; }
    }
    if (item.id.startsWith('delay-') && !item.id.startsWith('delay-info-') && !item.id.startsWith('delay-disp-')) {
      const delay = pendingDelays.find(d => d.id === item.id.replace('delay-', ''));
      if (delay) { setDelayModal({ delay, mode: 'none', text: '', textError: '', submitting: false }); return; }
    }
    const decision = activeDecisions.find(d => d.id === item.id);
    if (!decision) return;
    setResponse(''); setSubmitSuccess(false);
    setModalState({ item, decision });
  }

  async function submitResponse() {
    if (!modalState) return;
    setSubmitting(true);
    await supabase.from('client_decisions').update({ status: 'Received', client_visible_note: response || modalState.decision.client_visible_note }).eq('id', modalState.decision.id);
    setSubmitting(false); setSubmitSuccess(true);
    setTimeout(() => { setModalState(null); load(); }, 1500);
  }

  async function acknowledgeDelay() {
    if (!profile || !delayModal) return;
    setDelayModal(m => m ? { ...m, submitting: true } : null);
    await supabase.from('project_delay_reasons').update({ client_response_status: 'Acknowledged by Client', updated_at: new Date().toISOString() }).eq('id', delayModal.delay.id);
    await logActivity({ projectId: delayModal.delay.project_id, userId: profile.id, userFullName: profile.full_name, userRole: profile.role, actionType: 'Client Acknowledged Delay', module: 'Schedule', relatedRecordId: delayModal.delay.id, relatedRecordType: 'project_delay_reasons', notes: `Client acknowledged via dashboard: ${delayModal.delay.client_safe_reason?.slice(0, 80) || ''}` });
    setDelayModal(null); load();
  }

  function validateReviewText(): boolean {
    if (!delayModal) return false;
    const val = delayModal.text.trim();
    if (!val) { setDelayModal(m => m ? { ...m, textError: 'Please describe what you would like your coordinator to review.' } : null); return false; }
    if (val.length < 5) { setDelayModal(m => m ? { ...m, textError: 'Please provide at least 5 characters.' } : null); return false; }
    if (val.length > 300) { setDelayModal(m => m ? { ...m, textError: 'Please keep your message under 300 characters.' } : null); return false; }
    return true;
  }

  async function submitQuestion() {
    if (!profile || !delayModal || !delayModal.text.trim()) return;
    setDelayModal(m => m ? { ...m, submitting: true } : null);
    await supabase.from('project_delay_reasons').update({ client_response_status: 'Question Submitted', updated_at: new Date().toISOString() }).eq('id', delayModal.delay.id);
    await logActivity({ projectId: delayModal.delay.project_id, userId: profile.id, userFullName: profile.full_name, userRole: profile.role, actionType: 'Client Question Submitted', module: 'Schedule', relatedRecordId: delayModal.delay.id, relatedRecordType: 'project_delay_reasons', notes: delayModal.text.trim() });
    setDelayModal(null); load();
  }

  async function submitReviewRequest() {
    if (!profile || !delayModal) return;
    if (!validateReviewText()) return;
    const reason = delayModal.text.trim();
    setDelayModal(m => m ? { ...m, submitting: true } : null);
    await supabase.from('project_delay_reasons').update({ client_response_status: 'Client Requested Review', status: 'Needs Admin Review', client_review_reason: reason, auto_acknowledgement_paused: true, updated_at: new Date().toISOString() }).eq('id', delayModal.delay.id);
    await supabase.from('action_items').insert({ action_title: 'Client Requested Schedule Update Review', action_description: `Client has requested a review of a schedule update${delayModal.delay.task_name ? ` for "${delayModal.delay.task_name}"` : ''}. Reason: ${reason}`, project_id: delayModal.delay.project_id, assigned_role: 'DECKARC_ADMIN', priority: 'High', status: 'Open', client_visible: false, admin_approval_required: true, due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] });
    await supabase.from('communication_messages').insert({ project_id: delayModal.delay.project_id, sender_user_id: profile.id, sender_role: profile.role, related_record_type: 'project_delay_reasons', related_record_id: delayModal.delay.id, message_type: 'Client Review Request', message_body: `Client requested review of schedule update${delayModal.delay.task_name ? ` for "${delayModal.delay.task_name}"` : ''}.\n\nReason: ${reason}`, visibility: 'Admin Only', priority_level: 'High', is_urgent: true, response_required: true, follow_up_required: true, response_due_by: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], follow_up_due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] });
    await logActivity({ projectId: delayModal.delay.project_id, userId: profile.id, userFullName: profile.full_name, userRole: profile.role, actionType: 'Client Requested Schedule Review', module: 'Schedule', relatedRecordId: delayModal.delay.id, relatedRecordType: 'project_delay_reasons', notes: reason });
    setDelayModal(null); load();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-slate-400">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm font-medium text-slate-500">Loading your portal...</span>
        </div>
      </div>
    );
  }

  const hasUrgent     = actionItems.some(a => a.type === 'Urgent');
  const firstName     = profile?.full_name?.split(' ')[0] || 'Client';
  const activeProject = projects.find(p => p.status === 'In Progress') || projects[0] || null;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* PAGE HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Home className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Homeowner Portal</span>
            <span className="hidden sm:inline text-slate-300">·</span>
            <span className="hidden sm:inline text-xs text-slate-400">DECKARC</span>
          </div>
          <button onClick={load} className="btn-ghost text-xs py-1.5 px-2.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-6 space-y-5">

        {/* Welcome row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Welcome back, {firstName}.</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {actionItems.length > 0 ? (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${hasUrgent ? 'bg-red-50 border-red-200 text-red-700' : 'bg-steel-800 border-steel-800 text-white'}`}>
              <Bell className="w-3.5 h-3.5" />
              {actionItems.length} item{actionItems.length !== 1 ? 's' : ''} need{actionItems.length === 1 ? 's' : ''} your attention
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-slate-100 border-slate-200 text-slate-600">
              <CheckCircle className="w-3.5 h-3.5" />
              All caught up
            </div>
          )}
        </div>

        {/* ── PROJECT HEADER CARD ── */}
        {activeProject && (
          <Section>
            <div className="flex items-start gap-4 p-5 cursor-pointer hover:bg-slate-50 transition-colors group" onClick={onNavigateToProjects}>
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <HardHat className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{activeProject.project_name}</p>
                  <StatusBadge status={activeProject.status} />
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  {pendingDelays.filter(d => d.project_id === activeProject.id).length > 0
                    ? `${pendingDelays.filter(d => d.project_id === activeProject.id).length} schedule update${pendingDelays.filter(d => d.project_id === activeProject.id).length > 1 ? 's' : ''} need${pendingDelays.filter(d => d.project_id === activeProject.id).length === 1 ? 's' : ''} your review.`
                    : activeProject.status === 'In Progress'
                      ? 'Your project is moving forward. Work is currently in progress.'
                      : activeProject.status === 'Planning'
                        ? 'Your project is scheduled and being coordinated by your DECKARC team.'
                        : 'Your project coordinator has a status update.'
                  }
                </p>
                <ProgressBar pct={activeProject.progress_percentage} status={activeProject.status} />
                <div className="flex flex-wrap gap-4 mt-2.5">
                  {activeProject.expected_finish_date && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <CalendarDays className="w-3 h-3 flex-shrink-0" />
                      Est. completion:&nbsp;<span className="font-medium text-slate-600">{fmtDate(activeProject.expected_finish_date)}</span>
                    </p>
                  )}
                  {actionItems.length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">Next step:</span> Review your pending items below
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0 mt-1" />
            </div>
          </Section>
        )}

        {/* ── 2-col grid: Financials + Action Needed ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* FINANCIAL SUMMARY */}
          <FinancialSummary milestones={payments} onNavigate={onNavigateToPayments} />

          {/* ACTION NEEDED */}
          <Section>
            <SectionTitle
              title="Action Needed"
              subtitle="Items waiting for your response"
              badge={actionItems.length > 0 ? (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${hasUrgent ? 'bg-red-100 text-red-700' : 'bg-steel-800 text-white'}`}>
                  {actionItems.length}
                </span>
              ) : undefined}
            />
            <Divider />
            {actionItems.length === 0 ? (
              <EmptyState icon={CheckCircle} title="You're all caught up" body="No action is needed right now. We'll let you know when something requires your attention." />
            ) : (
              <div>
                {actionItems.map(item => <ActionRow key={item.id} item={item} onOpen={openModal} />)}
              </div>
            )}
          </Section>
        </div>

        {/* ── SELECTIONS ── */}
        <SelectionsSection decisions={allDecisions} projects={projects} onNavigate={onNavigateToSelections} />

        {/* ── Inspection Progress ── */}
        {inspProgress.total > 0 && (
          <Section>
            <SectionTitle title="Inspection Progress" subtitle="Required inspections for your project" />
            <Divider />
            <div className="px-5 py-4 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-slate-500">{inspProgress.passed} of {inspProgress.total} required inspections passed</p>
                  <p className="text-xs font-semibold text-slate-600">{inspProgress.total ? Math.round((inspProgress.passed / inspProgress.total) * 100) : 0}%</p>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${inspProgress.total ? Math.round((inspProgress.passed / inspProgress.total) * 100) : 0}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Passed',    value: inspProgress.passed,    cls: 'text-emerald-600' },
                  { label: 'Scheduled', value: inspProgress.scheduled, cls: 'text-blue-600' },
                  { label: 'Pending',   value: inspProgress.total - inspProgress.passed - inspProgress.scheduled, cls: 'text-slate-500' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                    <p className={`text-lg font-bold ${s.cls}`}>{s.value}</p>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
              {inspProgress.attention > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  {inspProgress.attention} inspection step{inspProgress.attention > 1 ? 's' : ''} being reviewed by your project coordinator.
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ── Project Pulse (AI) ── */}
        <ProjectPulse />

        {/* ── 2-col grid: Messages + Schedule ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MessagesPreview messages={recentMessages} onNavigate={onNavigateToMessages} />
          <SchedulePreview tasks={clientTasks} project={activeProject} onNavigate={onNavigateToSchedule} />
        </div>

        {/* ── 2-col grid: Payments + Files ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PaymentRecords milestones={payments} onNavigate={onNavigateToPayments} />
          <FilesPreview files={recentFiles} onNavigate={onNavigateToFiles} />
        </div>

        {/* DECKARC brand footer */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(150deg, #0d1e36 0%, #162f52 60%, #1e3f6e 100%)', boxShadow: '0 8px 32px rgba(13,30,54,0.30), 0 2px 8px rgba(13,30,54,0.18)' }}
        >
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <Sparkles className="text-white" style={{ width: 13, height: 13 }} />
              </div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">Your team is on it</p>
                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">Your project is actively coordinated</p>
              </div>
            </div>
            <div className="space-y-1.5 mb-3">
              {[
                { icon: ShieldCheck, text: 'Scheduling & coordination handled by your project team' },
                { icon: CheckCircle, text: 'All updates reviewed before appearing in your portal' },
                { icon: Award,       text: 'Your responses help keep the project on schedule' },
                { icon: Phone,       text: 'Questions? Contact your coordinator anytime' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <Icon className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400" />
                  <span className="text-[10px] text-slate-300 leading-snug">{text}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold text-center">CP360 · Homeowner Portal</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 pb-2">
          All updates are reviewed and approved by your project coordinator.
        </p>
      </div>

      {/* ── Schedule Update Review Modal (preserved verbatim) ── */}
      {delayModal && (
        <Modal
          title={
            delayModal.delay.client_response_status === 'Admin Responded'
              ? 'DECKARC Reply — Please Acknowledge'
              : delayModal.mode === 'review'
              ? 'Request Review of Schedule Update'
              : 'Schedule Update Review'
          }
          onClose={() => setDelayModal(null)}
          size="md"
        >
          <div className="space-y-4">
            {delayModal.delay.client_response_status === 'Admin Responded' && (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Reply className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-xs font-semibold text-emerald-800">DECKARC's Response</p>
                    {delayModal.delay.admin_replied_at && (
                      <span className="text-[10px] text-emerald-600 ml-auto">
                        {new Date(delayModal.delay.admin_replied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-emerald-900 leading-relaxed">{delayModal.delay.admin_reply || 'Your review request has been addressed.'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500 mb-1 font-medium">Original concern</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{delayModal.delay.client_safe_reason || 'Schedule adjustment for your project.'}</p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  {previewMode ? (
                    <p className="text-xs text-slate-400 italic">Disabled in Client Portal Preview.</p>
                  ) : (
                    <>
                      <button onClick={acknowledgeDelay} disabled={delayModal.submitting} className="flex items-center gap-1.5 text-xs font-semibold bg-steel-800 text-white px-5 py-2.5 rounded-lg hover:bg-steel-900 disabled:opacity-50 transition-colors">
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {delayModal.submitting ? 'Confirming...' : 'Acknowledge & Confirm'}
                      </button>
                      <p className="text-xs text-slate-400">Confirms you have read your coordinator's response.</p>
                    </>
                  )}
                </div>
              </>
            )}
            {delayModal.delay.client_response_status !== 'Admin Responded' && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Schedule Update</span>
                    <span className="text-xs text-slate-400">{delayModal.delay.project_name}</span>
                    {delayModal.delay.task_name && <span className="text-xs text-slate-500 font-medium">· {delayModal.delay.task_name}</span>}
                  </div>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed mb-3">
                    {delayModal.delay.client_safe_reason || 'A schedule adjustment is being coordinated for your project.'}
                  </p>
                  {delayModal.delay.estimated_delay_days > 0 && (
                    <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-slate-200">
                      <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-600">Estimated impact: <span className="font-semibold text-slate-800">may add {delayModal.delay.estimated_delay_days} day{delayModal.delay.estimated_delay_days !== 1 ? 's' : ''}</span></span>
                    </div>
                  )}
                  {delayModal.delay.auto_acknowledgement_enabled && delayModal.delay.response_deadline && (
                    <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700">
                      Please respond within 72 hours. If we do not receive a response by{' '}
                      <span className="font-semibold">{new Date(delayModal.delay.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>, this update may be treated as acknowledged so your team can continue coordinating your project.
                    </div>
                  )}
                </div>
                {delayModal.mode === 'question' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-700">Your Question</p>
                      <button onClick={() => setDelayModal(m => m ? { ...m, mode: 'none', text: '', textError: '' } : null)}><X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" /></button>
                    </div>
                    <textarea value={delayModal.text} onChange={e => setDelayModal(m => m ? { ...m, text: e.target.value } : null)} rows={3} placeholder="What would you like to know about this schedule update?" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none" />
                  </div>
                )}
                {delayModal.mode === 'review' && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50/30 p-4">
                    <p className="text-xs text-slate-600 mb-3 leading-relaxed">Please tell us what you would like your coordinator to review regarding this schedule update. Your team will review your response before any final schedule action is taken.</p>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reason for Review <span className="text-orange-600">*</span></label>
                    <textarea value={delayModal.text} onChange={e => setDelayModal(m => m ? { ...m, text: e.target.value, textError: '' } : null)} rows={4} maxLength={300} placeholder="Example: I would like clarification on this schedule impact because…" className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 text-slate-900 placeholder-slate-400 resize-none mb-1 ${delayModal.textError ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-slate-200'}`} />
                    <div className="flex items-center justify-between">
                      {delayModal.textError ? <p className="text-xs text-red-600">{delayModal.textError}</p> : <span />}
                      <span className="text-[10px] text-slate-400 tabular-nums">{delayModal.text.length}/300</span>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {previewMode ? (
                    <p className="text-xs text-slate-400 italic">Disabled in Client Portal Preview.</p>
                  ) : (
                    <>
                      {delayModal.mode === 'none' && (
                        <>
                          <button onClick={acknowledgeDelay} disabled={delayModal.submitting} className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"><ThumbsUp className="w-3.5 h-3.5" /> Acknowledge Schedule Update</button>
                          <button onClick={() => setDelayModal(m => m ? { ...m, mode: 'question', text: '', textError: '' } : null)} className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"><MessageSquare className="w-3.5 h-3.5" /> Ask a Question</button>
                          <button onClick={() => setDelayModal(m => m ? { ...m, mode: 'review', text: '', textError: '' } : null)} className="flex items-center gap-1.5 text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-700 px-4 py-2.5 rounded-lg hover:bg-orange-100 transition-colors"><Search className="w-3.5 h-3.5" /> Request Review</button>
                        </>
                      )}
                      {delayModal.mode === 'question' && (
                        <>
                          <button onClick={() => setDelayModal(m => m ? { ...m, mode: 'none', text: '', textError: '' } : null)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">Back</button>
                          <button onClick={submitQuestion} disabled={!delayModal.text.trim() || delayModal.submitting} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors"><Send className="w-3.5 h-3.5" />{delayModal.submitting ? 'Submitting...' : 'Submit Question'}</button>
                        </>
                      )}
                      {delayModal.mode === 'review' && (
                        <>
                          <button onClick={() => setDelayModal(m => m ? { ...m, mode: 'none', text: '', textError: '' } : null)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">Back</button>
                          <button onClick={submitReviewRequest} disabled={delayModal.submitting} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors"><Send className="w-3.5 h-3.5" />{delayModal.submitting ? 'Submitting...' : 'Submit Review Request'}</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Decision Response Modal (preserved verbatim) ── */}
      {modalState && (
        <Modal title="Review & Respond" onClose={() => setModalState(null)} size="md">
          {submitSuccess ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Response Submitted</p>
                <p className="text-xs text-slate-400 mt-1">Your project team has been notified.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl border-l-4 p-4 bg-slate-50 border border-slate-200 ${URGENCY[modalState.item.type].accent}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${URGENCY[modalState.item.type].pill}`}>{URGENCY[modalState.item.type].label}</span>
                  <span className="text-xs text-slate-400">{modalState.item.project}</span>
                  {modalState.item.dueDate && (
                    <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto"><Clock className="w-3 h-3" />Due {new Date(modalState.item.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-800 mb-1">{modalState.decision.decision_title}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{modalState.decision.description || modalState.item.detail}</p>
                {(modalState.decision.time_impact_days > 0 || modalState.decision.cost_impact > 0) && (
                  <div className="flex gap-4 mt-3 pt-3 border-t border-slate-200">
                    {modalState.decision.time_impact_days > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-800">{modalState.decision.time_impact_days} day{modalState.decision.time_impact_days !== 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Schedule Impact</p>
                      </div>
                    )}
                    {modalState.decision.cost_impact > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-800">${modalState.decision.cost_impact.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cost Impact</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Your Response <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea value={response} onChange={e => setResponse(e.target.value)} placeholder="Add any notes or questions for your project team..." rows={4} className="input-field resize-none" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <button onClick={() => setModalState(null)} className="btn-ghost text-xs">Cancel</button>
                {previewMode ? (
                  <p className="text-xs text-slate-400 italic">Disabled in Client Portal Preview.</p>
                ) : (
                  <button onClick={submitResponse} disabled={submitting} className="btn-primary text-xs min-w-[120px]">
                    {submitting ? (
                      <span className="flex items-center gap-1.5"><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Submitting...</span>
                    ) : (
                      <><Send className="w-3.5 h-3.5" />Submit Response</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
