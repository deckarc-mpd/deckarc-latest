import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X, Send, Loader, MessageSquare, CheckCircle, XCircle, HelpCircle,
  List, DollarSign, ClipboardList, ChevronLeft, AlertCircle, Calendar,
  FileText, Check, Ban,
} from 'lucide-react';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TaskForConversation {
  id: string;
  task_name: string;
  task_type: string;
  category: string;
  status: string;
  project_id: string;
  planned_finish_date: string | null;
  client_visible_notes: string;
  assigned_user_id?: string | null;
  created_by_user_id?: string | null;
}

interface ConversationItem {
  id: string;
  response_type: string;
  response_text: string;
  responder_name: string;
  responder_role: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripBracketPrefix(text: string): string {
  return text.replace(/^\[[A-Z \/]+\]\n?/, '').trim();
}

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  accepted:      'Accepted',
  declined:      'Declined',
  question:      'Question',
  material_list: 'Material List',
  quote:         'Quote',
  daily_update:  'Daily Update',
  admin_reply:   'Reply',
  general:       'Response',
};

const ROLE_LABELS: Record<string, string> = {
  DECKARC_ADMIN:         'Admin',
  CONVAZANT_SUPER_ADMIN: 'Admin',
  GENERAL_CONTRACTOR:    'GC',
  SUBCONTRACTOR:         'Subcontractor',
  CLIENT:                'Client',
};

function typeBadgeCls(rt: string) {
  if (rt === 'admin_reply')   return 'bg-blue-100 text-blue-700';
  if (rt === 'accepted')      return 'bg-emerald-100 text-emerald-700';
  if (rt === 'declined')      return 'bg-red-100 text-red-700';
  if (rt === 'question')      return 'bg-sky-100 text-sky-700';
  if (rt === 'daily_update')  return 'bg-slate-100 text-slate-700';
  if (rt === 'material_list') return 'bg-amber-100 text-amber-700';
  if (rt === 'quote')         return 'bg-teal-100 text-teal-700';
  return 'bg-slate-100 text-slate-600';
}

