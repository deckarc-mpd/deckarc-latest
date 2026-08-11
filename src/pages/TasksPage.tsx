import { useEffect, useState } from 'react';
import { supabase, Task, Project, ProjectMemberSafe, TASK_TYPES, TASK_STATUSES_EXTENDED, TASK_PRIORITIES, FIELD_NEEDS_ATTENTION_STATUSES, FIELD_NEEDS_ATTENTION_FILTER } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertDot } from '../components/StatusBadge';
import Modal from '../components/Modal';
import TaskConversationModal, { TaskForConversation } from '../components/project/TaskConversationModal';
import { Search, CheckSquare, Plus, Flag, Send, Tag, User, X, MessageSquare, Calendar, AlertTriangle, ChevronRight, Trash2, Ban } from 'lucide-react';
import { calculateTaskAlert } from '../lib/alertUtils';
import { logActivity } from '../components/project/ActivityLogTab';

// ─── Role helpers (mirrors TasksTab) ─────────────────────────────────────────

function isAdmin(role: string) { return role === 'CONVAZANT_SUPER_ADMIN' || role === 'DECKARC_ADMIN'; }
function canCreateOperationalTask(role: string) {
  return role === 'DECKARC_ADMIN' || role === 'GENERAL_CONTRACTOR'
    || role === 'SUBCONTRACTOR' || role === 'CLIENT';
}
function isGC(role: string) { return role === 'GENERAL_CONTRACTOR'; }
function isSub(role: string) { return role === 'SUBCONTRACTOR'; }
function isClient(role: string) { return role === 'CLIENT'; }

function allowedTaskTypes(role: string): string[] {
  if (isAdmin(role)) return [...TASK_TYPES];
  if (isGC(role)) return ['Project Task', 'Field Task', 'GC Task', 'Inspection Task', 'Permit Task', 'Material Task', 'Follow-Up', 'Issue / Blocker'];
  if (isSub(role)) return ['Subcontractor Request', 'Issue / Blocker', 'Follow-Up'];
  if (isClient(role)) return ['Client Request', 'File/Document Request', 'Change Request', 'Follow-Up'];
  return ['Project Task'];
}

function defaultStatus(role: string): string {
  return (isAdmin(role) || isGC(role)) ? 'Open' : 'Needs Review';
}

function allowedStatuses(role: string): string[] {
  if (isAdmin(role)) return [...TASK_STATUSES_EXTENDED];
  if (isGC(role)) return ['Open', 'Assigned', 'In Progress', 'Blocked', 'Ready for Review', 'Completed', 'Closed', 'Cancelled'];
  if (isSub(role)) return ['In Progress', 'Blocked', 'Ready for Review'];
  return ['Needs Review'];
}

const TASK_CATEGORIES = [
  'Design', 'HOA', 'Permit', 'Site Prep', 'Foundation', 'Framing', 'Roofing',
  'Electrical', 'Plumbing', 'HVAC', 'Insulation', 'Drywall', 'Flooring',
  'Finish', 'Inspection', 'Client Decision', 'Payment', 'Other',
];

// ─── Sub action button helper ─────────────────────────────────────────────────

interface SubTaskMeta {
  hasResponded: boolean;      // sub has submitted at least one response
  hasAdminReply: boolean;     // admin has replied — sub should respond again
  lastResponseType?: string;  // accepted | question | etc.
}

