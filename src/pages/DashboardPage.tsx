import { useEffect, useState } from 'react';
import { supabase, Project, Task, Permit, Inspection, ClientDecision, PaymentMilestone, Incident } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ProjectPulse from '../components/ProjectPulse';
import OperatingLoopCard from '../components/OperatingLoopCard';
import AskCP360 from '../components/AskCP360';
import { getCriticalItems, getAdminNeedsAttentionItems, BoardItemSummary, DbActionItemRow } from '../lib/actionBoardHelpers';
import {
  FolderOpen, CheckSquare, AlertTriangle, Clock, FileText,
  Sparkles, RefreshCw,
  Hammer, Zap, ClipboardCheck, ArrowUpRight,
  GitBranch, ChevronRight, Activity, Search,
} from 'lucide-react';

// Operations Watchlist metrics should only include active operational projects.
// Archived, deleted, and completed projects are excluded from live operations counts.
function isActiveOperationalProject(p: Project & { is_archived?: boolean; is_deleted?: boolean }) {
  if (p.is_deleted === true) return false;
  if (p.is_archived === true) return false;
  if (p.status === 'Archived' || p.status === 'Deleted' || p.status === 'Completed') return false;
  return true;
}

interface DashboardStats {
  totalProjects: number;
  onTrack: number;
  delayed: number;
  milestoneDue: number;
  missedMilestones: number;
  pendingPermits: number;
  pendingInspections: number;
  openDecisions: number;
  pendingApprovals: number;
  overduePayments: number;
}

type StatLevel = 'green' | 'yellow' | 'red' | 'blue' | 'neutral';

