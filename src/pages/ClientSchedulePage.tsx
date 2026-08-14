import { useEffect, useState } from 'react';
import { CalendarDays, Clock, AlertTriangle, Search, Loader, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ProjectPhase {
  id: string;
  project_id: string;
  project_name: string;
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

interface ScheduleUpdate {
  id: string;
  project_id: string;
  project_name: string;
  client_safe_reason: string;
  revised_projected_completion: string | null;
  original_projected_completion: string | null;
  estimated_delay_days: number;
  client_visibility_status: string;
  created_at: string;
}

interface ProjectSummary {
  id: string;
  project_name: string;
  status: string;
  progress_percentage: number;
  expected_finish_date: string | null;
  projected_finish_date: string | null;
}

const TASK_STATUS_CFG: Record<string, { pill: string; dot: string }> = {
  Completed:      { pill: 'bg-green-50 text-green-700 border-green-200',    dot: 'bg-green-500'   },
  'In Progress':  { pill: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500'    },
  'Not Started':  { pill: 'bg-slate-50 text-slate-400 border-slate-200',    dot: 'bg-slate-200'   },
  Delayed:        { pill: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500'   },
  Blocked:        { pill: 'bg-red-50 text-red-700 border-red-200',          dot: 'bg-red-400'     },
  Waiting:        { pill: 'bg-slate-50 text-slate-500 border-slate-200',    dot: 'bg-slate-300'   },
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function normalizeStatus(s: string): string {
  if (s === 'Completed' || s === 'Done') return 'Completed';
  if (s === 'In Progress') return 'In Progress';
  if (s === 'Delayed') return 'Delayed';
  if (s === 'Blocked') return 'Blocked';
  if (s === 'Waiting') return 'Waiting';
  return 'Not Started';
}

export default function ClientSchedulePage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<ProjectPhase[]>([]);
  const [scheduleUpdates, setScheduleUpdates] = useState<ScheduleUpdate[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function load() {
    setLoading(true);

    const [{ data: projData }, { data: taskData }, { data: delayData }] = await Promise.all([
      supabase
        .from('projects')
        .select('id, project_name, status, progress_percentage, expected_finish_date, projected_finish_date'),
      supabase
        .from('tasks')
        .select('id, project_id, task_name, category, status, progress_percentage, planned_start_date, planned_finish_date, projected_finish_date, actual_finish_date, client_visible_notes, delay_days, projects(project_name)')
        .eq('is_client_visible', true)
        .order('planned_start_date', { ascending: true }),
      supabase
        .from('project_delay_reasons')
        .select('id, project_id, client_safe_reason, revised_projected_completion, original_projected_completion, estimated_delay_days, client_visibility_status, created_at, projects(project_name)')
        .eq('client_visible', true)
        .eq('client_visibility_status', 'Visible to Client')
        .order('created_at', { ascending: false }),
    ]);

    setProjects((projData || []) as ProjectSummary[]);
    setTasks(
      (taskData || []).map((t: any) => ({
        ...t,
        project_name: t.projects?.project_name || '',
      }))
    );
    setScheduleUpdates(
      (delayData || []).map((d: any) => ({
        ...d,
        project_name: d.projects?.project_name || '',
      }))
    );
    setLoading(false);
  }

  const projectOptions = projects.filter(p => tasks.some(t => t.project_id === p.id));

  const filteredTasks = tasks.filter(t => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || t.task_name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || normalizeStatus(t.status) === statusFilter;
    const matchProject = projectFilter === 'all' || t.project_id === projectFilter;
    return matchQ && matchStatus && matchProject;
  });

  const activeTask = tasks.find(t => normalizeStatus(t.status) === 'In Progress');
  const completedCount = tasks.filter(t => normalizeStatus(t.status) === 'Completed').length;
  const delayedCount = tasks.filter(t => normalizeStatus(t.status) === 'Delayed' || t.delay_days > 0).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-steel-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Schedule</span>
          {!loading && delayedCount > 0 && (
            <span className="ml-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              {delayedCount} delayed
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-6 space-y-5">

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading schedule...</span>
          </div>
        ) : (
          <>
            {/* Project summaries */}
            {projects.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.filter(p => tasks.some(t => t.project_id === p.id)).map(p => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm">
                    <p className="text-xs font-semibold text-slate-500 truncate mb-2">{p.project_name}</p>
                    <div className="flex items-end justify-between mb-2">
                      <span className="text-2xl font-bold text-slate-900">{p.progress_percentage || 0}%</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        p.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        p.status === 'Delayed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>{p.status}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.progress_percentage || 0}%` }} />
                    </div>
                    {(p.projected_finish_date || p.expected_finish_date) && (
                      <p className="text-[10px] text-slate-400 mt-2">
                        Est. completion: {fmtDate(p.projected_finish_date || p.expected_finish_date)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Active phase callout */}
            {activeTask && (
              <div className="rounded-xl px-5 py-4 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #0d1e36 0%, #1e3f6e 100%)', boxShadow: '0 4px 20px rgba(13,30,54,0.25)' }}>
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Currently In Progress</p>
                  <p className="text-sm font-bold text-white truncate">{activeTask.task_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeTask.project_name && `${activeTask.project_name} · `}
                    {activeTask.progress_percentage}% complete
                    {activeTask.planned_finish_date && ` · Est. ${fmtDate(activeTask.planned_finish_date)}`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-white">{completedCount}/{tasks.length}</p>
                  <p className="text-[11px] text-slate-400">milestones done</p>
                </div>
              </div>
            )}

            {/* Schedule updates from delay reasons */}
            {scheduleUpdates.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <h2 className="text-sm font-semibold text-amber-800">Schedule Updates</h2>
                </div>
                <div className="divide-y divide-amber-100">
                  {scheduleUpdates.slice(0, 3).map(u => (
                    <div key={u.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {u.project_name && (
                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">{u.project_name}</p>
                          )}
                          <p className="text-sm text-amber-900 leading-relaxed">{u.client_safe_reason}</p>
                          {u.revised_projected_completion && (
                            <p className="text-xs text-amber-700 mt-1">
                              Revised completion: <span className="font-semibold">{fmtDate(u.revised_projected_completion)}</span>
                              {u.estimated_delay_days > 0 && ` (+${u.estimated_delay_days} day${u.estimated_delay_days !== 1 ? 's' : ''})`}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-amber-600 flex-shrink-0">
                          {fmtDate(u.created_at.split('T')[0])}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Project Timeline</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Showing milestones approved for client visibility</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search milestones..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
                  />
                </div>
                {projectOptions.length > 1 && (
                  <select
                    value={projectFilter}
                    onChange={e => setProjectFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
                  >
                    <option value="all">All Projects</option>
                    {projectOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                  </select>
                )}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Not Started">Not Started</option>
                  <option value="Delayed">Delayed</option>
                </select>
              </div>

              {tasks.length === 0 ? (
                <div className="py-16 text-center">
                  <CalendarDays className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No milestones yet</p>
                  <p className="text-xs text-slate-400 mt-1">Your project schedule will appear here once milestones are set up.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="pl-5 pr-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Milestone / Task</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Planned Date</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Expected Completion</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">Client Note</th>
                        <th className="pl-3 pr-5 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Action Needed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 ? (
                        <tr><td colSpan={6} className="py-10 text-center text-xs text-slate-400">No milestones match your search.</td></tr>
                      ) : filteredTasks.map((t) => {
                        const norm = normalizeStatus(t.status);
                        const cfg = TASK_STATUS_CFG[norm] || TASK_STATUS_CFG['Not Started'];
                        const isActive = norm === 'In Progress';
                        const isDelayed = norm === 'Delayed' || t.delay_days > 0;
                        const isBlocked = norm === 'Blocked';

                        let actionNeeded: { label: string; style: string } | null = null;
                        if (isBlocked) {
                          actionNeeded = { label: 'Awaiting Resolution', style: 'bg-red-50 text-red-700 border-red-200' };
                        } else if (isDelayed) {
                          actionNeeded = { label: `${t.delay_days > 0 ? `${t.delay_days}d delayed` : 'Delayed'} — see updates`, style: 'bg-amber-50 text-amber-700 border-amber-200' };
                        } else if (norm === 'Waiting') {
                          actionNeeded = { label: 'Pending predecessor', style: 'bg-slate-50 text-slate-500 border-slate-200' };
                        }

                        return (
                          <tr key={t.id} className={`border-b border-slate-100 last:border-b-0 transition-colors ${isActive ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}>
                            <td className="pl-5 pr-3 py-3.5 align-middle">
                              <p className={`text-sm ${isActive ? 'text-slate-900' : norm === 'Completed' ? 'text-slate-400' : 'text-slate-700'}`}>
                                {t.task_name}
                              </p>
                              {projectOptions.length > 1 && (
                                <p className="text-xs text-slate-400 mt-0.5">{t.project_name}</p>
                              )}
                            </td>
                            <td className="px-3 py-3.5 align-middle whitespace-nowrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                                {norm}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 align-middle whitespace-nowrap hidden sm:table-cell">
                              <span className="text-xs text-slate-500">{fmtDate(t.planned_start_date) || '—'}</span>
                            </td>
                            <td className="px-3 py-3.5 align-middle whitespace-nowrap hidden sm:table-cell">
                              <span className={`text-xs ${isDelayed ? 'text-amber-600' : 'text-slate-500'}`}>
                                {fmtDate(t.projected_finish_date || t.planned_finish_date) || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 align-middle hidden md:table-cell">
                              {t.client_visible_notes
                                ? <p className="text-xs text-slate-600 max-w-xs">{t.client_visible_notes}</p>
                                : <span className="text-xs text-slate-300">—</span>}
                            </td>
                            <td className="pl-3 pr-5 py-3.5 align-middle">
                              {actionNeeded
                                ? <span className={`text-xs px-2 py-0.5 rounded-full border ${actionNeeded.style}`}>{actionNeeded.label}</span>
                                : <span className="text-xs text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex items-center gap-2 justify-center text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <p>Schedule is maintained by your DECKARC project coordinator.</p>
        </div>
      </div>
    </div>
  );
}
