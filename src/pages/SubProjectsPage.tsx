import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FolderOpen, MapPin, CheckSquare, MessageSquare, Clock, ChevronRight, RefreshCw } from 'lucide-react';

interface SubProject {
  id: string;
  project_name: string;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  expected_finish_date: string | null;
  openTaskCount: number;
  needsResponseCount: number;
  lastUpdateDate: string | null;
}

function statusBadgeCls(status: string) {
  switch (status) {
    case 'In Progress':  return 'bg-blue-50 text-blue-700';
    case 'Delayed':      return 'bg-amber-50 text-amber-700';
    case 'Completed':    return 'bg-emerald-50 text-emerald-700';
    case 'On Hold':      return 'bg-slate-100 text-slate-500';
    case 'Blocked':      return 'bg-red-50 text-red-600';
    default:             return 'bg-slate-100 text-slate-600';
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'In Progress':  return 'bg-blue-500';
    case 'Delayed':      return 'bg-amber-500';
    case 'Completed':    return 'bg-emerald-500';
    case 'Blocked':      return 'bg-red-500';
    default:             return 'bg-slate-400';
  }
}

export default function SubProjectsPage({
  onViewProject,
}: {
  onViewProject: (projectId: string) => void;
}) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<SubProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    if (!profile) return;
    setLoading(true);

    // Get projects this sub is a member of
    const { data: memberData } = await supabase
      .from('project_members_safe')
      .select('project_id')
      .eq('user_id', profile.id);

    const projectIds = (memberData || []).map((m: any) => m.project_id as string);

    if (projectIds.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    // Load project records
    const { data: projData } = await supabase
      .from('projects')
      .select('id, project_name, status, address, city, state, expected_finish_date')
      .in('id', projectIds)
      .eq('is_deleted', false)
      .eq('is_archived', false)
      .neq('status', 'Completed')
      .order('project_name');

    const activeProjects = projData || [];
    if (activeProjects.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const pids = activeProjects.map((p: any) => p.id as string);

    // Load tasks assigned to this sub within those projects
    const [tasksRes, responsesRes, updatesRes] = await Promise.all([
      supabase.from('tasks')
        .select('id, project_id, status')
        .in('project_id', pids)
        .eq('assigned_user_id', profile.id)
        .eq('is_deleted', false)
        .neq('status', 'Completed')
        .neq('status', 'Closed'),
      supabase.from('task_responses')
        .select('task_id, response_type, created_at')
        .eq('responder_user_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('daily_updates')
        .select('project_id, update_date')
        .in('project_id', pids)
        .order('update_date', { ascending: false }),
    ]);

    const tasks = tasksRes.data || [];
    const responses = responsesRes.data || [];
    const updates = updatesRes.data || [];

    // Open task count per project
    const openTasksByProject = new Map<string, number>();
    tasks.forEach((t: any) => {
      openTasksByProject.set(t.project_id, (openTasksByProject.get(t.project_id) || 0) + 1);
    });

    // Needs response: tasks with status Needs Review or Ready for Review AND sub hasn't replied
    const respondedTaskIds = new Set(responses.map((r: any) => r.task_id as string));
    const needsResponseByProject = new Map<string, number>();
    tasks.forEach((t: any) => {
      if (t.status === 'Needs Review' || t.status === 'Open' || t.status === 'Assigned') {
        if (!respondedTaskIds.has(t.id)) {
          needsResponseByProject.set(t.project_id, (needsResponseByProject.get(t.project_id) || 0) + 1);
        }
      }
    });

    // Last update date per project
    const lastUpdateByProject = new Map<string, string>();
    updates.forEach((u: any) => {
      if (!lastUpdateByProject.has(u.project_id)) {
        lastUpdateByProject.set(u.project_id, u.update_date);
      }
    });

    setProjects(
      activeProjects.map((p: any) => ({
        id: p.id,
        project_name: p.project_name,
        status: p.status,
        address: p.address,
        city: p.city,
        state: p.state,
        expected_finish_date: p.expected_finish_date,
        openTaskCount: openTasksByProject.get(p.id) || 0,
        needsResponseCount: needsResponseByProject.get(p.id) || 0,
        lastUpdateDate: lastUpdateByProject.get(p.id) || null,
      }))
    );
    setLoading(false);
  }

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center">
              <FolderOpen className="w-4 h-4 text-white" strokeWidth={1.75} />
            </div>
            <h1 className="text-xl font-bold text-slate-900">My Projects</h1>
          </div>
          <p className="text-sm text-slate-400 pl-10">Projects you are assigned to</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <FolderOpen className="w-7 h-7 text-slate-300" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-slate-600">No projects assigned yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            You will see projects here once an admin assigns you to one. Contact your supervisor if you think this is an error.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => onViewProject(p.id)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Top row: status dot + name + badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(p.status)}`} />
                    <span className="text-base font-semibold text-slate-900 leading-tight">{p.project_name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeCls(p.status)}`}>{p.status}</span>
                    {p.needsResponseCount > 0 && (
                      <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
                        {p.needsResponseCount} needs response
                      </span>
                    )}
                  </div>

                  {/* Location */}
                  {(p.address || p.city) && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span>{[p.address, p.city, p.state].filter(Boolean).join(', ')}</span>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span><span className="font-semibold text-slate-700">{p.openTaskCount}</span> open task{p.openTaskCount !== 1 ? 's' : ''}</span>
                    </div>
                    {p.lastUpdateDate && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Last update {formatDate(p.lastUpdateDate)}</span>
                      </div>
                    )}
                    {p.expected_finish_date && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="text-slate-400">Est. finish</span>
                        <span className="font-medium">{formatDate(p.expected_finish_date)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                  {p.needsResponseCount > 0 && (
                    <div className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg">
                      <MessageSquare className="w-3 h-3" />
                      Respond
                    </div>
                  )}
                  <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