function StatCard({
  label, value, icon: Icon, level, detail, onClick, ariaLabel,
}: {
  label: string; value: number; icon: React.ElementType;
  level: StatLevel; detail?: string; onClick?: () => void; ariaLabel?: string;
}) {
  const configs: Record<StatLevel, { iconBg: string; iconColor: string; valueColor: string; bg: string; border: string }> = {
    green:   { bg: 'bg-white',      border: 'border-slate-200',   iconBg: 'bg-emerald-50',  iconColor: 'text-emerald-600',  valueColor: 'text-emerald-700' },
    yellow:  { bg: 'bg-white',      border: 'border-amber-200',   iconBg: 'bg-amber-50',    iconColor: 'text-amber-700',    valueColor: 'text-amber-700' },
    red:     { bg: 'bg-white',      border: 'border-red-200',     iconBg: 'bg-red-50',      iconColor: 'text-red-600',      valueColor: 'text-red-700' },
    blue:    { bg: 'bg-white',      border: 'border-blue-200',    iconBg: 'bg-blue-50',     iconColor: 'text-blue-600',     valueColor: 'text-blue-800' },
    neutral: { bg: 'bg-slate-50',   border: 'border-slate-200',   iconBg: 'bg-slate-100',   iconColor: 'text-slate-500',    valueColor: 'text-slate-700' },
  };
  const c = configs[level];
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel ?? (onClick ? `View ${label}` : undefined)}
      title={ariaLabel ?? (onClick ? `View ${label}` : undefined)}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={`${c.bg} rounded-lg border ${c.border} p-4 transition-all hover:shadow-md ${onClick ? 'cursor-pointer hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.iconBg}`}>
          <Icon className={`w-4 h-4 ${c.iconColor}`} />
        </div>
        {value > 0 && (level === 'red' || level === 'yellow') && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            level === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
          }`}>Needs Attention</span>
        )}
      </div>
      <p className={`text-2xl font-bold ${c.valueColor} mb-0.5 leading-none`}>{value}</p>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider leading-tight">{label}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-1">{detail}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      <span className="section-label">{title}</span>
      {description && <span className="text-xs text-slate-400 font-normal normal-case tracking-normal">— {description}</span>}
    </div>
  );
}

export default function DashboardPage({
  onNavigateToProjects,
  onNavigateToActionBoard,
  onNavigateToTomorrow,
  onNavigateToAlerts,
  onNavigateToTasks,
  onNavigateToPermits,
  onViewProject,
  onNavigateToDailyUpdates,
}: {
  onNavigateToProjects?: (statusFilter?: string) => void;
  onNavigateToActionBoard?: (filter?: string) => void;
  onNavigateToTomorrow?: () => void;
  onNavigateToAlerts?: () => void;
  onNavigateToTasks?: (filter?: string) => void;
  onNavigateToPermits?: (filter?: string) => void;
  onViewProject?: (id: string) => void;
  onNavigateToDailyUpdates?: () => void;
}) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0, onTrack: 0, delayed: 0, milestoneDue: 0,
    missedMilestones: 0, pendingPermits: 0, pendingInspections: 0,
    openDecisions: 0, pendingApprovals: 0, overduePayments: 0,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch]   = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>('all');
  const [criticalItems, setCriticalItems]   = useState<BoardItemSummary[]>([]);
  const [needsAttentionItems, setNeedsAttentionItems] = useState<BoardItemSummary[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const twoDaysOut = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

    const [projectsRes, tasksRes, permitsRes, inspectionsRes, decisionsRes, approvalsRes, paymentsRes, incidentsRes, delaysRes, actionItemsRes] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('tasks').select('*').eq('is_deleted', false),
      supabase.from('permits').select('*'),
      supabase.from('inspections').select('*'),
      supabase.from('client_decisions').select('*'),
      supabase.from('schedule_change_requests').select('id, project_id').eq('status', 'Pending'),
      supabase.from('payment_milestones').select('*'),
      supabase.from('incidents').select('*').neq('incident_status', 'Resolved').neq('incident_status', 'Closed'),
      supabase.from('project_delay_reasons').select('*').neq('status', 'Closed').neq('status', 'Resolved'),
      supabase.from('action_items').select('id,source_id,status,snoozed_until'),
    ]);

    const allProjects = (projectsRes.data || []) as (Project & { is_archived: boolean; is_deleted: boolean })[];
    const tasks: Task[] = tasksRes.data || [];
    const permits: Permit[] = permitsRes.data || [];
    const inspections: Inspection[] = inspectionsRes.data || [];
    const decisions: ClientDecision[] = decisionsRes.data || [];
    const approvals = approvalsRes.data || [];
    const payments: PaymentMilestone[] = paymentsRes.data || [];
    const incidents: Incident[] = incidentsRes.data || [];
    const delays = delaysRes.data || [];
    const actionItemsDb: DbActionItemRow[] = actionItemsRes.data || [];

    // Operations Watchlist — active projects only
    const activeProjects = allProjects.filter(isActiveOperationalProject);
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    // Permit-applicable projects: active + not marked "Not Applicable"
    const permitApplicableIds = new Set(
      activeProjects.filter(p => (p as any).permits_applicability !== 'Not Applicable').map(p => p.id)
    );

    const delayed = activeProjects.filter(p => p.status === 'Delayed').length;
    const onTrack = activeProjects.filter(p => p.status === 'In Progress').length;

    function isPermitTask(t: Task) {
      return t.task_type === 'Permit Task' || t.category === 'Permit' || t.category === 'Inspection';
    }
    function taskCountable(t: Task) {
      if (!activeProjectIds.has(t.project_id)) return false;
      if (isPermitTask(t) && !permitApplicableIds.has(t.project_id)) return false;
      return true;
    }

    const milestoneDue = tasks.filter(t =>
      taskCountable(t) && t.status !== 'Completed' && t.planned_finish_date &&
      t.planned_finish_date >= today && t.planned_finish_date <= twoDaysOut
    ).length;
    const missedMilestones = tasks.filter(t =>
      taskCountable(t) && t.status !== 'Completed' && t.planned_finish_date && t.planned_finish_date < today
    ).length;
    const pendingPermits = permits.filter(p =>
      permitApplicableIds.has(p.project_id) && p.permit_status !== 'Approved'
    ).length;
    const pendingInspections = inspections.filter(i =>
      permitApplicableIds.has(i.project_id) && i.result !== 'Passed'
    ).length;
    const openDecisions = decisions.filter(d =>
      activeProjectIds.has(d.project_id) && d.status !== 'Received'
    ).length;
    const overduePayments = payments.filter(p =>
      activeProjectIds.has(p.project_id) && p.status !== 'Paid' && p.due_date && p.due_date < today
    ).length;

    setStats({
      totalProjects: activeProjects.length, onTrack, delayed, milestoneDue,
      missedMilestones, pendingPermits, pendingInspections, openDecisions,
      pendingApprovals: approvals.filter((a: { project_id: string }) => activeProjectIds.has(a.project_id)).length, overduePayments,
    });
    setRecentProjects(activeProjects.slice(0, 8));

    // Use the shared helper — same logic as Action Board critical filter
    const boardData = {
      tasks: tasks.filter(t => !['Completed', 'Closed', 'Cancelled'].includes(t.status)),
      permits,
      inspections,
      payments,
      incidents,
      decisions: decisions.filter(d => d.status !== 'Received'),
      delays,
      actionItemsDb,
      activeProjectIds,
      today,
    };
    const critical     = getCriticalItems(boardData);
    const needsAttn    = getAdminNeedsAttentionItems(boardData);

    console.log('DASHBOARD_CRITICAL_IDS', critical.map(i => i.id));
    console.log('DASHBOARD_NEEDS_ATTENTION_IDS', needsAttn.map(i => i.id));

    setCriticalItems(critical);
    setNeedsAttentionItems(needsAttn);
    setLoading(false);
  }

  async function generateAiSummary() {
    setAiLoading(true);
    const lines: string[] = [];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    lines.push(`Today is ${today}.`);
    if (stats.delayed > 0) lines.push(`${stats.delayed} project${stats.delayed > 1 ? 's are' : ' is'} currently delayed — review and escalate.`);
    else lines.push(`All active DECKARC projects are progressing on schedule.`);
    if (stats.missedMilestones > 0) lines.push(`${stats.missedMilestones} milestone${stats.missedMilestones > 1 ? 's are' : ' is'} past due. Escalate to GC today.`);
    if (stats.milestoneDue > 0) lines.push(`${stats.milestoneDue} milestone${stats.milestoneDue > 1 ? 's' : ''} due within 48 hours — confirm field status.`);
    if (stats.pendingPermits > 0) lines.push(`${stats.pendingPermits} permit${stats.pendingPermits > 1 ? 's' : ''} pending — check for rejections or revisions needed.`);
    if (stats.openDecisions > 0) lines.push(`${stats.openDecisions} client decision${stats.openDecisions > 1 ? 's' : ''} open. Follow up to prevent schedule slippage.`);
    if (stats.pendingApprovals > 0) lines.push(`${stats.pendingApprovals} schedule change request${stats.pendingApprovals > 1 ? 's' : ''} awaiting review.`);
    if (stats.overduePayments > 0) lines.push(`${stats.overduePayments} payment milestone${stats.overduePayments > 1 ? 's are' : ' is'} overdue.`);
    if (criticalItems.length > 0) lines.push(`${criticalItems.length} critical item${criticalItems.length > 1 ? 's' : ''} on the Action Board — review immediately.`);
    lines.push(`Recommended: Start with critical items on the Action Board, then confirm daily updates are submitted.`);
    await new Promise(r => setTimeout(r, 700));
    setAiSummary(lines.join(' '));
    setAiLoading(false);
  }

  const statusConfig = (status: string) => {
    if (status === 'Delayed')     return { bg: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-500' };
    if (status === 'In Progress') return { bg: 'bg-blue-50 text-blue-700 border-blue-200',        dot: 'bg-blue-500' };
    if (status === 'Completed')   return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    if (status === 'Planning')    return { bg: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400' };
    return { bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm font-medium">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Welcome, {profile?.full_name?.split(' ')[0] || 'Company Admin'}.
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            &nbsp;· Company Dashboard
          </p>
        </div>
        <button onClick={loadDashboard} className="btn-ghost text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Alert Banner (if critical items exist) ── */}
      {criticalItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-800">{criticalItems.length} critical item{criticalItems.length !== 1 ? 's' : ''} need immediate attention</p>
            <p className="text-xs text-red-600 mt-0.5 truncate">{criticalItems[0].title}{criticalItems.length > 1 ? ` +${criticalItems.length - 1} more` : ''}</p>
          </div>
          {onNavigateToActionBoard && (
            <button onClick={() => onNavigateToActionBoard('critical')} className="btn-primary text-xs flex-shrink-0 bg-red-600 hover:bg-red-700">
              View Critical
            </button>
          )}
        </div>
      )}

      {/* ── Operating Loop + Ask CP360 ── */}
      <OperatingLoopCard />
      <AskCP360 />

      {/* ── Project Pulse ── */}
      <ProjectPulse
        onViewYesterday={onNavigateToDailyUpdates}
        onViewToday={onNavigateToActionBoard ? () => onNavigateToActionBoard('all') : undefined}
        onViewTodayNeedsAttention={onNavigateToActionBoard ? () => onNavigateToActionBoard('needs-attention') : undefined}
        onViewTomorrow={onNavigateToTomorrow}
      />

      {/* ── Operations Watchlist ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <SectionHeader icon={Activity} title="Operations Watchlist" description="Active projects only — click any card to drill down" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatCard
            label="Total Projects" value={stats.totalProjects} icon={FolderOpen} level="blue"
            onClick={onNavigateToProjects ? () => onNavigateToProjects() : undefined}
            ariaLabel="View all active projects"
          />
          <StatCard
            label="In Progress" value={stats.onTrack} icon={Hammer} level={stats.onTrack > 0 ? 'blue' : 'neutral'}
            onClick={onNavigateToProjects ? () => onNavigateToProjects('In Progress') : undefined}
            ariaLabel="View active in-progress projects"
          />
          <StatCard
            label="Delayed" value={stats.delayed} icon={AlertTriangle} level={stats.delayed > 0 ? 'red' : 'green'}
            onClick={onNavigateToProjects ? () => onNavigateToProjects('Delayed') : undefined}
            ariaLabel="View active delayed projects"
          />
          <StatCard
            label="Due in 48h" value={stats.milestoneDue} icon={Clock} level={stats.milestoneDue > 0 ? 'yellow' : 'green'}
            onClick={onNavigateToTasks ? () => onNavigateToTasks('due48') : undefined}
            ariaLabel="View tasks and milestones due in 48 hours"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Missed Milestones" value={stats.missedMilestones} icon={CheckSquare} level={stats.missedMilestones > 0 ? 'red' : 'green'}
            onClick={onNavigateToTasks ? () => onNavigateToTasks('missed') : undefined}
            ariaLabel="View missed milestones from active projects"
          />
          <StatCard
            label="Permits Pending" value={stats.pendingPermits} icon={FileText} level={stats.pendingPermits > 0 ? 'yellow' : 'green'}
            onClick={onNavigateToPermits ? () => onNavigateToPermits('pending') : undefined}
            ariaLabel="View permit issues from active projects"
          />
          <StatCard
            label="Open Decisions" value={stats.openDecisions} icon={ClipboardCheck} level={stats.openDecisions > 0 ? 'yellow' : 'green'}
            onClick={onNavigateToActionBoard ? () => onNavigateToActionBoard('decisions') : undefined}
            ariaLabel="View open decisions from active projects"
          />
          <StatCard
            label="Pending Approvals" value={stats.pendingApprovals} icon={GitBranch} level={stats.pendingApprovals > 0 ? 'yellow' : 'green'}
            onClick={onNavigateToActionBoard ? () => onNavigateToActionBoard('follow-up') : undefined}
            ariaLabel="View pending approvals from active projects"
          />
        </div>
      </div>

      {/* ── AI Briefing + Active Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* AI Site Intelligence */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <SectionHeader icon={Sparkles} title="AI Site Intelligence" description="Daily operations briefing" />
          <div className="flex justify-end mb-3">
            <button onClick={generateAiSummary} disabled={aiLoading} className="btn-primary text-xs px-3 py-1.5">
              {aiLoading ? (
                <span className="flex items-center gap-1.5">
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Analyzing...
                </span>
              ) : (
                <><Zap className="w-3 h-3" />Generate Briefing</>
              )}
            </button>
          </div>
          {aiSummary ? (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed">{aiSummary}</p>
            </div>
          ) : (
            <div className="bg-slate-50/50 rounded-xl p-6 border border-dashed border-slate-200 text-center">
              <Sparkles className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Click <strong className="text-slate-500">Generate Briefing</strong> for a smart daily summary — current risks, missing updates, and recommended actions.</p>
            </div>
          )}
        </div>

        {/* Alert Summary */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
              <span className="section-label">Alert Summary</span>
              {criticalItems.length > 0 && <span className="text-xs text-slate-400 font-normal">— {criticalItems.length} critical</span>}
            </div>
            {onNavigateToAlerts && (
              <button onClick={onNavigateToAlerts} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                View Alerts <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {criticalItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                <CheckSquare className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-emerald-700">All clear</p>
              <p className="text-xs text-slate-400 mt-1">No critical items across active projects.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {criticalItems.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm bg-red-50 border-red-200 text-red-700"
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-500" />
                  <span className="text-xs font-medium truncate">{item.title}</span>
                  <span className="text-[10px] text-red-400 truncate ml-auto flex-shrink-0">{item.subtitle}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Access ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <SectionHeader icon={Zap} title="Quick Access" description="Navigate to most-used tools" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'View Action Board',  icon: Zap,          color: 'bg-blue-50 border-blue-200 text-blue-700',      iconC: 'bg-blue-100 text-blue-600',      onClick: onNavigateToActionBoard },
            { label: "Tomorrow's Plan",    icon: Clock,        color: 'bg-amber-50 border-amber-200 text-amber-700',   iconC: 'bg-amber-100 text-amber-600',    onClick: onNavigateToTomorrow },
            { label: 'View Alerts',        icon: AlertTriangle,color: 'bg-slate-50 border-slate-200 text-slate-700',   iconC: 'bg-slate-100 text-slate-500',    onClick: onNavigateToAlerts },
            { label: 'View Projects',      icon: FolderOpen,   color: 'bg-slate-50 border-slate-200 text-slate-700',   iconC: 'bg-slate-100 text-slate-500',    onClick: onNavigateToProjects },
          ].map(({ label, icon: Icon, color, iconC, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-md ${color} ${onClick ? 'cursor-pointer' : 'opacity-50 cursor-default'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconC}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold leading-tight flex-1">{label}</span>
              {onClick && <ArrowUpRight className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active Projects Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
              <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Active Projects</h2>
              <p className="text-xs text-slate-400">{stats.totalProjects} active project{stats.totalProjects !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {onNavigateToProjects && (
            <button onClick={onNavigateToProjects} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              placeholder="Search projects or clients..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
            />
          </div>
          <select
            value={projectStatusFilter}
            onChange={e => setProjectStatusFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
          >
            <option value="all">All Statuses</option>
            <option value="In Progress">In Progress</option>
            <option value="Delayed">Delayed</option>
            <option value="Planning">Planning</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
        </div>

        {recentProjects.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No projects yet.</div>
        ) : (() => {
          const pq = projectSearch.trim().toLowerCase();
          const visible = recentProjects.filter(p =>
            (projectStatusFilter === 'all' || p.status === projectStatusFilter) &&
            (!pq || p.project_name.toLowerCase().includes(pq) || (p.client_name || '').toLowerCase().includes(pq))
          );
          return visible.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No projects match your search.</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Finish</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const sc = statusConfig(p.status);
                  const alertDot = p.alert_status === 'red' ? 'bg-red-500' : p.alert_status === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${alertDot}`} />
                          <span className="font-semibold text-slate-900 text-sm">{p.project_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">{p.client_name}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${sc.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                p.status === 'Delayed' ? 'bg-amber-400' :
                                p.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${p.progress_percentage}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-500 w-8">{p.progress_percentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs">
                        {p.projected_finish_date && p.projected_finish_date !== p.expected_finish_date ? (
                          <span>
                            <span className="line-through text-slate-300 mr-1.5">
                              {p.expected_finish_date ? new Date(p.expected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                            </span>
                            <span className="text-amber-600 font-semibold">
                              {new Date(p.projected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </span>
                        ) : (
                          p.expected_finish_date
                            ? new Date(p.expected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {onViewProject && (
                          <button onClick={() => onViewProject(p.id)} className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5">
                            View <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          );
        })()}
      </div>

    </div>
  );
}
