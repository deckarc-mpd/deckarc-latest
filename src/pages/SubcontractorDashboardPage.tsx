import { useEffect, useState } from 'react';
import { supabase, Task, Project, Inspection, FIELD_NEEDS_ATTENTION_FILTER } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ProjectPulse, { SubBlockedTask } from '../components/ProjectPulse';
import TaskConversationModal, { TaskForConversation } from '../components/project/TaskConversationModal';
import {
  Hammer, CheckCircle, AlertTriangle, Clock,
  ClipboardList, Camera, MessageSquare, CalendarCheck,
  RefreshCw, CheckSquare, ArrowRight, Sun, Zap, ShieldCheck,
  Calendar, ChevronRight, AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

// AssignedTask extends TaskForConversation (the shape TaskConversationModal expects)
// plus dashboard-only fields: project_name, planned_start_date, assigned_role, assigned_user_id, internal_notes
interface AssignedTask extends TaskForConversation {
  project_name: string;
  planned_start_date: string | null;
  assigned_role: string;
  assigned_user_id: string | null;
  internal_notes: string;
}

// Task types where admin/GC expects a response/deliverable from the sub
const RESPONSE_REQUIRED_TYPES = new Set([
  'Material Task', 'File/Document Request', 'Subcontractor Request', 'Follow-Up',
]);

// Active statuses that the sub can still act on
const ACTIVE_STATUSES = ['Open', 'Assigned', 'Not Started', 'In Progress', 'Waiting', 'Blocked'];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SubcontractorDashboardPage({
  onNavigateToField,
  onNavigateToDailyUpdates,
  onNavigateToActionBoard,
  onNavigateToTomorrow,
  onNavigateToTasksFiltered,
}: {
  onNavigateToField?: () => void;
  onNavigateToDailyUpdates?: () => void;
  onNavigateToActionBoard?: () => void;
  onNavigateToTomorrow?: () => void;
  onNavigateToTasksFiltered?: (statusFilter: string) => void;
}) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [respondedTaskIds, setRespondedTaskIds] = useState<Set<string>>(new Set());
  const [tomorrowCount, setTomorrowCount] = useState(0);
  const [checkInDone, setCheckInDone] = useState(false);
  const [inspectionNotices, setInspectionNotices] = useState<Inspection[]>([]);
  const [selectedTask, setSelectedTask] = useState<AssignedTask | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => { load(); }, [profile?.id]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // 1. Projects this sub is linked to
    const { data: puData } = await supabase
      .from('project_users')
      .select('project_id')
      .eq('user_id', profile.id);

    const assignedProjectIds: string[] = (puData || []).map((r: any) => r.project_id);

    if (assignedProjectIds.length === 0) {
      setAssignedTasks([]);
      setTomorrowCount(0);
      setInspectionNotices([]);
      setLoading(false);
      return;
    }

    const [tasksRes, projectsRes, inspectionsRes, responsesRes, tomorrowRes] = await Promise.all([
      // Tasks: directly assigned to this user OR assigned_role=SUBCONTRACTOR with no specific user
      supabase
        .from('tasks')
        .select('*')
        .in('project_id', assignedProjectIds)
        .eq('is_deleted', false)
        .not('status', 'in', '("Completed","Closed","Cancelled")')
        .or(`assigned_user_id.eq.${profile.id},and(assigned_role.eq.SUBCONTRACTOR,assigned_user_id.is.null)`),
      supabase
        .from('projects')
        .select('id, project_name')
        .in('id', assignedProjectIds),
      supabase
        .from('inspections')
        .select('*')
        .in('project_id', assignedProjectIds)
        .in('result', ['Scheduled', 'Requested', 'Correction Required', 'Reinspection Required', 'Failed', 'Reinspection Scheduled'])
        .order('scheduled_date', { ascending: true }),
      // Load any task responses this sub has already submitted
      supabase
        .from('task_responses')
        .select('task_id')
        .eq('responder_user_id', profile.id),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('project_id', assignedProjectIds)
        .eq('is_deleted', false)
        .eq('planned_start_date', tomorrow)
        .or(`assigned_user_id.eq.${profile.id},and(assigned_role.eq.SUBCONTRACTOR,assigned_user_id.is.null)`),
    ]);

    const allTasks: Task[] = tasksRes.data || [];
    const allProjects: Project[] = projectsRes.data || [];
    const projectMap = new Map(allProjects.map(p => [p.id, p.project_name]));

    // Sort: response-required first, then by due date
    const mapped: AssignedTask[] = allTasks.map(t => ({
      id: t.id,
      task_name: t.task_name,
      task_type: t.task_type || 'Project Task',
      category: t.category,
      status: t.status,
      project_id: t.project_id,
      project_name: projectMap.get(t.project_id) || 'Project',
      planned_finish_date: t.planned_finish_date,
      planned_start_date: t.planned_start_date,
      assigned_role: t.assigned_role,
      assigned_user_id: t.assigned_user_id,
      internal_notes: t.internal_notes,
      client_visible_notes: t.client_visible_notes,
    }));

    mapped.sort((a, b) => {
      const aReq = RESPONSE_REQUIRED_TYPES.has(a.task_type) ? 0 : 1;
      const bReq = RESPONSE_REQUIRED_TYPES.has(b.task_type) ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      if (!a.planned_finish_date && !b.planned_finish_date) return 0;
      if (!a.planned_finish_date) return 1;
      if (!b.planned_finish_date) return -1;
      return a.planned_finish_date.localeCompare(b.planned_finish_date);
    });

    const responded = new Set((responsesRes.data || []).map((r: any) => r.task_id as string));

    setAssignedTasks(mapped);
    setRespondedTaskIds(responded);
    setTomorrowCount(tomorrowRes.count || 0);
    setInspectionNotices((inspectionsRes.data || []).slice(0, 4));
    setLoading(false);
  }

  function handleResponseSubmitted(_taskId: string, _newStatus: string) {
    setRespondedTaskIds(prev => new Set([...prev, _taskId]));
    setToast('Response submitted. Admin has been notified.');
    load();
  }

  function handleViewSubBlockedTasks(blockedTasks: SubBlockedTask[]) {
    if (blockedTasks.length === 0) return;
    if (blockedTasks.length === 1) {
      // Open the task conversation directly
      const t = blockedTasks[0];
      setSelectedTask({
        id: t.id,
        task_name: t.task_name,
        task_type: t.task_type,
        category: t.category,
        status: t.status,
        project_id: t.project_id,
        project_name: t.project_name,
        planned_finish_date: t.planned_finish_date,
        planned_start_date: null,
        assigned_role: 'SUBCONTRACTOR',
        assigned_user_id: profile?.id || null,
        internal_notes: '',
        client_visible_notes: t.client_visible_notes,
      });
    } else {
      // Navigate to My Tasks with the shared "Needs Attention" filter
      onNavigateToTasksFiltered?.(FIELD_NEEDS_ATTENTION_FILTER);
    }
  }

  function statusBadgeClass(s: string) {
    if (s === 'Ready for Review') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (s === 'In Progress')      return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'Blocked')          return 'bg-red-50 text-red-700 border-red-200';
    if (s === 'Assigned')         return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

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

  const firstName = profile?.full_name?.split(' ')[0] || 'Subcontractor';
  const pendingResponseCount = assignedTasks.filter(t =>
    RESPONSE_REQUIRED_TYPES.has(t.task_type) && !respondedTaskIds.has(t.id)
      && t.status !== 'Ready for Review'
  ).length;

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
              <Hammer className="w-4.5 h-4.5 text-white" style={{ width: '18px', height: '18px' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Hi, {firstName}.</h1>
              <p className="text-xs text-slate-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
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

      {/* ── Response Required Alert ── */}
      {pendingResponseCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4.5 h-4.5 text-amber-600" style={{ width: '18px', height: '18px' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">
              {pendingResponseCount} task{pendingResponseCount !== 1 ? 's' : ''} waiting for your response
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Open each task below to submit your response.</p>
          </div>
        </div>
      )}

      {/* ── Check-In Status ── */}
      <div className={`rounded-2xl border p-5 flex items-center justify-between gap-4 transition-all ${
        checkInDone ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200/80 shadow-sm'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${checkInDone ? 'bg-emerald-100' : 'bg-amber-50'}`}>
            {checkInDone
              ? <CheckCircle className="w-5 h-5 text-emerald-600" />
              : <Clock className="w-5 h-5 text-amber-600" />
            }
          </div>
          <div>
            <p className={`text-sm font-bold ${checkInDone ? 'text-emerald-800' : 'text-slate-800'}`}>
              {checkInDone ? 'Checked In' : 'Check In Required'}
            </p>
            <p className={`text-xs mt-0.5 ${checkInDone ? 'text-emerald-600' : 'text-slate-400'}`}>
              {checkInDone
                ? `Confirmed at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                : 'Confirm your arrival on site to begin your shift.'}
            </p>
          </div>
        </div>
        {!checkInDone && (
          <button onClick={() => setCheckInDone(true)} className="btn-primary text-xs flex-shrink-0">
            Check In Now
          </button>
        )}
      </div>

      {/* ── Project Pulse ── */}
      <ProjectPulse
        onViewToday={onNavigateToActionBoard}
        onViewTomorrow={onNavigateToTomorrow}
        onViewSubBlockedTasks={handleViewSubBlockedTasks}
      />

      {/* ── My Assigned Tasks ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-800">My Assigned Tasks</h2>
            <p className="text-xs text-slate-400">
              {assignedTasks.length > 0
                ? `${assignedTasks.length} active task${assignedTasks.length !== 1 ? 's' : ''}`
                : 'No tasks assigned to you'}
            </p>
          </div>
          {assignedTasks.length > 0 && (
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{assignedTasks.length}</span>
          )}
        </div>

        {assignedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-5">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
              <CheckSquare className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-slate-600">No tasks assigned yet.</p>
            <p className="text-xs text-slate-400 mt-1">Check back later or contact your GC.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {assignedTasks.map(t => {
              const isResponseReq = RESPONSE_REQUIRED_TYPES.has(t.task_type);
              const hasResponded  = respondedTaskIds.has(t.id) || t.status === 'Ready for Review';
              const isOverdue     = t.planned_finish_date && t.planned_finish_date < new Date().toISOString().split('T')[0];
              const dueLabel      = t.planned_finish_date
                ? new Date(t.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null;

              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{t.task_name}</p>
                      {isResponseReq && !hasResponded && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Response Required
                        </span>
                      )}
                      {hasResponded && (
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Submitted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-xs text-slate-400">{t.project_name}</p>
                      <span className="text-[10px] text-slate-400">{t.task_type}</span>
                      {dueLabel && (
                        <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                          <Calendar className="w-3 h-3" />
                          {isOverdue ? 'Overdue · ' : 'Due '}
                          {dueLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass(t.status)}`}>{t.status}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Inspection Notices ── */}
      {inspectionNotices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Inspection Notices</h2>
              <p className="text-xs text-slate-400">Upcoming inspections that may affect your work</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {inspectionNotices.map(i => (
              <div key={i.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                  i.result === 'Failed' || i.correction_required ? 'bg-red-500' :
                  i.result === 'Scheduled' ? 'bg-blue-500' : 'bg-amber-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{i.inspection_type}</p>
                  {i.scheduled_date && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      {new Date(i.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                  {i.correction_required && i.correction_notes && (
                    <p className="text-xs text-red-600 mt-1">Correction needed: {i.correction_notes}</p>
                  )}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  i.result === 'Failed' || i.correction_required ? 'bg-red-50 text-red-700 border border-red-200' :
                  i.result === 'Scheduled' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>{i.result}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-50">
            <p className="text-xs text-slate-400">Contact your GC or Admin for full inspection details.</p>
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-3.5 h-3.5 text-slate-400" />
          <span className="section-label">Quick Actions</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Submit Daily Update', icon: ClipboardList, bg: 'bg-blue-50 border-blue-200',       iconBg: 'bg-blue-100',    iconColor: 'text-blue-600',    textColor: 'text-blue-700',    onClick: onNavigateToDailyUpdates },
            { label: 'Upload Photos',       icon: Camera,        bg: 'bg-slate-50 border-slate-200',     iconBg: 'bg-slate-100',   iconColor: 'text-slate-600',   textColor: 'text-slate-700',   onClick: onNavigateToField },
            { label: 'Report Issue',        icon: AlertTriangle, bg: 'bg-amber-50 border-amber-200',     iconBg: 'bg-amber-100',   iconColor: 'text-amber-600',   textColor: 'text-amber-700',   onClick: onNavigateToActionBoard },
            { label: 'Confirm Tomorrow',    icon: CalendarCheck, bg: 'bg-emerald-50 border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', textColor: 'text-emerald-700', onClick: onNavigateToTomorrow },
          ].map(({ label, icon: Icon, bg, iconBg, iconColor, textColor, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-md ${bg} ${onClick ? 'cursor-pointer' : 'opacity-50 cursor-default'}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <Icon className={`w-4.5 h-4.5 ${iconColor}`} style={{ width: '18px', height: '18px' }} />
              </div>
              <span className={`text-xs font-bold leading-tight ${textColor}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tomorrow's Plan ── */}
      <div
        onClick={onNavigateToTomorrow}
        className={`rounded-2xl border p-4 flex items-center gap-4 transition-all ${
          onNavigateToTomorrow ? 'bg-white border-slate-200/80 shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 group' : 'bg-white border-slate-200/80 shadow-sm'
        }`}
      >
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Sun className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">Tomorrow's Plan</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {tomorrowCount > 0
              ? `${tomorrowCount} task${tomorrowCount !== 1 ? 's' : ''} scheduled — confirm your availability.`
              : 'No tasks scheduled for tomorrow yet.'}
          </p>
        </div>
        {onNavigateToTomorrow && tomorrowCount > 0 && (
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
        )}
      </div>

      {/* ── Task Response Modal ── */}
      {selectedTask && profile && (
        <TaskConversationModal
          task={selectedTask}
          projectName={selectedTask.project_name}
          userId={profile.id}
          userRole={profile.role}
          userName={profile.full_name || ''}
          onClose={() => setSelectedTask(null)}
          onTaskStatusChanged={(taskId, newStatus) => {
            setSelectedTask(null);
            handleResponseSubmitted(taskId, newStatus);
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5 pointer-events-none">
          <MessageSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