function subActionButton(status: string, meta: SubTaskMeta | undefined): {
  label: string;
  cls: string;
  badge?: string;
  badgeCls?: string;
} {
  if (status === 'Completed' || status === 'Closed') {
    return { label: 'View', cls: 'bg-slate-100 text-slate-500 hover:bg-slate-200' };
  }
  if (meta?.hasAdminReply) {
    return {
      label: 'Respond',
      cls: 'bg-slate-900 text-white hover:bg-slate-700',
      badge: 'Reply received',
      badgeCls: 'bg-blue-50 text-blue-700 border border-blue-200',
    };
  }
  if (status === 'Ready for Review' || status === 'Needs Review') {
    return {
      label: 'View / Update',
      cls: 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100',
      badge: 'Awaiting review',
      badgeCls: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }
  if (status === 'In Progress' || status === 'Assigned') {
    return {
      label: meta?.hasResponded ? 'Update' : 'Respond',
      cls: meta?.hasResponded
        ? 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'
        : 'bg-slate-900 text-white hover:bg-slate-700',
    };
  }
  return {
    label: meta?.hasResponded ? 'View / Update' : 'Respond',
    cls: meta?.hasResponded
      ? 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'
      : 'bg-slate-900 text-white hover:bg-slate-700',
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'Completed': return 'bg-emerald-50 text-emerald-700';
    case 'Closed': return 'bg-slate-100 text-slate-500';
    case 'Cancelled': return 'bg-slate-100 text-slate-400';
    case 'Blocked': return 'bg-red-50 text-red-600';
    case 'Needs Review': return 'bg-amber-50 text-amber-700';
    case 'Ready for Review': return 'bg-sky-50 text-sky-700';
    case 'In Progress': case 'Assigned': return 'bg-blue-50 text-blue-700';
    case 'Draft': return 'bg-slate-50 text-slate-400';
    default: return 'bg-slate-100 text-slate-600';
  }
}

// ─── Form shape ───────────────────────────────────────────────────────────────

interface TaskFormData {
  task_name: string; task_type: string; category: string; priority: string;
  project_id: string; assigned_role: string; assigned_user_id: string;
  planned_start_date: string; planned_finish_date: string; status: string;
  is_client_visible: boolean; internal_notes: string; client_visible_notes: string;
  blocked_reason: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TasksPage({ onViewProject, initialDateFilter, initialStatusFilter: initialStatusFilterProp }: { onViewProject: (id: string, tab?: string, taskId?: string) => void; initialDateFilter?: 'due48' | 'missed'; initialStatusFilter?: string }) {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const [tasks, setTasks] = useState<(Task & { project?: Project })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilterProp ?? '');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<'due48' | 'missed' | ''>(initialDateFilter ?? '');
  const [dashboardBanner, setDashboardBanner] = useState(!!initialStatusFilterProp);

  // Delete confirmation (admin only)
  const [deleteTarget, setDeleteTarget] = useState<(Task & { project?: Project }) | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Cancel Request confirmation (field team — own-created tasks only)
  const [cancelTarget, setCancelTarget] = useState<(Task & { project?: Project }) | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberSafe[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const canManage = isAdmin(role) || isGC(role);
  const canCreate = canCreateOperationalTask(role);
  const clientView = isClient(role);
  const subView = isSub(role);

  // A sub can cancel a request they personally created if it hasn't been processed by admin yet
  const NON_CANCELLABLE_STATUSES = new Set(['Completed', 'Closed', 'Cancelled', 'In Progress', 'Ready for Review', 'Approved']);
  function canCancelOwnRequest(t: Task & { project?: Project }): boolean {
    if (!subView) return false;
    if (t.created_by_user_id !== profile?.id) return false;
    return !NON_CANCELLABLE_STATUSES.has(t.status);
  }

  // Conversation modal — for sub/field users
  const [convTask, setConvTask] = useState<TaskForConversation | null>(null);
  // Per-task conversation metadata for sub users
  const [subTaskMeta, setSubTaskMeta] = useState<Map<string, SubTaskMeta>>(new Map());

  function emptyForm(): TaskFormData {
    return {
      task_name: '', task_type: allowedTaskTypes(role)[0] || 'Project Task',
      category: 'Other', priority: 'Medium', project_id: '',
      assigned_role: '', assigned_user_id: '',
      planned_start_date: '', planned_finish_date: '',
      status: defaultStatus(role),
      is_client_visible: isClient(role),
      internal_notes: '', client_visible_notes: '', blocked_reason: '',
    };
  }
  const [form, setForm] = useState<TaskFormData>(emptyForm);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const uid = profile?.id;
    let q = supabase.from('tasks').select('*').eq('is_deleted', false).order('planned_finish_date', { ascending: true, nullsFirst: false });

    if (clientView && uid) {
      // Client sees: client-visible tasks OR tasks they personally created
      q = q.or(`is_client_visible.eq.true,created_by_user_id.eq.${uid}`);
    } else if (subView && uid) {
      // Sub sees: tasks assigned to them OR tasks they personally created
      q = q.or(`assigned_user_id.eq.${uid},created_by_user_id.eq.${uid}`);
    }

    const [tasksRes, projectsRes] = await Promise.all([
      q,
      supabase.from('projects').select('*').eq('is_deleted', false).eq('is_archived', false),
    ]);

    // Only include tasks whose parent project is active (not deleted/archived/completed)
    const allProjects: Project[] = projectsRes.data || [];
    const activeProjects = allProjects.filter(p =>
      p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted'
    );
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const projectMap = new Map(activeProjects.map(p => [p.id, p]));

    const enriched = (tasksRes.data || [])
      .filter(t => activeProjectIds.has(t.project_id))
      .map(t => ({ ...t, project: projectMap.get(t.project_id) }));

    setTasks(enriched);
    setProjects(activeProjects);

    // For subs: load conversation metadata per task (responded? admin replied?)
    if (subView && uid && enriched.length > 0) {
      const taskIds = enriched.map(t => t.id);
      const { data: respData } = await supabase
        .from('task_responses')
        .select('task_id, response_type, responder_user_id')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true });

      const metaMap = new Map<string, SubTaskMeta>();
      (respData || []).forEach((r: any) => {
        const existing = metaMap.get(r.task_id) || { hasResponded: false, hasAdminReply: false };
        if (r.response_type === 'admin_reply') {
          existing.hasAdminReply = true;
        } else if (r.responder_user_id === uid) {
          existing.hasResponded = true;
          existing.lastResponseType = r.response_type;
          // Reset admin reply flag if sub responded after the admin
          existing.hasAdminReply = false;
        }
        metaMap.set(r.task_id, existing);
      });
      setSubTaskMeta(metaMap);
    }

    setLoading(false);
  }

  // Load members when project_id changes inside the form (admin/GC only)
  async function loadMembersForProject(projectId: string) {
    if (!canManage || !projectId) { setProjectMembers([]); return; }
    setMembersLoading(true);
    const { data, error } = await supabase
      .from('project_members_safe')
      .select('*')
      .eq('project_id', projectId);
    if (!error) setProjectMembers(data || []);
    setMembersLoading(false);
  }

  async function deleteTaskConfirmed() {
    if (!deleteTarget || !profile) return;
    setDeleting(true);
    await supabase.from('tasks').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
    }).eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  async function cancelRequestConfirmed() {
    if (!cancelTarget || !profile) return;
    setCancelling(true);
    await supabase.from('tasks').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
    }).eq('id', cancelTarget.id).eq('created_by_user_id', profile.id);
    setCancelling(false);
    setCancelTarget(null);
    load();
  }

  function openCreate() {
    const f = emptyForm();
    // Pre-select the only project if sub/client has one
    if ((subView || clientView) && projects.length === 1) f.project_id = projects[0].id;
    // Pre-select the only project for admin too if there's just one
    if (canManage && projects.length === 1) {
      f.project_id = projects[0].id;
      loadMembersForProject(projects[0].id);
    }
    setProjectMembers([]);
    setForm(f);
    setShowModal(true);
  }

  async function saveTask() {
    if (!form.task_name.trim() || !form.project_id) return;
    setSaving(true);

    const alertStatus = calculateTaskAlert({ planned_finish_date: form.planned_finish_date || null, status: form.status });

    const payload: Record<string, unknown> = {
      project_id: form.project_id,
      task_name: form.task_name.trim(),
      task_type: form.task_type,
      category: form.category,
      priority: form.priority,
      assigned_role: form.assigned_role,
      assigned_user_id: form.assigned_user_id || null,
      planned_start_date: form.planned_start_date || null,
      planned_finish_date: form.planned_finish_date || null,
      status: form.status,
      is_client_visible: form.is_client_visible,
      client_visible_notes: form.client_visible_notes,
      blocked_reason: form.blocked_reason,
      alert_status: alertStatus,
      created_by_user_id: profile?.id || null,
      created_by_role: role,
    };
    if (!clientView) payload.internal_notes = form.internal_notes;

    const { data: newTask } = await supabase.from('tasks').insert(payload).select('id').maybeSingle();

    const projectName = projects.find(p => p.id === form.project_id)?.project_name || 'project';

    await logActivity({
      projectId: form.project_id, userId: profile?.id || null,
      userFullName: profile?.full_name || 'Unknown', userRole: role,
      actionType: 'Task Created', module: 'Task',
      relatedRecordId: newTask?.id || null, relatedRecordType: 'task',
      oldValue: '', newValue: form.status, notes: form.task_name,
    });

    if (form.assigned_user_id && newTask?.id) {
      await supabase.from('notifications').insert({
        project_id: form.project_id, user_id: form.assigned_user_id,
        notification_type: 'task_assigned', title: 'Task Assigned to You',
        message: `"${form.task_name}" has been assigned to you on ${projectName}.`,
        status: 'unread',
      });
    }

    if (form.status === 'Needs Review') {
      const { data: adminMembers } = await supabase
        .from('project_members_safe').select('user_id, role').eq('project_id', form.project_id);
      const admins = (adminMembers || []).filter(m =>
        m.role === 'DECKARC_ADMIN' || m.role === 'CONVAZANT_SUPER_ADMIN' || m.role === 'GENERAL_CONTRACTOR'
      );
      if (admins.length > 0) {
        await supabase.from('notifications').insert(
          admins.map((a: any) => ({
            project_id: form.project_id, user_id: a.user_id,
            notification_type: 'task_needs_review', title: 'Task Needs Review',
            message: `${profile?.full_name || 'A team member'} submitted "${form.task_name}" for review on ${projectName}.`,
            status: 'unread',
          }))
        );
      }
    }

    setSaving(false);
    setShowModal(false);
    load();
  }

  // ─── Filters ──────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0];
  const twoDaysOut = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
  const filtered = tasks.filter(t => {
    const matchSearch = !search
      || t.task_name.toLowerCase().includes(search.toLowerCase())
      || t.project?.project_name.toLowerCase().includes(search.toLowerCase());
    let matchStatus = true;
    if (statusFilter === FIELD_NEEDS_ATTENTION_FILTER) {
      matchStatus = (FIELD_NEEDS_ATTENTION_STATUSES as readonly string[]).includes(t.status);
    } else if (statusFilter) {
      matchStatus = t.status === statusFilter;
    }
    const matchProject = !projectFilter || t.project_id === projectFilter;
    let matchDate = true;
    if (dateFilter === 'due48') {
      matchDate = t.status !== 'Completed' && !!t.planned_finish_date
        && t.planned_finish_date >= today && t.planned_finish_date <= twoDaysOut;
    } else if (dateFilter === 'missed') {
      matchDate = t.status !== 'Completed' && !!t.planned_finish_date && t.planned_finish_date < today;
    }
    return matchSearch && matchStatus && matchProject && matchDate;
  });

  const modalTitle = isSub(role) ? 'Report Issue / Submit Request' : isClient(role) ? 'Submit a Request' : 'Create Task';
  const submitLabel = saving ? 'Saving...' : (isSub(role) || isClient(role)) ? 'Submit for Review' : 'Create Task';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckSquare className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-slate-800 leading-tight">
                {clientView ? 'My Requests & Milestones' : subView ? 'My Tasks & Requests' : 'Tasks & Milestones'}
              </p>
              <p className="text-[12px] text-slate-400 leading-tight mt-0.5">{tasks.length} total across all projects</p>
            </div>
          </div>
          {canCreate && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4" />
              {isSub(role) ? 'Report / Request' : isClient(role) ? 'Submit Request' : 'Create Task'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          {/* Dashboard context banner for sub view */}
          {subView && dashboardBanner && statusFilter === FIELD_NEEDS_ATTENTION_FILTER && (
            <div className="w-full flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                Showing tasks needing your attention from My Dashboard.
                <button
                  onClick={() => { setStatusFilter(''); setDashboardBanner(false); }}
                  className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                  aria-label="Show all"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
              <button
                onClick={() => { setStatusFilter(''); setDashboardBanner(false); }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline"
              >
                Show all
              </button>
            </div>
          )}
          {dateFilter && (
            <div className="w-full flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
                dateFilter === 'missed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {dateFilter === 'missed' ? 'Showing: Missed Milestones (from active projects)' : 'Showing: Due in 48h (from active projects)'}
                <button onClick={() => setDateFilter('')} className="ml-1 opacity-60 hover:opacity-100 transition-opacity" aria-label="Clear date filter">
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..." className="input-field pl-9" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Statuses</option>
            {subView && <option value={FIELD_NEEDS_ATTENTION_FILTER}>Needs Attention</option>}
            {[...TASK_STATUSES_EXTENDED, 'Not Started', 'Waiting', 'Delayed'].map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center bg-slate-50 rounded-xl px-8 py-10 mx-6 w-full max-w-md">
              <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-slate-500 font-medium">No tasks found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
            </div>
          </div>
        ) : subView ? (
          /* ── Sub/Field: responsive cards + table ──────────────────── */
          <>
            {/* Mobile cards */}
            <div className="block sm:hidden divide-y divide-slate-100">
              {filtered.map(t => {
                const meta = subTaskMeta.get(t.id);
                const btn = subActionButton(t.status, meta);
                const isOverdue = t.planned_finish_date && t.planned_finish_date < today && t.status !== 'Completed';
                return (
                  <div key={t.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{t.task_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.project?.project_name || '—'}</p>
                      </div>
                      <AlertDot status={t.alert_status || 'green'} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(t.status)}`}>{t.status}</span>
                      {t.task_type && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{t.task_type}</span>
                      )}
                      {t.planned_finish_date && (
                        <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(t.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {isOverdue && ' — overdue'}
                        </span>
                      )}
                    </div>
                    {t.delay_days > 0 && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {t.delay_days}d delay
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-24">
                            <div className={`h-full rounded-full ${t.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${t.progress_percentage}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{t.progress_percentage}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {btn.badge && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${btn.badgeCls}`}>{btn.badge}</span>
                        )}
                        <button
                          onClick={() => setConvTask(t)}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${btn.cls}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          {btn.label}
                        </button>
                        {canCancelOwnRequest(t) && (
                          <button
                            onClick={() => setCancelTarget(t)}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-colors"
                            title="Cancel this request"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Alert</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(t => {
                    const meta = subTaskMeta.get(t.id);
                    const btn = subActionButton(t.status, meta);
                    const isOverdue = t.planned_finish_date && t.planned_finish_date < today && t.status !== 'Completed';
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors duration-100">
                        <td className="px-5 py-3.5 font-medium text-slate-800 max-w-xs">
                          <p className="truncate">{t.task_name}</p>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">{t.project?.project_name || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t.task_type || t.category}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusBadge(t.status)}`}>{t.status}</span>
                        </td>
                        <td className="px-5 py-3.5 text-xs whitespace-nowrap">
                          {t.planned_finish_date ? (
                            <span className={isOverdue ? 'text-red-500 font-medium' : 'text-slate-500'}>
                              {new Date(t.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${t.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${t.progress_percentage}%` }} />
                            </div>
                            <span className="text-xs text-slate-400">{t.progress_percentage}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><AlertDot status={t.alert_status || 'green'} /></td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {btn.badge && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${btn.badgeCls}`}>
                                {btn.badge}
                              </span>
                            )}
                            <button
                              onClick={() => setConvTask(t)}
                              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${btn.cls}`}
                            >
                              <MessageSquare className="w-3 h-3" />
                              {btn.label}
                            </button>
                            {canCancelOwnRequest(t) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setCancelTarget(t); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                                title="Cancel this request"
                              >
                                <Ban className="w-3.5 h-3.5" />
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
          </>
        ) : (
          /* ── Admin/GC: standard table ──────────────────────────────── */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                  {!clientView && <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>}
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  {canManage && <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>}
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Alert</th>
                  {isAdmin(role) && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 cursor-pointer transition-colors duration-100"
                    onClick={() => t.project && onViewProject(t.project_id, 'tasks', t.id)}>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{t.task_name}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{t.project?.project_name || '—'}</td>
                    {!clientView && (
                      <td className="px-5 py-3.5">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{t.task_type || t.category}</span>
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusBadge(t.status)}`}>{t.status}</span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium flex items-center gap-1 ${
                          t.priority === 'High' ? 'text-red-500' : t.priority === 'Low' ? 'text-slate-400' : 'text-amber-500'
                        }`}>
                          <Flag className="w-3 h-3" />{t.priority || 'Medium'}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {t.planned_finish_date ? (
                        <span className={t.planned_finish_date < today && t.status !== 'Completed' && t.status !== 'Closed' ? 'text-red-500 font-medium' : ''}>
                          {new Date(t.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${t.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                            style={{ width: `${t.progress_percentage}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{t.progress_percentage}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><AlertDot status={t.alert_status || 'green'} /></td>
                    {isAdmin(role) && (
                      <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                          title="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Task Conversation Modal (sub/field users) ─────────────────────── */}
      {convTask && profile && (
        <TaskConversationModal
          task={convTask}
          projectName={projects.find(p => p.id === convTask.project_id)?.project_name || ''}
          userId={profile.id}
          userRole={profile.role}
          userName={profile.full_name || ''}
          onClose={() => setConvTask(null)}
          onTaskStatusChanged={(_taskId, _newStatus) => {
            setConvTask(null);
            load();
          }}
        />
      )}

      {/* ─── Create Task Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <Modal title={modalTitle} onClose={() => setShowModal(false)} size="lg">
          <div className="space-y-4">

            {(isSub(role) || isClient(role)) && (
              <div className="bg-steel-50 border border-steel-200 rounded-lg px-3 py-2 text-xs text-steel-700">
                {isSub(role)
                  ? 'Your request will be submitted for Admin/GC review.'
                  : 'Your request will be reviewed by the project team.'}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-concrete-600 mb-1">
                  {isClient(role) ? 'Request Title *' : isSub(role) ? 'Issue / Request Title *' : 'Task Name *'}
                </label>
                <input value={form.task_name}
                  onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))}
                  className="input-field" placeholder={isClient(role) ? 'What would you like to request?' : 'Enter task name'} />
              </div>

              {/* Project selector */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-concrete-600 mb-1">Project *</label>
                <select value={form.project_id}
                  onChange={e => {
                    const pid = e.target.value;
                    setForm(f => ({ ...f, project_id: pid, assigned_user_id: '', assigned_role: '' }));
                    loadMembersForProject(pid);
                  }}
                  className="input-field">
                  <option value="">— Select a project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Type
                </label>
                <select value={form.task_type}
                  onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                  className="input-field">
                  {allowedTaskTypes(role).map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {!clientView && (
                <div>
                  <label className="block text-xs font-medium text-concrete-600 mb-1">Category</label>
                  <select value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="input-field">
                    {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {canManage && (
                <div>
                  <label className="block text-xs font-medium text-concrete-600 mb-1 flex items-center gap-1">
                    <Flag className="w-3 h-3" /> Priority
                  </label>
                  <select value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="input-field">
                    {TASK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {!clientView && (
                <div>
                  <label className="block text-xs font-medium text-concrete-600 mb-1">Status</label>
                  {subView ? (
                    <input value="Needs Review" disabled className="input-field bg-concrete-50 text-concrete-400 cursor-not-allowed" />
                  ) : (
                    <select value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="input-field">
                      {allowedStatuses(role).map(s => <option key={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              )}

              {canManage && form.project_id && (
                <div className="sm:col-span-2 space-y-3">
                  {membersLoading ? (
                    <div className="flex items-center gap-2 text-xs text-concrete-400 py-2">
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Loading project members...
                    </div>
                  ) : projectMembers.filter(m => !isClient(m.role)).length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
                      No assignable project members found. Add users to this project via
                      <strong> Projects → Team Members</strong> before assigning tasks.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-concrete-600 mb-1 flex items-center gap-1">
                          <User className="w-3 h-3" /> Assign to User
                        </label>
                        <select value={form.assigned_user_id}
                          onChange={e => {
                            const uid = e.target.value;
                            const member = projectMembers.find(m => m.user_id === uid);
                            setForm(f => ({
                              ...f, assigned_user_id: uid,
                              assigned_role: member?.role || f.assigned_role,
                              status: uid ? 'Assigned' : f.status,
                            }));
                          }}
                          className="input-field">
                          <option value="">— Unassigned —</option>
                          {projectMembers
                            .filter(m => !isClient(m.role))
                            .map(m => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.full_name}{m.company_name ? ` (${m.company_name})` : ''}{m.trade_specialty ? ` · ${m.trade_specialty}` : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-concrete-600 mb-1">Assign to Role</label>
                        <select value={form.assigned_role}
                          onChange={e => setForm(f => ({ ...f, assigned_role: e.target.value }))}
                          className="input-field">
                          <option value="">— Any Role —</option>
                          <option value="GENERAL_CONTRACTOR">General Contractor</option>
                          <option value="SUBCONTRACTOR">Subcontractor</option>
                          <option value="DECKARC_ADMIN">Admin</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!clientView && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Planned Start</label>
                    <input type="date" value={form.planned_start_date}
                      onChange={e => setForm(f => ({ ...f, planned_start_date: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Planned Finish</label>
                    <input type="date" value={form.planned_finish_date}
                      onChange={e => setForm(f => ({ ...f, planned_finish_date: e.target.value }))}
                      className="input-field" />
                  </div>
                </>
              )}

              {canManage && (
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="cv-tasks" checked={form.is_client_visible}
                    onChange={e => setForm(f => ({ ...f, is_client_visible: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <label htmlFor="cv-tasks" className="text-sm text-concrete-700">Visible to client</label>
                </div>
              )}

              {clientView ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-concrete-600 mb-1">Message / Details</label>
                  <textarea rows={3} value={form.client_visible_notes}
                    onChange={e => setForm(f => ({ ...f, client_visible_notes: e.target.value }))}
                    className="input-field resize-none" placeholder="Describe your request in detail..." />
                </div>
              ) : isSub(role) ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-concrete-600 mb-1">Description / Notes</label>
                  <textarea rows={3} value={form.internal_notes}
                    onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))}
                    className="input-field resize-none" placeholder="Describe the issue or request..." />
                </div>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Internal Notes</label>
                    <textarea rows={2} value={form.internal_notes}
                      onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))}
                      className="input-field resize-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Client-Visible Notes</label>
                    <textarea rows={2} value={form.client_visible_notes}
                      onChange={e => setForm(f => ({ ...f, client_visible_notes: e.target.value }))}
                      className="input-field resize-none" />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={saveTask}
                disabled={saving || !form.task_name.trim() || !form.project_id}
                className="btn-primary disabled:opacity-50 flex items-center gap-2">
                {(isSub(role) || isClient(role)) && <Send className="w-3.5 h-3.5" />}
                {submitLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Cancel Request Modal (field team — own requests only) ────────────── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Ban style={{ width: '18px', height: '18px' }} className="text-amber-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Cancel Request?</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                This will remove your request <span className="font-semibold">"{cancelTarget.task_name}"</span> from active tracking. DECKARC Admin will no longer see it as an open item. Any existing conversation history will be retained for audit.
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button onClick={() => setCancelTarget(null)} disabled={cancelling}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Keep Request
              </button>
              <button onClick={cancelRequestConfirmed} disabled={cancelling}
                className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                <Ban className="w-3.5 h-3.5" />
                {cancelling ? 'Cancelling...' : 'Cancel Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-4.5 h-4.5 text-red-600" style={{ width: '18px', height: '18px' }} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Delete Task?</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                This will remove <span className="font-semibold">"{deleteTarget.task_name}"</span> from active project tracking, dashboards, Action Board, Tomorrow's Plan, and Field Team task lists. Related response history will be retained for audit.
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={deleteTaskConfirmed} disabled={deleting}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting...' : 'Delete Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
