import { useEffect, useState } from 'react';
import { supabase, Project, Task, Permit, Inspection } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Operations Watchlist metrics should only include active operational projects.
// Archived, deleted, and completed projects are excluded from live operations counts.
function isActiveOperationalProject(p: Project & { is_archived?: boolean; is_deleted?: boolean }) {
  if (p.is_deleted === true) return false;
  if (p.is_archived === true) return false;
  if (p.status === 'Archived' || p.status === 'Deleted' || p.status === 'Completed') return false;
  return true;
}
import ProjectPulse from '../components/ProjectPulse';
import {
  HardHat, FolderOpen, AlertTriangle, CheckCircle,
  Clock, ShieldCheck, ArrowUpRight, RefreshCw, Hammer,
  ClipboardList, CalendarCheck, CheckSquare, Zap, Sun
} from 'lucide-react';

interface GCStats {
  assignedProjects: number;
  onTrack: number;
  delayed: number;
  dueTomorrow: number;
  pendingInspections: number;
  permitIssues: number;
}

type StatColor = 'blue' | 'green' | 'red' | 'yellow' | 'neutral';

function StatTile({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: StatColor;
}) {
  const c: Record<StatColor, { bg: string; border: string; iconBg: string; iconColor: string; valueColor: string }> = {
    blue:    { bg: 'bg-white',        border: 'border-blue-100',    iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    valueColor: 'text-blue-700' },
    green:   { bg: 'bg-white',        border: 'border-emerald-100', iconBg: 'bg-emerald-50',  iconColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
    red:     { bg: 'bg-white',        border: 'border-red-200',     iconBg: 'bg-red-50',      iconColor: 'text-red-600',     valueColor: 'text-red-700' },
    yellow:  { bg: 'bg-white',        border: 'border-amber-200',   iconBg: 'bg-amber-50',    iconColor: 'text-amber-600',   valueColor: 'text-amber-700' },
    neutral: { bg: 'bg-slate-50',     border: 'border-slate-200',   iconBg: 'bg-slate-100',   iconColor: 'text-slate-500',   valueColor: 'text-slate-700' },
  };
  const s = c[color];
  return (
    <div className={`${s.bg} rounded-xl border ${s.border} p-4 hover:shadow-md transition-shadow`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${s.iconBg}`}>
        <Icon className={`w-4 h-4 ${s.iconColor}`} />
      </div>
      <p className={`text-2xl font-bold leading-none mb-0.5 ${s.valueColor}`}>{value}</p>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default function GCDashboardPage({
  onNavigateToProjects,
  onNavigateToField,
  onNavigateToActionBoard,
  onNavigateToTomorrow,
}: {
  onNavigateToProjects?: () => void;
  onNavigateToField?: () => void;
  onNavigateToActionBoard?: () => void;
  onNavigateToTomorrow?: () => void;
}) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GCStats>({
    assignedProjects: 0, onTrack: 0, delayed: 0,
    dueTomorrow: 0, pendingInspections: 0, permitIssues: 0,
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [blockers, setBlockers] = useState<{ id: string; text: string; project: string; level: 'red' | 'yellow' }[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [projectsRes, tasksRes, permitsRes, inspectionsRes] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('tasks').select('*').eq('is_deleted', false),
      supabase.from('permits').select('*'),
      supabase.from('inspections').select('*'),
    ]);

    const allProjectsRaw = (projectsRes.data || []) as (Project & { is_archived: boolean; is_deleted: boolean })[];
    const allTasks: Task[] = tasksRes.data || [];
    const allPermits: Permit[] = permitsRes.data || [];
    const allInspections: Inspection[] = inspectionsRes.data || [];

    // Operations Watchlist — active projects only
    const activeProjects = allProjectsRaw.filter(isActiveOperationalProject);
    const activeProjectIds = new Set(activeProjects.map(p => p.id));

    const delayed = activeProjects.filter(p => p.status === 'Delayed').length;
    const onTrack = activeProjects.filter(p => p.status === 'In Progress').length;
    const dueTomorrow = allTasks.filter(t =>
      activeProjectIds.has(t.project_id) && t.planned_start_date === tomorrow && t.status !== 'Completed'
    ).length;
    const permitIssues = allPermits.filter(p =>
      activeProjectIds.has(p.project_id) && (p.permit_status === 'Rejected' || p.permit_status === 'Revision Required')
    ).length;
    const pendingInspections = allInspections.filter(i =>
      activeProjectIds.has(i.project_id) && (i.result === 'Pending' || i.result === 'Scheduled')
    ).length;

    const blockerList: typeof blockers = [];
    allTasks.filter(t => activeProjectIds.has(t.project_id) && (t.status === 'Blocked' || t.status === 'Delayed')).slice(0, 6).forEach(t => {
      const proj = activeProjects.find(p => p.id === t.project_id);
      blockerList.push({
        id: t.id,
        text: t.task_name,
        project: proj?.project_name || 'Unknown',
        level: t.status === 'Blocked' ? 'red' : 'yellow',
      });
    });

    setStats({ assignedProjects: activeProjects.length, onTrack, delayed, dueTomorrow, pendingInspections, permitIssues });
    setProjects(activeProjects.slice(0, 6));
    setBlockers(blockerList);
    setLoading(false);
  }

  const statusBadge = (s: string) => {
    if (s === 'Delayed')     return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'In Progress') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'Completed')   return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  const criticalCount = stats.delayed + stats.permitIssues;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
              <HardHat className="w-4.5 h-4.5 text-white" style={{ width: '18px', height: '18px' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">GC Dashboard</h1>
                {criticalCount > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    {criticalCount} critical
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Welcome, {profile?.full_name?.split(' ')[0] || 'General Contractor'}&nbsp;&mdash;&nbsp;{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {onNavigateToField && (
            <button onClick={onNavigateToField} className="btn-primary text-xs">
              <Hammer className="w-3.5 h-3.5" />
              Field Mode
            </button>
          )}
          <button onClick={load} className="btn-ghost">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Project Pulse ── */}
      <ProjectPulse
        onViewYesterday={onNavigateToActionBoard}
        onViewToday={onNavigateToActionBoard}
        onViewTomorrow={onNavigateToTomorrow}
      />

      {/* ── Today's GC Action Summary ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-3.5 h-3.5 text-slate-400" />
          <span className="section-label">Today's Overview</span>
          <span className="text-xs text-slate-400 font-normal normal-case tracking-normal">— Key metrics across assigned projects</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile label="Assigned Projects"  value={stats.assignedProjects}     icon={FolderOpen}    color="blue" />
          <StatTile label="In Progress"        value={stats.onTrack}              icon={Hammer}        color={stats.onTrack > 0 ? 'blue' : 'neutral'} />
          <StatTile label="Delayed"            value={stats.delayed}              icon={AlertTriangle} color={stats.delayed > 0 ? 'red' : 'green'} />
          <StatTile label="Due Tomorrow"       value={stats.dueTomorrow}          icon={CalendarCheck} color={stats.dueTomorrow > 0 ? 'yellow' : 'green'} />
          <StatTile label="Inspections Pending"value={stats.pendingInspections}   icon={ShieldCheck}   color={stats.pendingInspections > 0 ? 'yellow' : 'green'} />
          <StatTile label="Permit Issues"      value={stats.permitIssues}         icon={CheckSquare}   color={stats.permitIssues > 0 ? 'red' : 'green'} />
        </div>
      </div>

      {/* ── Assigned Projects + Blockers (two column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Assigned Projects */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Assigned Projects</h2>
                <p className="text-xs text-slate-400">{projects.length} active project{projects.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {onNavigateToProjects && (
              <button onClick={onNavigateToProjects} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                View all <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {projects.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No projects assigned.</div>
            ) : projects.map(p => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/40 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.alert_status === 'red' ? 'bg-red-500' : p.alert_status === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{p.project_name}</p>
                  <p className="text-xs text-slate-400">{p.client_name}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge(p.status)}`}>{p.status}</span>
                <div className="flex items-center gap-2 w-20 flex-shrink-0">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.status === 'Delayed' ? 'bg-amber-400' : 'bg-blue-500'}`} style={{ width: `${p.progress_percentage}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400 w-7 text-right">{p.progress_percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Blockers + Site Readiness */}
        <div className="lg:col-span-2 space-y-4">

          {/* Blockers */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Blockers</h2>
                <p className="text-xs text-slate-400">
                  {blockers.length === 0 ? 'No active blockers.' : `${blockers.length} item${blockers.length !== 1 ? 's' : ''} need resolution.`}
                </p>
              </div>
            </div>
            <div className="p-4">
              {blockers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-5 text-center">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-xs font-bold text-emerald-700">All tasks moving.</p>
                  <p className="text-xs text-slate-400 mt-0.5">No blockers or delays reported.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockers.map(b => (
                    <div key={b.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl ${b.level === 'red' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${b.level === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{b.text}</p>
                        <p className="text-[11px] text-slate-500">{b.project}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Site Readiness */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Site Readiness</h2>
                <p className="text-xs text-slate-400">Inspection, permit &amp; schedule status.</p>
              </div>
            </div>
            <div className="px-5 py-2 divide-y divide-slate-50">
              {[
                { label: 'Inspections Pending', value: stats.pendingInspections, icon: ShieldCheck,  warn: stats.pendingInspections > 0 },
                { label: 'Permit Issues',        value: stats.permitIssues,       icon: Clock,         warn: stats.permitIssues > 0 },
                { label: 'Tasks Due Tomorrow',   value: stats.dueTomorrow,        icon: CalendarCheck, warn: stats.dueTomorrow > 3 },
              ].map(({ label, value, icon: Icon, warn }) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600">{label}</span>
                  </div>
                  <span className={`text-sm font-bold ${warn ? 'text-amber-600' : 'text-emerald-600'}`}>{value}</span>
                </div>
              ))}
            </div>
            {/* Permit/inspection issues callout */}
            {(stats.permitIssues > 0 || stats.pendingInspections > 0) && (
              <div className="px-5 pb-4 pt-1">
                {stats.permitIssues > 0 && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    {stats.permitIssues} permit{stats.permitIssues !== 1 ? 's' : ''} need{stats.permitIssues === 1 ? 's' : ''} attention — open Permits &amp; Inspections.
                  </div>
                )}
                {stats.pendingInspections > 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" />
                    {stats.pendingInspections} inspection{stats.pendingInspections > 1 ? 's' : ''} pending — confirm readiness.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Tomorrow's Plan Quick Link ── */}
      {onNavigateToTomorrow && (
        <div
          onClick={onNavigateToTomorrow}
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all group"
        >
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sun className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800">Review Tomorrow's Plan</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {stats.dueTomorrow > 0
                ? `${stats.dueTomorrow} task${stats.dueTomorrow !== 1 ? 's' : ''} scheduled — confirm crew availability.`
                : 'Plan and confirm crew readiness before end of day.'}
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
        </div>
      )}

    </div>
  );
}