function statusBadgeCls(status: string) {
  if (status === 'Ready for Review') return 'bg-sky-100 text-sky-700';
  if (status === 'In Progress')      return 'bg-blue-100 text-blue-700';
  if (status === 'Blocked')          return 'bg-red-100 text-red-700';
  if (status === 'Needs Review')     return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

// ─── Sub action definitions ───────────────────────────────────────────────────

type ActionId = 'accept' | 'decline' | 'question' | 'material-list' | 'quote' | 'daily-update';

const ACTION_TO_RESPONSE_TYPE: Record<ActionId, string> = {
  'accept':        'accepted',
  'decline':       'declined',
  'question':      'question',
  'material-list': 'material_list',
  'quote':         'quote',
  'daily-update':  'daily_update',
};

interface ActionDef {
  id: ActionId;
  label: string;
  shortDesc: string;
  Icon: React.ElementType;
  cardCls: string;
  btnCls: string;
  iconCls: string;
  statusAfter: string;
  prefix: string;
}

const ACTIONS: ActionDef[] = [
  { id: 'accept',       label: 'Accept',        shortDesc: 'Accept and begin this task',   Icon: CheckCircle,   cardCls: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100', btnCls: 'bg-emerald-600 hover:bg-emerald-700', iconCls: 'text-emerald-700', statusAfter: 'In Progress',   prefix: '[ACCEPTED]' },
  { id: 'decline',      label: 'Decline',        shortDesc: 'Decline with a reason',        Icon: XCircle,       cardCls: 'border-red-200 bg-red-50 hover:bg-red-100',            btnCls: 'bg-red-600 hover:bg-red-700',         iconCls: 'text-red-700',     statusAfter: 'Needs Review',  prefix: '[DECLINED]' },
  { id: 'question',     label: 'Ask Question',   shortDesc: 'Ask admin for clarification',  Icon: HelpCircle,    cardCls: 'border-blue-200 bg-blue-50 hover:bg-blue-100',          btnCls: 'bg-blue-600 hover:bg-blue-700',       iconCls: 'text-blue-700',    statusAfter: 'Needs Review',  prefix: '[QUESTION]' },
  { id: 'material-list',label: 'Material List',  shortDesc: 'Submit materials needed',      Icon: List,          cardCls: 'border-amber-200 bg-amber-50 hover:bg-amber-100',       btnCls: 'bg-amber-600 hover:bg-amber-700',     iconCls: 'text-amber-700',   statusAfter: 'Ready for Review', prefix: '[MATERIAL LIST]' },
  { id: 'quote',        label: 'Quote',          shortDesc: 'Submit a price quote',         Icon: DollarSign,    cardCls: 'border-teal-200 bg-teal-50 hover:bg-teal-100',          btnCls: 'bg-teal-700 hover:bg-teal-800',       iconCls: 'text-teal-700',    statusAfter: 'Ready for Review', prefix: '[QUOTE]' },
  { id: 'daily-update', label: 'Daily Update',   shortDesc: 'Submit a progress update',     Icon: ClipboardList, cardCls: 'border-slate-200 bg-slate-50 hover:bg-slate-100',       btnCls: 'bg-slate-800 hover:bg-slate-900',     iconCls: 'text-slate-700',   statusAfter: 'In Progress',   prefix: '[DAILY UPDATE]' },
];

const FULL_ACTION_TYPES = new Set([
  'Material Task', 'File/Document Request', 'Subcontractor Request', 'Follow-Up', 'GC Task',
]);

// ─── Conversation thread display ──────────────────────────────────────────────

function ConversationThread({
  items, currentUserId,
}: {
  items: ConversationItem[];
  currentUserId: string;
}) {
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mb-2.5">
        <MessageSquare className="w-5 h-5 text-slate-400" />
      </div>
      <p className="text-sm text-slate-500 font-medium">No messages yet</p>
      <p className="text-xs text-slate-400 mt-0.5">Use the actions below to start the conversation.</p>
    </div>
  );

  return (
    <div className="space-y-3 px-5 py-4">
      {items.map(item => {
        const isMine      = item.response_type !== 'admin_reply';
        const isAdminMsg  = item.response_type === 'admin_reply';
        const displayText = stripBracketPrefix(item.response_text);
        const roleLabel   = ROLE_LABELS[item.responder_role] || item.responder_role;
        const typeLabel   = RESPONSE_TYPE_LABELS[item.response_type] || item.response_type;

        return (
          <div key={item.id} className={`flex flex-col gap-0.5 ${isAdminMsg ? '' : 'items-end'}`}>
            {/* Sender line */}
            <div className={`flex items-center gap-1.5 ${isAdminMsg ? '' : 'flex-row-reverse'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                isAdminMsg ? 'bg-blue-200' : 'bg-slate-200'
              }`}>
                <span className={`text-[9px] font-bold ${isAdminMsg ? 'text-blue-700' : 'text-slate-600'}`}>
                  {item.responder_name?.charAt(0) || '?'}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-600">{item.responder_name || 'Unknown'}</span>
              {roleLabel && <span className="text-[10px] text-slate-400">· {roleLabel}</span>}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeBadgeCls(item.response_type)}`}>
                {typeLabel}
              </span>
              <span className="text-[10px] text-slate-300 ml-auto">
                {new Date(item.created_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </div>
            {/* Bubble */}
            <div className={`max-w-[85%] ${isAdminMsg ? 'ml-6 mr-8' : 'ml-8 mr-0'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                isAdminMsg
                  ? 'bg-blue-600 text-white rounded-tl-sm'
                  : 'bg-slate-100 text-slate-800 rounded-tr-sm'
              }`}>
                {displayText
                  ? <p className="whitespace-pre-wrap">{displayText}</p>
                  : <p className="italic opacity-60">{typeLabel}</p>
                }
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  task: TaskForConversation;
  projectName: string;
  userId: string;
  userRole: string;
  userName: string;
  onClose: () => void;
  onTaskStatusChanged?: (taskId: string, newStatus: string) => void;
  onCancelRequest?: (taskId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaskConversationModal({
  task, projectName, userId, userRole, userName, onClose, onTaskStatusChanged, onCancelRequest,
}: Props) {
  const isAdmin = userRole === 'CONVAZANT_SUPER_ADMIN' || userRole === 'DECKARC_ADMIN' || userRole === 'GENERAL_CONTRACTOR';
  const isSub   = userRole === 'SUBCONTRACTOR';

  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [convLoading, setConvLoading]   = useState(true);
  const [currentStatus, setCurrentStatus] = useState(task.status);

  // Sub action flow
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);
  const [text, setText]           = useState('');
  const [duWorkDone, setDuWorkDone] = useState('');
  const [duBlockers, setDuBlockers] = useState('');
  const [duMaterials, setDuMaterials] = useState('');
  const [duTomorrow, setDuTomorrow] = useState('');
  const [submitted, setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving]         = useState(false);

  // Admin reply / actions
  type AdminMode = 'thread' | 'reply' | 'followup';
  const [adminMode, setAdminMode] = useState<AdminMode>('thread');
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying]   = useState(false);

  // Cancel request confirmation (sub only — own created tasks)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const NON_CANCELLABLE = new Set(['Completed', 'Closed', 'Cancelled', 'In Progress', 'Ready for Review', 'Approved']);
  const canCancelOwnRequest = isSub
    && task.created_by_user_id === userId
    && !NON_CANCELLABLE.has(currentStatus);

  const action = selectedAction ? ACTIONS.find(a => a.id === selectedAction)! : null;
  const visibleActions = FULL_ACTION_TYPES.has(task.task_type)
    ? ACTIONS
    : ACTIONS.filter(a => a.id !== 'material-list' && a.id !== 'quote');

  const dueLabel = task.planned_finish_date
    ? new Date(task.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  useEffect(() => { loadConversation(); }, [task.id]);

  async function loadConversation() {
    setConvLoading(true);
    const { data: rData } = await supabase
      .from('task_responses')
      .select('id, response_type, response_text, responder_user_id, responder_role, created_at')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });

    if (!rData || rData.length === 0) {
      setConversation([]);
      setConvLoading(false);
      return;
    }

    const userIds = [...new Set(rData.map((r: any) => r.responder_user_id as string))];
    const { data: profiles } = await supabase
      .from('user_profiles').select('id, full_name').in('id', userIds);
    const nameMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name; });

    setConversation(rData.map((r: any) => ({
      id:             r.id,
      response_type:  r.response_type || 'general',
      response_text:  r.response_text,
      responder_name: nameMap[r.responder_user_id] || 'Unknown',
      responder_role: r.responder_role || '',
      created_at:     r.created_at,
    })));
    setConvLoading(false);
  }

  function resetSubAction() {
    setSelectedAction(null);
    setText('');
    setSubmitError('');
    setDuWorkDone(''); setDuBlockers(''); setDuMaterials(''); setDuTomorrow('');
  }

  function canSubmitSub(): boolean {
    if (!action) return false;
    if (action.id === 'accept') return true;
    if (action.id === 'daily-update') return duWorkDone.trim().length > 0;
    return text.trim().length > 0;
  }

  function buildSubResponseText(): string {
    if (!action) return '';
    if (action.id === 'accept') {
      return text.trim() ? `${action.prefix}\n${text.trim()}` : action.prefix;
    }
    if (action.id === 'daily-update') {
      return [
        action.prefix,
        `Work Completed: ${duWorkDone.trim()}`,
        duBlockers.trim()  ? `Blockers: ${duBlockers.trim()}`          : '',
        duMaterials.trim() ? `Materials Needed: ${duMaterials.trim()}` : '',
        duTomorrow.trim()  ? `Tomorrow's Plan: ${duTomorrow.trim()}`   : '',
      ].filter(Boolean).join('\n');
    }
    return `${action.prefix}\n${text.trim()}`;
  }

  async function handleSubSubmit() {
    if (!action || !canSubmitSub()) return;
    setSaving(true);
    setSubmitError('');

    const responseText = buildSubResponseText();
    const responseType = ACTION_TO_RESPONSE_TYPE[action.id];
    const newStatus    = action.statusAfter;

    try {
      const { error: insertErr } = await supabase.from('task_responses').insert({
        task_id:           task.id,
        project_id:        task.project_id,
        responder_user_id: userId,
        response_text:     responseText,
        visibility:        'internal',
        status:            'submitted',
        response_type:     responseType,
        responder_role:    userRole,
      });

      if (insertErr) {
        setSubmitError('Could not save your response. Please try again.');
        setSaving(false);
        return;
      }

      if (!['Completed', 'Closed'].includes(currentStatus)) {
        await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
        setCurrentStatus(newStatus);
      }

      // Determine if this response needs admin attention
      // Needs Review / Ready for Review statuses → task-review action item
      // Daily update with a blocker → separate blocker action item
      const needsAdminReview = newStatus === 'Needs Review' || newStatus === 'Ready for Review';
      const isDailyUpdateWithBlocker = action.id === 'daily-update' && duBlockers.trim().length > 0;

      if (needsAdminReview || isDailyUpdateWithBlocker) {
        const sourceId = needsAdminReview
          ? `task-review-${task.id}`
          : `task-blocker-${task.id}`;
        const responseLabel = responseType === 'question' ? 'Question'
          : responseType === 'material_list' ? 'Material List'
          : responseType === 'quote' ? 'Quote'
          : responseType === 'declined' ? 'Declined'
          : responseType === 'daily_update' ? 'Daily Update with Blocker'
          : 'Response';
        const actionTitle = task.task_name;
        const actionDesc  = isDailyUpdateWithBlocker
          ? `Blocker reported by ${userName}: ${duBlockers.trim().slice(0, 120)}`
          : `${responseLabel} from ${userName}`;
        const priority = (responseType === 'question' || isDailyUpdateWithBlocker) ? 'High' : 'Medium';

        const { data: existingItem } = await supabase
          .from('action_items')
          .select('id, status')
          .eq('source_id', sourceId)
          .maybeSingle();

        if (existingItem) {
          if (existingItem.status === 'Done') {
            await supabase.from('action_items').update({
              status: 'Open',
              resolved_at: null,
              action_description: actionDesc,
              updated_at: new Date().toISOString(),
            }).eq('id', existingItem.id);
          } else {
            // Refresh description with latest response info
            await supabase.from('action_items').update({
              action_description: actionDesc,
              updated_at: new Date().toISOString(),
            }).eq('id', existingItem.id);
          }
        } else {
          await supabase.from('action_items').insert({
            action_title:       actionTitle,
            action_description: actionDesc,
            project_id:         task.project_id,
            related_task_id:    task.id,
            priority,
            source_type:        'task_response',
            source_id:          sourceId,
            status:             'Open',
          });
        }

        console.log('fieldResponseActionItemCreated', { sourceId, actionTitle, actionDesc, priority });
      }

      if (action.id === 'daily-update') {
        supabase.from('daily_updates').insert({
          project_id: task.project_id, task_id: task.id, user_id: userId,
          update_date: new Date().toISOString().split('T')[0],
          work_completed_today: duWorkDone.trim(),
          work_planned_tomorrow: duTomorrow.trim(),
          current_status: 'In Progress',
          blockers: duBlockers.trim(),
          materials_pending: duMaterials.trim(),
          delay_reason: '', delay_days: 0,
          materials_delivered: '', permit_update: '',
          inspection_update: '', weather_issue: '',
          client_decision_needed: '', internal_note: '', client_visible_note: '',
        }).then(() => {});
      }

      // Notify admins/GC of the field response — store full deep-link fields
      supabase.from('project_members_safe')
        .select('user_id, role').eq('project_id', task.project_id)
        .then(({ data: members }) => {
          const admins = (members || []).filter((m: any) =>
            ['DECKARC_ADMIN', 'CONVAZANT_SUPER_ADMIN', 'GENERAL_CONTRACTOR'].includes(m.role)
          );
          if (admins.length > 0) {
            const notifTitle = responseType === 'question'
              ? `Question from ${userName}`
              : responseType === 'material_list'
              ? `Material List Submitted`
              : responseType === 'quote'
              ? `Quote Submitted`
              : responseType === 'declined'
              ? `Task Declined by ${userName}`
              : action.id === 'daily-update' && duBlockers.trim()
              ? `Daily Update with Blocker`
              : `${action.label}`;
            const notifDetail = responseType === 'question'
              ? responseText.replace(/^\[[A-Z \/]+\]\n?/, '').trim().slice(0, 200)
              : responseType === 'material_list'
              ? `Material list for "${task.task_name}"`
              : responseType === 'quote'
              ? `Quote for "${task.task_name}"`
              : responseType === 'declined'
              ? responseText.replace(/^\[[A-Z \/]+\]\n?/, '').trim().slice(0, 200)
              : action.id === 'daily-update' && duBlockers.trim()
              ? duBlockers.trim().slice(0, 200)
              : responseText.replace(/^\[[A-Z \/]+\]\n?/, '').trim().slice(0, 200);
            const notifMessage = `${userName}: ${notifDetail}`;
            const notifType = responseType === 'question' ? 'task_question'
              : responseType === 'material_list' ? 'task_material_list'
              : responseType === 'quote' ? 'task_quote'
              : responseType === 'declined' ? 'task_declined'
              : responseType === 'daily_update' ? 'task_daily_update'
              : 'task_response_submitted';
            const sourceId = needsAdminReview
              ? `task-review-${task.id}`
              : isDailyUpdateWithBlocker
              ? `task-blocker-${task.id}`
              : `task-response-${task.id}`;
            const notifRows = admins.map((a: any) => ({
              project_id:        task.project_id,
              user_id:           a.user_id,
              task_id:           task.id,
              notification_type: notifType,
              title:             notifTitle,
              message:           notifMessage,
              detail:            notifDetail,
              source_type:       'task_response',
              source_id:         sourceId,
              action_label:      'Open Conversation',
              action_target:     'task_conversation',
              status:            'unread',
            }));
            supabase.from('notifications').insert(notifRows).then(() => {
              console.log('fieldResponseNotificationCreated', notifRows);
            });
          }
        });

      await loadConversation();
      onTaskStatusChanged?.(task.id, newStatus);
      setSaving(false);
      setSubmitted(true);

    } catch {
      setSubmitError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  async function handleAdminReply(replyType: 'admin_reply' | 'question') {
    if (!replyText.trim()) return;
    setReplying(true);
    const prefix = replyType === 'question' ? '[FOLLOW-UP QUESTION]\n' : '';
    const fullReplyText = prefix + replyText.trim();
    await supabase.from('task_responses').insert({
      task_id:           task.id,
      project_id:        task.project_id,
      responder_user_id: userId,
      response_text:     fullReplyText,
      visibility:        'internal',
      status:            'submitted',
      response_type:     'admin_reply',
      responder_role:    userRole,
    });

    // Notify the assigned subcontractor/field user about the admin reply
    if (task.assigned_user_id && task.assigned_user_id !== userId) {
      const replyPreview = replyText.trim().slice(0, 200);
      supabase.from('notifications').insert({
        project_id:        task.project_id,
        user_id:           task.assigned_user_id,
        task_id:           task.id,
        notification_type: 'admin_reply',
        title:             replyType === 'question' ? 'Follow-Up Question from Admin' : 'Admin Replied',
        message:           `${userName}: ${replyPreview}`,
        detail:            replyPreview,
        source_type:       'task_response',
        source_id:         `task-review-${task.id}`,
        action_label:      'Open Conversation',
        action_target:     'task_conversation',
        status:            'unread',
      }).then(() => {});
    }

    setReplyText('');
    setAdminMode('thread');
    await loadConversation();
    setReplying(false);
  }

  async function handleMarkComplete() {
    await supabase.from('tasks').update({ status: 'Completed' }).eq('id', task.id);
    setCurrentStatus('Completed');
    onTaskStatusChanged?.(task.id, 'Completed');
    onClose();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[96dvh] sm:max-h-[88vh] rounded-t-2xl overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          {(selectedAction && !submitted) || adminMode !== 'thread' ? (
            <button
              onClick={() => { resetSubAction(); setAdminMode('thread'); }}
              disabled={saving || replying}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Task Conversation</p>
            <h2 className="text-sm font-bold text-slate-900 truncate leading-tight mt-0.5">{task.task_name}</h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeCls(currentStatus)}`}>
              {currentStatus}
            </span>
            <button onClick={onClose} disabled={saving} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Task context strip ─────────────────────────────────────────── */}
        <div className="px-5 py-2.5 border-b border-slate-50 bg-slate-50 flex items-center gap-3 flex-shrink-0">
          <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 truncate flex-1">{projectName} · {task.task_type}</span>
          {dueLabel && (
            <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
              <Calendar className="w-3 h-3" /> Due {dueLabel}
            </span>
          )}
        </div>

        {/* ── Request details (if any) — show once at top ────────────────── */}
        {task.client_visible_notes?.trim() && (
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Request Details</p>
            <p className="text-sm text-slate-700 leading-relaxed">{task.client_visible_notes.trim()}</p>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 min-h-0">

          {/* Conversation thread — always shown first */}
          {convLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-8 px-5">
              <Loader className="w-3.5 h-3.5 animate-spin" /> Loading conversation...
            </div>
          ) : (
            <ConversationThread items={conversation} currentUserId={userId} />
          )}

          {/* ─────────── ADMIN VIEW ─────────────────────────────────────── */}
          {isAdmin && !convLoading && (
            <div className="px-5 pb-5 space-y-3">

              {/* Sub-submitted success message after reply */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              )}

              {/* Admin: Reply compose */}
              {adminMode === 'reply' && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">Reply to subcontractor</p>
                  <textarea
                    autoFocus
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={4}
                    placeholder="Type your reply..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setAdminMode('thread'); setReplyText(''); }}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAdminReply('admin_reply')}
                      disabled={replying || !replyText.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40"
                    >
                      {replying ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send Reply</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Admin: Follow-up question compose */}
              {adminMode === 'followup' && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">Ask a follow-up question</p>
                  <textarea
                    autoFocus
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="What do you need to know from the subcontractor?"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setAdminMode('thread'); setReplyText(''); }}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAdminReply('question')}
                      disabled={replying || !replyText.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-40"
                    >
                      {replying ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─────────── SUB VIEW ───────────────────────────────────────── */}
          {isSub && !convLoading && (

            <div className="px-5 pb-5 space-y-4">

              {/* Sub success screen */}
              {submitted && action && (
                <div className="flex flex-col items-center text-center py-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
                    action.id === 'accept' ? 'bg-emerald-50' : action.id === 'decline' ? 'bg-red-50' : 'bg-slate-100'
                  }`}>
                    <action.Icon className={`w-6 h-6 ${action.iconCls}`} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    {action.id === 'accept' ? 'Request Accepted' : action.id === 'decline' ? 'Response Sent' : action.id === 'daily-update' ? 'Daily Update Submitted' : `${action.label} Submitted`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                    {action.id === 'accept' ? 'Task is now In Progress. Admin has been notified.'
                      : action.id === 'question' ? 'Your question was sent. Admin will reply here.'
                      : action.id === 'daily-update' ? 'Your update was saved and appears on the Daily Updates page.'
                      : 'Admin has been notified and will review your response.'}
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-4 px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Error banner */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              )}

              {/* Action selection grid */}
              {!submitted && !selectedAction && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select your response</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {visibleActions.map(a => {
                      const Icon = a.Icon;
                      return (
                        <button key={a.id} onClick={() => { setSubmitError(''); setSelectedAction(a.id); }}
                          className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-sm active:scale-[0.98] ${a.cardCls}`}>
                          <Icon className={`w-5 h-5 flex-shrink-0 ${a.iconCls}`} />
                          <div className="min-w-0">
                            <p className={`text-sm font-bold ${a.iconCls}`}>{a.label}</p>
                            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{a.shortDesc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Accept */}
              {!submitted && selectedAction === 'accept' && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Confirm Acceptance</p>
                      <p className="text-xs text-emerald-600 mt-1">Task will be set to <strong>In Progress</strong>.</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Note <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={2}
                      placeholder="Any notes about how you'll complete this..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none" />
                  </div>
                </div>
              )}

              {/* Decline / Question / Material List / Quote */}
              {!submitted && selectedAction && !['accept', 'daily-update'].includes(selectedAction) && action && (
                <div className="space-y-3">
                  {selectedAction === 'decline' && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">Admin will be notified and the task returns to Needs Review.</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      {selectedAction === 'decline' ? 'Reason for declining' : selectedAction === 'question' ? 'Your question' : selectedAction === 'material-list' ? 'Material list' : 'Quote details'}
                      {' '}<span className="text-red-500">*</span>
                    </label>
                    <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
                      rows={selectedAction === 'material-list' ? 6 : 4}
                      placeholder={
                        selectedAction === 'decline' ? 'Explain why you are declining...'
                          : selectedAction === 'question' ? 'What do you need clarified before proceeding?'
                          : selectedAction === 'material-list' ? 'List materials, quantities, specifications...'
                          : 'Total amount, line items, timeline, terms...'
                      }
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none leading-relaxed" />
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Task status → <span className="font-semibold text-slate-600">{action.statusAfter}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Daily Update */}
              {!submitted && selectedAction === 'daily-update' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work completed today <span className="text-red-500">*</span></label>
                    <textarea autoFocus value={duWorkDone} onChange={e => setDuWorkDone(e.target.value)} rows={3}
                      placeholder="Describe what was completed today..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Blockers / delays <span className="text-slate-400 font-normal">(optional)</span></label>
                    <textarea value={duBlockers} onChange={e => setDuBlockers(e.target.value)} rows={2}
                      placeholder="Any issues blocking progress?"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Materials needed <span className="text-slate-400 font-normal">(optional)</span></label>
                    <textarea value={duMaterials} onChange={e => setDuMaterials(e.target.value)} rows={2}
                      placeholder="Materials required before next visit..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tomorrow's plan <span className="text-slate-400 font-normal">(optional)</span></label>
                    <textarea value={duTomorrow} onChange={e => setDuTomorrow(e.target.value)} rows={2}
                      placeholder="What's the plan for tomorrow?"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none" />
                  </div>
                  <p className="text-[11px] text-slate-400">This update will also appear on the Daily Updates page.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        {isAdmin && !convLoading && adminMode === 'thread' && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 flex-shrink-0 bg-white flex-wrap">
            <button onClick={() => setAdminMode('reply')}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors">
              <Send className="w-3 h-3" /> Reply
            </button>
            <button onClick={() => setAdminMode('followup')}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors">
              <HelpCircle className="w-3 h-3" /> Ask Follow-Up
            </button>
            {(currentStatus === 'Ready for Review' || currentStatus === 'Needs Review') && (
              <button onClick={handleMarkComplete}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors ml-auto">
                <Check className="w-3 h-3" /> Mark Complete
              </button>
            )}
          </div>
        )}

        {/* Sub action footer */}
        {isSub && selectedAction && !submitted && (
          <div className="flex justify-between items-center gap-3 px-5 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
            <button onClick={resetSubAction} disabled={saving}
              className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium">
              Back
            </button>
            <button onClick={handleSubSubmit} disabled={saving || !canSubmitSub()}
              className={`flex items-center gap-2 px-6 py-2.5 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 min-w-[140px] justify-center ${action!.btnCls}`}>
              {saving ? <><Loader className="w-4 h-4 animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit {action!.label}</>}
            </button>
          </div>
        )}

        {/* Sub footer: Cancel Request option (no action selected) */}
        {isSub && !selectedAction && !submitted && canCancelOwnRequest && onCancelRequest && (
          <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0 bg-white">
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" /> Cancel this request
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  This will remove your request from active tracking. Conversation history will be retained for audit.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Keep Request
                  </button>
                  <button
                    onClick={() => { onCancelRequest(task.id); onClose(); }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Ban className="w-3 h-3" /> Cancel Request
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Message icon with status indicator ──────────────────────────────────────

export interface TaskConvMeta {
  count: number;
  hasQuestion: boolean;
  needsAdminResponse: boolean;
}

export function MessageIconButton({
  meta, onClick,
}: {
  meta: TaskConvMeta | undefined;
  onClick: (e: React.MouseEvent) => void;
}) {
  const hasMessages = (meta?.count ?? 0) > 0;
  const needsResp   = meta?.needsAdminResponse ?? false;
  const hasQuestion = meta?.hasQuestion ?? false;

  return (
    <button
      onClick={onClick}
      title={needsResp ? 'Needs your response' : hasMessages ? 'View conversation' : 'Start conversation'}
      className={`relative p-1.5 rounded-lg transition-colors flex-shrink-0 ${
        needsResp   ? 'text-orange-500 hover:bg-orange-50'  :
        hasMessages ? 'text-sky-500 hover:bg-sky-50'        :
                      'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
      }`}
    >
      <MessageSquare className="w-3.5 h-3.5" />
      {needsResp && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
      )}
      {!needsResp && hasMessages && meta && meta.count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-sky-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
          {meta.count > 9 ? '9+' : meta.count}
        </span>
      )}
    </button>
  );
}
