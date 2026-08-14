import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import TaskConversationModal, { TaskForConversation } from '../components/project/TaskConversationModal';
import {
  ArrowLeft, MapPin, Calendar, CheckSquare, ClipboardList,
  FolderOpen, MessageSquare, AlertTriangle, Clock, RefreshCw,
  FileText, Download, Loader, User,
} from 'lucide-react';
import { AlertDot } from '../components/StatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  project_name: string;
  status: string;
  progress_percentage: number;
  start_date: string | null;
  expected_finish_date: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  client_visible_notes: string | null;
  description: string | null;
}

interface SubTask {
  id: string;
  task_name: string;
  task_type: string;
  category: string;
  status: string;
  progress_percentage: number;
  planned_finish_date: string | null;
  delay_days: number;
  blocked_reason: string | null;
  client_visible_notes: string;
  alert_status: string | null;
  assigned_user_id: string | null;
}

interface SubUpdate {
  id: string;
  update_date: string;
  work_completed_today: string;
  work_planned_tomorrow: string | null;
  blockers: string | null;
  user_id: string | null;
  submitter_name?: string;
}

interface SharedFile {
  id: string;
  file_name: string;
  file_type: string;
  storage_path: string | null;
  uploaded_at: string;
  uploaded_by_name?: string;
}

interface ConvMeta {
  count: number;
  hasAdminReply: boolean;
  needsResponse: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'Completed':        return 'bg-emerald-50 text-emerald-700';
    case 'Closed':           return 'bg-slate-100 text-slate-500';
    case 'Blocked':          return 'bg-red-50 text-red-600';
    case 'Needs Review':     return 'bg-amber-50 text-amber-700';
    case 'Ready for Review': return 'bg-sky-50 text-sky-700';
    case 'In Progress':
    case 'Assigned':         return 'bg-blue-50 text-blue-700';
    default:                 return 'bg-slate-100 text-slate-600';
  }
}

