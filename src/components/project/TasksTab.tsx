import { useEffect, useState, useRef } from 'react';
import { supabase, Project, Task, ProjectMemberSafe, TASK_TYPES, TASK_STATUSES_EXTENDED, TASK_PRIORITIES } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertDot } from '../StatusBadge';
import Modal from '../Modal';
import TaskConversationModal, { TaskForConversation, TaskConvMeta, MessageIconButton } from './TaskConversationModal';
import {
  Plus, Edit2, AlertTriangle, Paperclip, Upload, FileText,
  Download, Loader, User, Flag, Tag, Send, MessageSquare, Trash2,
} from 'lucide-react';
import { calculateTaskAlert } from '../../lib/alertUtils';
import { logActivity } from './ActivityLogTab';
import { uploadFile, insertProjectFile, getSignedUrl } from '../../lib/fileUpload';

// ─── Role helpers ────────────────────────────────────────────────────────────

function isAdmin(role: string) {
  return role === 'CONVAZANT_SUPER_ADMIN' || role === 'DECKARC_ADMIN';
}
// CONVAZANT can read/manage tasks but should not create operational project tasks.
// They may create tasks only when operating inside a workspace (enforced by App.tsx
// navigation guards). Within this component we enforce creation-only via DECKARC_ADMIN.
function canCreateOperationalTask(role: string) {
  return role === 'DECKARC_ADMIN' || role === 'GENERAL_CONTRACTOR'
    || role === 'SUBCONTRACTOR' || role === 'CLIENT';
}
function isGC(role: string) { return role === 'GENERAL_CONTRACTOR'; }
function isSub(role: string) { return role === 'SUBCONTRACTOR'; }
function isClient(role: string) { return role === 'CLIENT'; }

// Which task types a role may create
function allowedTaskTypes(role: string): readonly string[] {
  if (isAdmin(role)) return TASK_TYPES;
  if (isGC(role)) return [
    'Project Task', 'Field Task', 'GC Task', 'Inspection Task',
    'Permit Task', 'Material Task', 'Follow-Up', 'Issue / Blocker',
  ];
  if (isSub(role)) return [
    'Subcontractor Request', 'Issue / Blocker', 'Follow-Up',
  ];
  if (isClient(role)) return [
    'Client Request', 'File/Document Request', 'Change Request', 'Follow-Up',
  ];
  return ['Project Task'];
}

// Initial status by creator role
function defaultStatus(role: string): string {
  if (isAdmin(role) || isGC(role)) return 'Open';
  return 'Needs Review'; // Sub + Client
}

// Which statuses a role may set
function allowedStatuses(role: string): string[] {
  if (isAdmin(role)) return [...TASK_STATUSES_EXTENDED];
  if (isGC(role)) return ['Open', 'Assigned', 'In Progress', 'Blocked', 'Ready for Review', 'Completed', 'Closed', 'Cancelled'];
  if (isSub(role)) return ['In Progress', 'Blocked', 'Ready for Review'];
  return ['Needs Review']; // client — status is read-only essentially
}

// ─── File strip ──────────────────────────────────────────────────────────────

interface TaskFile {
  id: string; file_name: string; file_type: string;
  storage_path: string | null; signedUrl?: string | null;
}

