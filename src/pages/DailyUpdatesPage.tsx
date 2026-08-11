import { useEffect, useState } from 'react';
import { supabase, DailyUpdate, Project, Task } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, ChevronUp, Calendar, User } from 'lucide-react';

interface SubmitterInfo {
  full_name: string;
  role: string;
  trade_specialty: string | null;
  company_name: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  DECKARC_ADMIN:         'Admin',
  CONVAZANT_SUPER_ADMIN: 'Admin',
  GENERAL_CONTRACTOR:    'GC',
  SUBCONTRACTOR:         'Subcontractor',
  CLIENT:                'Client',
};

export default function DailyUpdatesPage() {
  const { profile } = useAuth();
  const [updates, setUpdates] = useState<(DailyUpdate & { project?: Project; task?: Task; submitter?: SubmitterInfo })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    let q = supabase.from('daily_updates').select('*').order('update_date', { ascending: false }).order('created_at', { ascending: false });
    if (profile?.role === 'SUBCONTRACTOR') q = q.eq('user_id', profile.id);

    const [updatesRes, projectsRes, tasksRes] = await Promise.all([
      q,
      supabase.from('projects').select('*').eq('is_deleted', false).eq('is_archived', false),
      supabase.from('tasks').select('id, task_name'),
    ]);

    const allProjects: Project[] = projectsRes.data || [];
    const activeProjects = allProjects.filter(p =>
      p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted'
    );
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const projectMap = new Map(activeProjects.map(p => [p.id, p]));
    const taskMap = new Map((tasksRes.data || []).map(t => [t.id, t]));

    const rawUpdates = (updatesRes.data || []).filter(u => activeProjectIds.has(u.project_id));

    // Load submitter profiles
    const userIds = [...new Set(rawUpdates.map(u => u.user_id).filter(Boolean))];
    const submitterMap = new Map<string, SubmitterInfo>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, trade_specialty, company_name')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => {
        submitterMap.set(p.id, {
          full_name:      p.full_name,
          role:           p.role,
          trade_specialty: p.trade_specialty,
          company_name:   p.company_name,
        });
      });
    }

    const enriched = rawUpdates.map(u => ({
      ...u,
      project:   projectMap.get(u.project_id),
      task:      u.task_id ? taskMap.get(u.task_id) : undefined,
      submitter: u.user_id ? submitterMap.get(u.user_id) : undefined,
    }));
    setUpdates(enriched);
    setProjects(activeProjects);
    setLoading(false);
  }

  const filtered = projectFilter ? updates.filter(u => u.project_id === projectFilter) : updates;

  const grouped: { date: string; items: typeof filtered }[] = [];
  const dateMap = new Map<string, typeof filtered>();
  filtered.forEach(u => {
    const d = u.update_date;
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d)!.push(u);
  });
  dateMap.forEach((items, date) => grouped.push({ date, items }));
  grouped.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-concrete-900">Daily Updates</h1>
          <p className="text-sm text-concrete-500 mt-0.5">{updates.length} total updates</p>
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-concrete-400 text-sm">Loading updates...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-concrete-400 text-sm">No updates found.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-concrete-400" />
                <h2 className="text-sm font-semibold text-concrete-700">
                  {new Date(group.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <span className="text-xs text-concrete-400">{group.items.length} update{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {group.items.map(u => {
                  const isOpen = expanded === u.id;
                  const sub = u.submitter;
                  const submitterLabel = sub
                    ? [
                        sub.full_name,
                        ROLE_LABELS[sub.role] || sub.role,
                        sub.trade_specialty || sub.company_name,
                      ].filter(Boolean).join(' · ')
                    : null;

                  return (
                    <div key={u.id} className="card overflow-hidden">
                      <button className="w-full flex items-center justify-between p-4 text-left hover:bg-concrete-50 transition-colors"
                        onClick={() => setExpanded(isOpen ? null : u.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-concrete-900">{u.project?.project_name || 'Unknown Project'}</span>
                            {u.task && <span className="text-xs text-concrete-500 bg-concrete-100 px-2 py-0.5 rounded-full">{u.task.task_name}</span>}
                            {u.delay_days > 0 && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">+{u.delay_days}d delay</span>}
                          </div>
                          <p className="text-xs text-concrete-500 mt-0.5 truncate max-w-md">{u.work_completed_today}</p>
                          {/* Submitted by — visible in collapsed view */}
                          {submitterLabel && (
                            <div className="flex items-center gap-1 mt-1">
                              <User className="w-3 h-3 text-concrete-300 flex-shrink-0" />
                              <span className="text-xs text-concrete-400">{submitterLabel}</span>
                            </div>
                          )}
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-concrete-400 flex-shrink-0 ml-3" /> : <ChevronDown className="w-4 h-4 text-concrete-400 flex-shrink-0 ml-3" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-concrete-50 pt-3">
                          {/* Submitter info banner */}
                          {sub && (
                            <div className="flex items-center gap-2 mb-3 bg-concrete-50 rounded-lg px-3 py-2">
                              <User className="w-3.5 h-3.5 text-concrete-400 flex-shrink-0" />
                              <span className="text-xs font-semibold text-concrete-700">{sub.full_name}</span>
                              <span className="text-xs text-concrete-400">·</span>
                              <span className="text-xs text-concrete-500">{ROLE_LABELS[sub.role] || sub.role}</span>
                              {(sub.trade_specialty || sub.company_name) && (
                                <>
                                  <span className="text-xs text-concrete-400">·</span>
                                  <span className="text-xs text-concrete-500">{sub.trade_specialty || sub.company_name}</span>
                                </>
                              )}
                              <span className="text-xs text-concrete-400 ml-auto">
                                {new Date(u.created_at).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                })}
                              </span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            {u.work_completed_today && <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Completed</p><p className="text-concrete-800">{u.work_completed_today}</p></div>}
                            {u.work_planned_tomorrow && <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Tomorrow</p><p className="text-concrete-800">{u.work_planned_tomorrow}</p></div>}
                            {u.blockers && <div><p className="text-xs font-medium text-hazard-500 mb-0.5">Blockers</p><p className="text-concrete-800">{u.blockers}</p></div>}
                            {u.delay_reason && <div><p className="text-xs font-medium text-amber-600 mb-0.5">Delay ({u.delay_days}d)</p><p className="text-concrete-800">{u.delay_reason}</p></div>}
                            {u.materials_delivered && <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Materials In</p><p className="text-concrete-800">{u.materials_delivered}</p></div>}
                            {u.materials_pending && <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Materials Pending</p><p className="text-concrete-800">{u.materials_pending}</p></div>}
                            {u.weather_issue && <div><p className="text-xs font-medium text-concrete-500 mb-0.5">Weather</p><p className="text-concrete-800">{u.weather_issue}</p></div>}
                            {u.client_visible_note && <div className="sm:col-span-2"><p className="text-xs font-medium text-steel-600 mb-0.5">Client Note</p><p className="text-concrete-800">{u.client_visible_note}</p></div>}
                            {u.internal_note && <div className="sm:col-span-2"><p className="text-xs font-medium text-concrete-400 mb-0.5">Internal</p><p className="text-concrete-800">{u.internal_note}</p></div>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