function taskActionButton(status: string, meta: ConvMeta | undefined, hasResponded: boolean) {
  if (status === 'Completed' || status === 'Closed') {
    return { label: 'View', cls: 'bg-slate-100 text-slate-500 hover:bg-slate-200', badge: null };
  }
  if (meta?.hasAdminReply) {
    return { label: 'Respond', cls: 'bg-slate-900 text-white hover:bg-slate-700', badge: 'Reply received', badgeCls: 'bg-blue-50 text-blue-700 border border-blue-200' };
  }
  if (status === 'Ready for Review' || status === 'Needs Review') {
    return { label: 'View / Update', cls: 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100', badge: 'Awaiting review', badgeCls: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (hasResponded) {
    return { label: 'Update', cls: 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100', badge: null };
  }
  return { label: 'Respond', cls: 'bg-slate-900 text-white hover:bg-slate-700', badge: null };
}

type TabId = 'summary' | 'tasks' | 'updates' | 'files' | 'conversations';

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'summary',       label: 'Summary',        Icon: FolderOpen },
  { id: 'tasks',         label: 'My Tasks',        Icon: CheckSquare },
  { id: 'updates',       label: 'Daily Updates',   Icon: ClipboardList },
  { id: 'files',         label: 'Files & Photos',  Icon: FileText },
  { id: 'conversations', label: 'Conversations',   Icon: MessageSquare },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubProjectDetailPage({
  projectId,
  onBack,
}: {
  projectId: string;
  onBack: () => void;
}) {
  const { profile } = useAuth();
  const [project, setProject]     = useState<Project | null>(null);
  const [tasks, setTasks]         = useState<SubTask[]>([]);
  const [updates, setUpdates]     = useState<SubUpdate[]>([]);
  const [files, setFiles]         = useState<SharedFile[]>([]);
  const [convMeta, setConvMeta]   = useState<Map<string, ConvMeta>>(new Map());
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<TabId>('summary');
  const [convTask, setConvTask]   = useState<TaskForConversation | null>(null);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    if (!profile) return;
    setLoading(true);

    const [projRes, taskRes, updateRes, fileRes] = await Promise.all([
      supabase.from('projects').select('id, project_name, status, progress_percentage, start_date, expected_finish_date, address, city, state, client_visible_notes, description').eq('id', projectId).maybeSingle(),
      supabase.from('tasks').select('*').eq('project_id', projectId).eq('assigned_user_id', profile.id).eq('is_deleted', false).neq('status', 'Completed').neq('status', 'Closed').order('created_at'),
      supabase.from('daily_updates').select('id, update_date, work_completed_today, work_planned_tomorrow, blockers, user_id').eq('project_id', projectId).order('update_date', { ascending: false }).limit(30),
      supabase.from('project_files').select('id, file_name, file_type, storage_path, uploaded_at').eq('project_id', projectId).eq('is_deleted', false).in('document_category', ['Photo', 'Site Photo', 'Progress Photo', 'Client Document', 'Task Attachment']).order('uploaded_at', { ascending: false }).limit(50),
    ]);

    setProject(projRes.data || null);

    const rawTasks: SubTask[] = taskRes.data || [];
    setTasks(rawTasks);

    const rawUpdates: SubUpdate[] = updateRes.data || [];

    // Load submitter names for updates
    const updateUserIds = [...new Set(rawUpdates.map(u => u.user_id).filter(Boolean))] as string[];
    if (updateUserIds.length > 0) {
      const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', updateUserIds);
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));
      rawUpdates.forEach(u => { if (u.user_id) u.submitter_name = nameMap.get(u.user_id) || 'Unknown'; });
    }
    setUpdates(rawUpdates);

    setFiles(fileRes.data || []);

    // Load conversation metadata for assigned tasks
    if (rawTasks.length > 0) {
      const taskIds = rawTasks.map(t => t.id);
      const { data: respData } = await supabase
        .from('task_responses')
        .select('task_id, response_type, responder_user_id, created_at')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true });

      const meta = new Map<string, ConvMeta>();
      const respondedSet = new Set<string>();

      (respData || []).forEach((r: any) => {
        const existing = meta.get(r.task_id) || { count: 0, hasAdminReply: false, needsResponse: false };
        existing.count++;
        if (r.response_type === 'admin_reply') {
          existing.hasAdminReply = true;
        } else if (r.responder_user_id === profile.id) {
          respondedSet.add(r.task_id);
          existing.hasAdminReply = false;
        }
        meta.set(r.task_id, existing);
      });

      setConvMeta(meta);
      setRespondedIds(respondedSet);
    }

    setLoading(false);
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to My Projects
        </button>
        <p className="text-sm text-slate-500">Project not found.</p>
      </div>
    );
  }

  const tasksNeedingResponse = tasks.filter(t => {
    const m = convMeta.get(t.id);
    return m?.needsResponse || m?.hasAdminReply || (!respondedIds.has(t.id) && (t.status === 'Open' || t.status === 'Assigned'));
  }).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to My Projects
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusBadge(project.status)}`}>{project.status}</span>
                {tasksNeedingResponse > 0 && (
                  <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
                    {tasksNeedingResponse} task{tasksNeedingResponse !== 1 ? 's' : ''} need response
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">{project.project_name}</h1>
              {(project.address || project.city) && (
                <div className="flex items-center gap-1 mt-1.5 text-sm text-slate-400">
                  <MapPin className="w-3.5 h-3.5" />
                  {[project.address, project.city, project.state].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Overall Progress</span>
              <span className="font-semibold text-slate-700">{project.progress_percentage}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${project.progress_percentage}%` }}
              />
            </div>
          </div>

          {/* Dates */}
          {(project.start_date || project.expected_finish_date) && (
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {project.start_date && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Started {fmtDate(project.start_date)}
                </div>
              )}
              {project.expected_finish_date && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Est. finish {fmtDate(project.expected_finish_date)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 mt-4">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.Icon;
            const isActive = tab === t.id;
            const badge = t.id === 'tasks' ? tasksNeedingResponse : 0;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                {t.label}
                {badge > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-6 py-5">

        {/* ── Summary ───────────────────────────────────────────────────── */}
        {tab === 'summary' && (
          <div className="space-y-4">
            {project.description && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Project Description</p>
                <p className="text-sm text-slate-700 leading-relaxed">{project.description}</p>
              </div>
            )}

            {project.client_visible_notes && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Project Notes</p>
                <p className="text-sm text-slate-700 leading-relaxed">{project.client_visible_notes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">My Open Tasks</p>
                <p className="text-2xl font-bold text-slate-900">{tasks.length}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">Needs Response</p>
                <p className={`text-2xl font-bold ${tasksNeedingResponse > 0 ? 'text-red-500' : 'text-slate-900'}`}>
                  {tasksNeedingResponse}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">Updates Submitted</p>
                <p className="text-2xl font-bold text-slate-900">{updates.length}</p>
              </div>
            </div>

            {/* Quick action: tasks needing response */}
            {tasksNeedingResponse > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">You have tasks that need a response</p>
                  <p className="text-xs text-amber-600 mt-0.5">Go to My Tasks to accept, ask questions, or send an update.</p>
                </div>
                <button
                  onClick={() => setTab('tasks')}
                  className="flex-shrink-0 text-xs font-semibold text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  View Tasks
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── My Tasks ──────────────────────────────────────────────────── */}
        {tab === 'tasks' && (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckSquare className="w-10 h-10 text-slate-200 mb-3" strokeWidth={1.5} />
                <p className="text-sm text-slate-500 font-medium">No open tasks assigned to you</p>
                <p className="text-xs text-slate-400 mt-1">Completed and closed tasks are hidden.</p>
              </div>
            ) : (
              tasks.map(t => {
                const meta = convMeta.get(t.id);
                const hasResponded = respondedIds.has(t.id);
                const btn = taskActionButton(t.status, meta, hasResponded);
                const isOverdue = t.planned_finish_date && t.planned_finish_date < today;
                return (
                  <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <AlertDot status={t.alert_status || 'green'} />
                          <span className="text-sm font-semibold text-slate-800">{t.task_name}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(t.status)}`}>{t.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                          <span className="bg-slate-100 px-2 py-0.5 rounded-full">{t.task_type || t.category}</span>
                          {t.planned_finish_date && (
                            <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                              Due {fmtDate(t.planned_finish_date)}
                              {isOverdue && ' — overdue'}
                            </span>
                          )}
                          {t.delay_days > 0 && (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {t.delay_days}d delay
                            </span>
                          )}
                        </div>
                        {t.blocked_reason && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Blocked: {t.blocked_reason}
                          </p>
                        )}
                        {t.client_visible_notes?.trim() && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{t.client_visible_notes}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${t.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${t.progress_percentage}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{t.progress_percentage}%</span>
                        </div>
                      </div>

                      {/* Action button — always visible */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {btn.badge && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${(btn as any).badgeCls || 'bg-slate-100 text-slate-500'}`}>
                            {btn.badge}
                          </span>
                        )}
                        <button
                          onClick={() => setConvTask(t)}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${btn.cls}`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          {btn.label}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Daily Updates ──────────────────────────────────────────────── */}
        {tab === 'updates' && (
          <div className="space-y-3">
            {updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardList className="w-10 h-10 text-slate-200 mb-3" strokeWidth={1.5} />
                <p className="text-sm text-slate-500 font-medium">No daily updates yet</p>
                <p className="text-xs text-slate-400 mt-1">Updates submitted via task conversations appear here.</p>
              </div>
            ) : (
              updates.map(u => (
                <div key={u.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">
                        {fmtDate(u.update_date)}
                      </span>
                    </div>
                    {u.submitter_name && (
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <User className="w-3 h-3" />
                        {u.submitter_name}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    {u.work_completed_today && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Completed</p>
                        <p className="text-slate-700 leading-relaxed mt-0.5">{u.work_completed_today}</p>
                      </div>
                    )}
                    {u.work_planned_tomorrow && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tomorrow</p>
                        <p className="text-slate-700 leading-relaxed mt-0.5">{u.work_planned_tomorrow}</p>
                      </div>
                    )}
                    {u.blockers && (
                      <div>
                        <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Blockers</p>
                        <p className="text-slate-700 leading-relaxed mt-0.5">{u.blockers}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Files & Photos ─────────────────────────────────────────────── */}
        {tab === 'files' && (
          <div>
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="w-10 h-10 text-slate-200 mb-3" strokeWidth={1.5} />
                <p className="text-sm text-slate-500 font-medium">No files shared yet</p>
                <p className="text-xs text-slate-400 mt-1">Photos and documents from this project will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {files.map(f => (
                  <FileCard key={f.id} file={f} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Conversations ──────────────────────────────────────────────── */}
        {tab === 'conversations' && (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="w-10 h-10 text-slate-200 mb-3" strokeWidth={1.5} />
                <p className="text-sm text-slate-500 font-medium">No tasks with conversations</p>
              </div>
            ) : (
              tasks.map(t => {
                const meta = convMeta.get(t.id);
                const hasMessages = (meta?.count ?? 0) > 0;
                const needsResp = meta?.hasAdminReply || (!respondedIds.has(t.id) && (t.status === 'Open' || t.status === 'Assigned'));
                return (
                  <button
                    key={t.id}
                    onClick={() => setConvTask(t)}
                    className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{t.task_name}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(t.status)}`}>{t.status}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className={`flex items-center gap-1 text-xs ${
                            needsResp ? 'text-orange-500 font-semibold' :
                            hasMessages ? 'text-sky-600' : 'text-slate-400'
                          }`}>
                            <MessageSquare className="w-3 h-3" />
                            {needsResp ? 'Needs response' : hasMessages ? `${meta!.count} message${meta!.count !== 1 ? 's' : ''}` : 'No messages yet'}
                          </span>
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        needsResp ? 'bg-slate-900 text-white group-hover:bg-slate-700' :
                        hasMessages ? 'bg-sky-50 text-sky-700 border border-sky-200 group-hover:bg-sky-100' :
                        'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                      }`}>
                        {needsResp ? 'Respond' : hasMessages ? 'View' : 'Start'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Task Conversation Modal */}
      {convTask && profile && (
        <TaskConversationModal
          task={convTask}
          projectName={project.project_name}
          userId={profile.id}
          userRole={profile.role}
          userName={profile.full_name || ''}
          onClose={() => setConvTask(null)}
          onTaskStatusChanged={() => { setConvTask(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── File card ────────────────────────────────────────────────────────────────

function FileCard({ file }: { file: SharedFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  async function fetchUrl() {
    if (url || !file.storage_path) return;
    setLoadingUrl(true);
    const { data } = await supabase.storage.from('project-files').createSignedUrl(file.storage_path, 3600);
    setUrl(data?.signedUrl || null);
    setLoadingUrl(false);
  }

  const ext = file.file_type?.toUpperCase() || '';
  const isImage = ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(ext);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isImage ? 'bg-blue-50' : 'bg-slate-100'}`}>
        <FileText className={`w-4 h-4 ${isImage ? 'text-blue-500' : 'text-slate-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{file.file_name}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {ext} · {new Date(file.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      </div>
      {file.storage_path && (
        url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
            <Download className="w-3.5 h-3.5" />
          </a>
        ) : (
          <button onClick={fetchUrl} disabled={loadingUrl}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
            {loadingUrl ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        )
      )}
    </div>
  );
}