function TaskFilesStrip({
  projectId, taskId, canUpload, organizationId, userId, userRole,
}: {
  projectId: string; taskId: string; canUpload: boolean;
  organizationId: string | null; userId: string; userRole: string;
}) {
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && !loaded) loadFiles(); }, [open]);

  async function loadFiles() {
    const { data } = await supabase
      .from('project_files').select('id, file_name, file_type, storage_path')
      .eq('project_id', projectId).eq('related_module', 'Task')
      .eq('related_record_id', taskId).eq('is_deleted', false)
      .order('uploaded_at', { ascending: false });
    const enriched = await Promise.all(
      (data || []).map(async (f: any) => ({ ...f, signedUrl: await getSignedUrl(f.storage_path) }))
    );
    setFiles(enriched);
    setLoaded(true);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, projectId, organizationId);
      await insertProjectFile({
        projectId, uploadedByUserId: userId, uploadedByRole: userRole,
        organizationId, fileName: result.fileName, fileType: result.fileType,
        fileSizeKb: result.fileSizeKb, storagePath: result.storagePath,
        documentCategory: 'Task Attachment', relatedModule: 'Task',
        relatedRecordId: taskId, clientVisible: false,
      });
      setLoaded(false);
      await loadFiles();
    } catch {}
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] text-concrete-400 hover:text-concrete-600 transition-colors">
        <Paperclip className="w-3 h-3" />
        {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : 'Files'}
      </button>
      {open && (
        <div className="mt-2 pl-1">
          {!loaded ? <Loader className="w-3 h-3 animate-spin text-concrete-300" /> : (
            <div className="space-y-1.5">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-xs text-concrete-600 bg-concrete-50 rounded-lg px-2.5 py-1.5">
                  <FileText className="w-3 h-3 text-concrete-400 flex-shrink-0" />
                  <span className="flex-1 truncate">{f.file_name}</span>
                  <span className="text-concrete-400 text-[10px] uppercase">{f.file_type}</span>
                  {f.signedUrl && (
                    <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                      <Download className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
              {canUpload && (
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-1 text-[11px] text-concrete-400 hover:text-concrete-600 border border-concrete-200 hover:border-concrete-400 px-2 py-1 rounded-lg transition-colors">
                  {uploading ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {uploading ? 'Uploading...' : 'Attach File'}
                </button>
              )}
              <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleFile} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status / priority badge helpers ─────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'Completed': return 'bg-site-100 text-site-700';
    case 'Closed': return 'bg-concrete-200 text-concrete-600';
    case 'Cancelled': return 'bg-concrete-100 text-concrete-400 line-through';
    case 'Blocked': return 'bg-hazard-100 text-hazard-700';
    case 'Needs Review': return 'bg-amber-100 text-amber-700';
    case 'Ready for Review': return 'bg-sky-100 text-sky-700';
    case 'In Progress': case 'Assigned': return 'bg-steel-100 text-steel-700';
    case 'Draft': return 'bg-concrete-50 text-concrete-400';
    default: return 'bg-concrete-100 text-concrete-600';
  }
}

function priorityBadge(p: string) {
  if (p === 'High') return 'text-hazard-600';
  if (p === 'Low') return 'text-concrete-400';
  return 'text-amber-600';
}

function taskBorderColor(t: Task) {
  if (t.status === 'Completed' || t.status === 'Closed') return 'border-l-site-400';
  if (t.alert_status === 'red' || t.status === 'Blocked') return 'border-l-hazard-400';
  if (t.alert_status === 'yellow' || t.status === 'Needs Review') return 'border-l-amber-400';
  return 'border-l-concrete-200';
}

// ─── Task form types ──────────────────────────────────────────────────────────

interface TaskFormData {
  task_name: string;
  task_type: string;
  category: string;
  priority: string;
  assigned_role: string;
  assigned_user_id: string;
  planned_start_date: string;
  planned_finish_date: string;
  actual_start_date: string;
  actual_finish_date: string;
  status: string;
  progress_percentage: number;
  delay_reason: string;
  delay_days: number;
  blocked_reason: string;
  is_client_visible: boolean;
  internal_notes: string;
  client_visible_notes: string;
}

const TASK_CATEGORIES = [
  'Design', 'HOA', 'Permit', 'Site Prep', 'Foundation', 'Framing', 'Roofing',
  'Electrical', 'Plumbing', 'HVAC', 'Insulation', 'Drywall', 'Flooring',
  'Finish', 'Inspection', 'Client Decision', 'Payment', 'Other',
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function TasksTab({ project, initialTaskId }: { project: Project; initialTaskId?: string }) {
  const { profile } = useAuth();
  const role = profile?.role || '';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberSafe[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const canManage = isAdmin(role) || isGC(role);
  const canCreate = canCreateOperationalTask(role);
  const clientView = isClient(role);
  const subView = isSub(role);

  // Conversation modal state — used for both admin (message icon) and sub (respond button)
  const [convTask, setConvTask] = useState<TaskForConversation | null>(null);
  // Track which task IDs the sub has already responded to (for button state)
  const [respondedTaskIds, setRespondedTaskIds] = useState<Set<string>>(new Set());
  // Conversation metadata per task: count, hasQuestion, needsAdminResponse
  const [convMeta, setConvMeta] = useState<Map<string, TaskConvMeta>>(new Map());

  // Delete confirmation state
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  function emptyForm(): TaskFormData {
    return {
      task_name: '', task_type: allowedTaskTypes(role)[0] || 'Project Task',
      category: 'Other', priority: 'Medium',
      assigned_role: '', assigned_user_id: '',
      planned_start_date: '', planned_finish_date: '',
      actual_start_date: '', actual_finish_date: '',
      status: defaultStatus(role), progress_percentage: 0,
      delay_reason: '', delay_days: 0, blocked_reason: '',
      is_client_visible: isClient(role), internal_notes: '', client_visible_notes: '',
    };
  }

  const [form, setForm] = useState<TaskFormData>(emptyForm);

  // One-shot guard: auto-open via initialTaskId fires only once per mount
  const autoOpenFired = useRef(false);

  useEffect(() => { loadTasks(); }, [project.id]);

  // Auto-open modal when deep-linked from Action Board or notification (fires only once per mount)
  useEffect(() => {
    if (!initialTaskId || loading || tasks.length === 0) return;
    if (autoOpenFired.current) return;
    const target = tasks.find(t => t.id === initialTaskId);
    if (!target) return;
    autoOpenFired.current = true;
    if (subView && target.assigned_user_id === profile?.id) {
      setConvTask(target);
    } else if (canManage) {
      openEdit(target);
    }
  }, [initialTaskId, loading, tasks.length]);

  async function loadTasks() {
    setLoading(true);
    const uid = profile!.id;
    let query = supabase.from('tasks').select('*').eq('project_id', project.id).eq('is_deleted', false).order('created_at');

    if (clientView) {
      // Client sees: tasks marked client-visible OR tasks they personally created
      query = query.or(`is_client_visible.eq.true,created_by_user_id.eq.${uid}`);
    } else if (subView) {
      // Sub sees: tasks assigned to them OR tasks they personally created
      query = query.or(`assigned_user_id.eq.${uid},created_by_user_id.eq.${uid}`);
    }

    const { data } = await query;
    setTasks(data || []);

    // For subs: load which tasks they've already responded to (for button state)
    if (subView) {
      const { data: rData } = await supabase
        .from('task_responses')
        .select('task_id')
        .eq('responder_user_id', uid);
      setRespondedTaskIds(new Set((rData || []).map((r: any) => r.task_id as string)));
    }

    // For admin/GC: load conversation metadata per task (count + question/needs-response flags)
    if (canManage && (data || []).length > 0) {
      const taskIds = (data || []).map((t: Task) => t.id);
      const { data: respData } = await supabase
        .from('task_responses')
        .select('task_id, response_type')
        .in('task_id', taskIds);

      const metaMap = new Map<string, TaskConvMeta>();
      (respData || []).forEach((r: any) => {
        const existing = metaMap.get(r.task_id) || { count: 0, hasQuestion: false, needsAdminResponse: false };
        existing.count++;
        if (r.response_type === 'question') existing.hasQuestion = true;
        if (r.response_type !== 'admin_reply') existing.needsAdminResponse = true;
        metaMap.set(r.task_id, existing);
      });
      // A task only "needs response" if there's a non-admin message but no admin reply after it
      // Simplification: needsAdminResponse = has sub/field messages AND task status is Needs Review or Ready for Review
      (data || []).forEach((t: Task) => {
        const m = metaMap.get(t.id);
        if (m) {
          m.needsAdminResponse = m.needsAdminResponse &&
            (t.status === 'Needs Review' || t.status === 'Ready for Review');
          metaMap.set(t.id, m);
        }
      });
      setConvMeta(metaMap);
    }

    setLoading(false);
  }

  // Load project members for assignment dropdown (Admin/GC only)
  // Called explicitly from openCreate/openEdit so there's no dependency-array race.
  async function loadProjectMembers() {
    if (!canManage) return;
    setMembersLoading(true);
    const { data, error } = await supabase
      .from('project_members_safe')
      .select('*')
      .eq('project_id', project.id);
    if (!error) setProjectMembers(data || []);
    setMembersLoading(false);
  }

  useEffect(() => {
    if (canManage) loadProjectMembers();
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditTask(null);
    setForm(emptyForm());
    if (canManage) loadProjectMembers();
    setShowModal(true);
  }

  function openEdit(t: Task) {
    if (!canManage && !(subView && t.assigned_user_id === profile?.id)) return;
    if (canManage) loadProjectMembers();
    setEditTask(t);
    setForm({
      task_name: t.task_name,
      task_type: t.task_type || 'Project Task',
      category: t.category,
      priority: t.priority || 'Medium',
      assigned_role: t.assigned_role,
      assigned_user_id: t.assigned_user_id || '',
      planned_start_date: t.planned_start_date || '',
      planned_finish_date: t.planned_finish_date || '',
      actual_start_date: t.actual_start_date || '',
      actual_finish_date: t.actual_finish_date || '',
      status: t.status,
      progress_percentage: t.progress_percentage,
      delay_reason: t.delay_reason,
      delay_days: t.delay_days,
      blocked_reason: t.blocked_reason || '',
      is_client_visible: t.is_client_visible,
      internal_notes: t.internal_notes,
      client_visible_notes: t.client_visible_notes,
    });
    setShowModal(true);
  }

  async function saveTask() {
    if (!form.task_name.trim()) return;
    if ((form.status === 'Delayed' || form.delay_days > 0) && !form.delay_reason.trim()) {
      alert('Please provide a delay reason when a task is delayed or has delay days entered.');
      return;
    }
    setSaving(true);

    const alertStatus = calculateTaskAlert({
      planned_finish_date: form.planned_finish_date || null,
      status: form.status,
    });

    const payload: Record<string, unknown> = {
      project_id: project.id,
      task_name: form.task_name.trim(),
      task_type: form.task_type,
      category: form.category,
      priority: form.priority,
      assigned_role: form.assigned_role,
      assigned_user_id: form.assigned_user_id || null,
      planned_start_date: form.planned_start_date || null,
      planned_finish_date: form.planned_finish_date || null,
      actual_start_date: form.actual_start_date || null,
      actual_finish_date: form.actual_finish_date || null,
      status: form.status,
      progress_percentage: form.progress_percentage,
      delay_reason: form.delay_reason,
      delay_days: form.delay_days,
      blocked_reason: form.blocked_reason,
      is_client_visible: form.is_client_visible,
      client_visible_notes: form.client_visible_notes,
      alert_status: alertStatus,
    };

    // Internal notes only for non-client, non-sub creating
    if (!clientView) payload.internal_notes = form.internal_notes;

    if (editTask) {
      await supabase.from('tasks').update(payload).eq('id', editTask.id);

      if (editTask.status !== form.status) {
        await logActivity({
          projectId: project.id, userId: profile?.id || null,
          userFullName: profile?.full_name || 'Unknown', userRole: role,
          actionType: 'Task Status Changed', module: 'Task',
          relatedRecordId: editTask.id, relatedRecordType: 'task',
          oldValue: editTask.status, newValue: form.status, notes: form.task_name,
        });
      }

      if (form.delay_days > 0 && editTask.delay_days !== form.delay_days) {
        await logActivity({
          projectId: project.id, userId: profile?.id || null,
          userFullName: profile?.full_name || 'Unknown', userRole: role,
          actionType: 'Delay Added to Task', module: 'Task',
          relatedRecordId: editTask.id, relatedRecordType: 'task',
          oldValue: `${editTask.delay_days}d`, newValue: `${form.delay_days}d`,
          notes: form.delay_reason,
        });
      }

      // Propagate delay to project projected finish
      if (form.delay_days > 0 && project.expected_finish_date) {
        const base = new Date(project.projected_finish_date || project.expected_finish_date);
        base.setDate(base.getDate() + form.delay_days);
        await supabase.from('projects').update({
          projected_finish_date: base.toISOString().split('T')[0],
          status: 'Delayed', alert_status: 'red',
        }).eq('id', project.id);
      }
    } else {
      // New task — stamp creator
      payload.created_by_user_id = profile?.id || null;
      payload.created_by_role = role;

      const { data: newTask } = await supabase
        .from('tasks').insert(payload).select('id').maybeSingle();

      await logActivity({
        projectId: project.id, userId: profile?.id || null,
        userFullName: profile?.full_name || 'Unknown', userRole: role,
        actionType: 'Task Created', module: 'Task',
        relatedRecordId: newTask?.id || null, relatedRecordType: 'task',
        oldValue: '', newValue: form.status, notes: form.task_name,
      });

      // Notify assigned user if set
      if (form.assigned_user_id && newTask?.id) {
        await supabase.from('notifications').insert({
          project_id: project.id,
          user_id: form.assigned_user_id,
          notification_type: 'task_assigned',
          title: 'Task Assigned to You',
          message: `"${form.task_name}" has been assigned to you on ${project.project_name}.`,
          status: 'unread',
        });
      }

      // If Needs Review — notify admins on project
      if (form.status === 'Needs Review') {
        const { data: adminMembers } = await supabase
          .from('project_members_safe')
          .select('user_id, role')
          .eq('project_id', project.id);
        const admins = (adminMembers || []).filter(m =>
          m.role === 'DECKARC_ADMIN' || m.role === 'CONVAZANT_SUPER_ADMIN' || m.role === 'GENERAL_CONTRACTOR'
        );
        if (admins.length > 0) {
          await supabase.from('notifications').insert(
            admins.map(a => ({
              project_id: project.id,
              user_id: a.user_id,
              notification_type: 'task_needs_review',
              title: 'Task Needs Review',
              message: `${profile?.full_name || 'A team member'} submitted "${form.task_name}" for review on ${project.project_name}.`,
              status: 'unread',
            }))
          );
        }
      }
    }

    setSaving(false);
    setShowModal(false);
    loadTasks();
  }

  async function deleteTaskConfirmed() {
    if (!deleteTask || !profile) return;
    setDeleting(true);
    await supabase.from('tasks').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
    }).eq('id', deleteTask.id);
    await logActivity({
      projectId: project.id, userId: profile.id,
      userFullName: profile.full_name || 'Unknown', userRole: role,
      actionType: 'Task Deleted', module: 'Task',
      relatedRecordId: deleteTask.id, relatedRecordType: 'task',
      oldValue: deleteTask.status, newValue: 'Deleted', notes: deleteTask.task_name,
    });
    setDeleting(false);
    setDeleteTask(null);
    loadTasks();
  }

  // ─── Modal label / button text by role ─────────────────────────────────────

  const modalTitle = editTask
    ? (canManage ? 'Edit Task' : 'Update Request')
    : (isSub(role) ? 'Submit Request / Report Issue'
      : isClient(role) ? 'Submit a Request'
      : 'Add Task');

  const submitLabel = editTask
    ? (saving ? 'Saving...' : 'Update')
    : (isSub(role) || isClient(role))
      ? (saving ? 'Submitting...' : 'Submit for Review')
      : (saving ? 'Saving...' : 'Add Task');

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-concrete-800">
          {clientView ? 'My Requests & Milestones' : subView ? 'My Tasks & Requests' : 'Tasks & Milestones'}
          <span className="text-sm font-normal text-concrete-400 ml-2">({tasks.length})</span>
        </h2>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            {isSub(role) ? 'Report Issue / Request' : isClient(role) ? 'Submit Request' : 'Add Task'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-concrete-400 text-sm">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">
          {clientView ? 'No requests or milestones yet.' : subView ? 'No tasks assigned to you yet.' : 'No tasks yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => {
            return (
              <div key={t.id} className={`bg-white rounded-lg border border-l-4 border-concrete-200 p-4 ${taskBorderColor(t)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertDot status={t.alert_status || 'green'} />
                      <span className="text-sm text-concrete-900">{t.task_name}</span>
                      {/* Task type badge */}
                      {!clientView && t.task_type && t.task_type !== 'Project Task' && (
                        <span className="text-xs text-steel-600 bg-steel-50 px-2 py-0.5 rounded-full">{t.task_type}</span>
                      )}
                      <span className="text-xs text-concrete-500 bg-concrete-100 px-2 py-0.5 rounded-full">{t.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(t.status)}`}>{t.status}</span>
                      {/* Priority — hidden from client */}
                      {!clientView && t.priority && t.priority !== 'Medium' && (
                        <span className={`text-xs font-semibold flex items-center gap-0.5 ${priorityBadge(t.priority)}`}>
                          <Flag className="w-3 h-3" />{t.priority}
                        </span>
                      )}
                      {!clientView && t.is_client_visible && (
                        <span className="text-xs text-steel-600 bg-steel-50 px-2 py-0.5 rounded-full">Client visible</span>
                      )}
                    </div>

                    {/* Assigned user — admin/GC only */}
                    {canManage && t.assigned_user_id && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-concrete-500">
                        <User className="w-3 h-3" />
                        <span>
                          {projectMembers.find(m => m.user_id === t.assigned_user_id)?.full_name || 'Assigned'}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-concrete-500">
                      {t.planned_finish_date && (
                        <span>Due: {new Date(t.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                      {t.delay_days > 0 && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {clientView
                            ? `${t.delay_days}d delay — schedule update in progress`
                            : `${t.delay_days}d delay: ${t.delay_reason}`}
                        </span>
                      )}
                      {/* Blocked reason — not shown to client */}
                      {!clientView && t.blocked_reason && (
                        <span className="text-hazard-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Blocked: {t.blocked_reason}
                        </span>
                      )}
                    </div>

                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-concrete-400 mb-1">
                        <span>Progress</span><span>{t.progress_percentage}%</span>
                      </div>
                      <div className="h-1 bg-concrete-100 rounded-full overflow-hidden w-48">
                        <div className={`h-full rounded-full ${t.status === 'Completed' ? 'bg-site-500' : 'bg-steel-500'}`}
                          style={{ width: `${t.progress_percentage}%` }} />
                      </div>
                    </div>

                    {/* Client notes — safe view only */}
                    {clientView && t.client_visible_notes && (
                      <p className="mt-2 text-xs text-concrete-500 leading-relaxed">{t.client_visible_notes}</p>
                    )}

                    {canManage && profile && (
                      <TaskFilesStrip
                        projectId={project.id} taskId={t.id} canUpload={canManage}
                        organizationId={profile.organization_id ?? null}
                        userId={profile.id} userRole={profile.role}
                      />
                    )}
                  </div>

                  {/* Role-separated action buttons */}
                  {subView && t.assigned_user_id === profile?.id ? (
                    (() => {
                      const hasResponded = respondedTaskIds.has(t.id) || t.status === 'Ready for Review' || t.status === 'In Progress';
                      return (
                        <button
                          onClick={() => setConvTask(t)}
                          className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                            hasResponded
                              ? 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'
                              : 'bg-slate-900 text-white hover:bg-slate-700'
                          }`}
                        >
                          {hasResponded ? 'View / Update' : 'Respond'}
                        </button>
                      );
                    })()
                  ) : canManage ? (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <MessageIconButton
                        meta={convMeta.get(t.id)}
                        onClick={e => { e.stopPropagation(); setConvTask(t); }}
                      />
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600"
                        title="Edit task">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin(role) && (
                        <button onClick={() => setDeleteTask(t)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-concrete-400 hover:text-red-500 transition-colors"
                          title="Delete task">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Task Conversation Modal ───────────────────────────────────────── */}
      {convTask && profile && (
        <TaskConversationModal
          task={convTask}
          projectName={project.project_name}
          userId={profile.id}
          userRole={profile.role}
          userName={profile.full_name || ''}
          onClose={() => setConvTask(null)}
          onTaskStatusChanged={(taskId, newStatus) => {
            setRespondedTaskIds(prev => new Set([...prev, taskId]));
            loadTasks();
          }}
        />
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────────────────── */}
      {deleteTask && (
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
                This will remove <span className="font-semibold">"{deleteTask.task_name}"</span> from active project tracking, dashboards, Action Board, Tomorrow's Plan, and Field Team task lists. Related response history will be retained for audit.
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button onClick={() => setDeleteTask(null)} disabled={deleting}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={deleteTaskConfirmed} disabled={deleting}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {deleting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? 'Deleting...' : 'Delete Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create / Edit Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <Modal title={modalTitle} onClose={() => setShowModal(false)} size="lg">
          <div className="space-y-4">

            {/* Role context hint */}
            {(isSub(role) || isClient(role)) && !editTask && (
              <div className="bg-steel-50 border border-steel-200 rounded-lg px-3 py-2 text-xs text-steel-700">
                {isSub(role)
                  ? 'Your request will be submitted for Admin/GC review before it becomes an active task.'
                  : 'Your request will be reviewed by the project team. You will receive an update once reviewed.'}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Title — full width */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-concrete-600 mb-1">
                  {isSub(role) ? 'Issue / Request Title *' : isClient(role) ? 'Request Title *' : 'Task Name *'}
                </label>
                <input value={form.task_name}
                  onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))}
                  className="input-field" placeholder={isClient(role) ? 'What would you like to request or ask?' : 'Enter task name'} />
              </div>

              {/* Task type */}
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

              {/* Category — hide from client */}
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

              {/* Priority — admin/GC only */}
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

              {/* Status — admin/GC gets full list; sub gets limited; client sees read-only */}
              {!clientView && (
                <div>
                  <label className="block text-xs font-medium text-concrete-600 mb-1">Status</label>
                  {subView && !editTask ? (
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

              {/* Assignment — admin/GC only */}
              {canManage && (
                <div className="sm:col-span-2 space-y-3">
                  {membersLoading ? (
                    <div className="flex items-center gap-2 text-xs text-concrete-400 py-2">
                      <Loader className="w-3.5 h-3.5 animate-spin" />
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
                              ...f,
                              assigned_user_id: uid,
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

              {/* Dates — hide from client */}
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

              {/* Actual dates — admin/GC/sub (editing) only */}
              {canManage && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Actual Start</label>
                    <input type="date" value={form.actual_start_date}
                      onChange={e => setForm(f => ({ ...f, actual_start_date: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Actual Finish</label>
                    <input type="date" value={form.actual_finish_date}
                      onChange={e => setForm(f => ({ ...f, actual_finish_date: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Progress %</label>
                    <input type="number" min="0" max="100" value={form.progress_percentage}
                      onChange={e => setForm(f => ({ ...f, progress_percentage: parseInt(e.target.value) || 0 }))}
                      className="input-field" />
                  </div>
                </>
              )}

              {/* Delay fields */}
              {(form.status === 'Delayed' || form.delay_days > 0) && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Delay Days</label>
                    <input type="number" min="0" value={form.delay_days}
                      onChange={e => setForm(f => ({ ...f, delay_days: parseInt(e.target.value) || 0 }))}
                      className="input-field" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-concrete-600 mb-1">Reason for Delay *</label>
                    <input value={form.delay_reason}
                      onChange={e => setForm(f => ({ ...f, delay_reason: e.target.value }))}
                      className="input-field" placeholder="Required — explain the cause of delay" />
                  </div>
                </>
              )}

              {/* Blocked reason — sub can fill; admin/GC can fill */}
              {(form.status === 'Blocked' || (editTask && form.blocked_reason)) && !clientView && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-concrete-600 mb-1">Blocked Reason</label>
                  <input value={form.blocked_reason}
                    onChange={e => setForm(f => ({ ...f, blocked_reason: e.target.value }))}
                    className="input-field" placeholder="What is blocking this task?" />
                </div>
              )}

              {/* Client visibility toggle — admin/GC only */}
              {canManage && (
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="client-vis" checked={form.is_client_visible}
                    onChange={e => setForm(f => ({ ...f, is_client_visible: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <label htmlFor="client-vis" className="text-sm text-concrete-700">Visible to client</label>
                </div>
              )}

              {/* Notes — client gets a simplified message field; admin/GC get both */}
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

            {/* ── Conversation hint — shown to admin/GC when editing an existing task ── */}
            {editTask && canManage && (
              <div className="border-t border-concrete-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setConvTask(editTask);
                  }}
                  className="flex items-center gap-2 text-xs text-sky-600 hover:text-sky-800 font-semibold transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {convMeta.get(editTask.id)?.count
                    ? `View task conversation (${convMeta.get(editTask.id)?.count} message${convMeta.get(editTask.id)!.count !== 1 ? 's' : ''})`
                    : 'Open task conversation'}
                  {convMeta.get(editTask.id)?.needsAdminResponse && (
                    <span className="ml-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                      Needs response
                    </span>
                  )}
                </button>
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2 border-t border-concrete-100">
              <div>
                {editTask && isAdmin(role) && (
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setDeleteTask(editTask); }}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Task
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                <button onClick={saveTask} disabled={saving || !form.task_name.trim()}
                  className="btn-primary disabled:opacity-50 flex items-center gap-2">
                  {(isSub(role) || isClient(role)) && !editTask && <Send className="w-3.5 h-3.5" />}
                  {submitLabel}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
