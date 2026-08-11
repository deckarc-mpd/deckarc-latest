import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X, CheckCircle, XCircle, HelpCircle, List, DollarSign,
  ClipboardList, Send, Calendar, AlertCircle, Loader, FileText,
  ChevronLeft, MessageSquare,
} from 'lucide-react';

// ─── Shared task shape ────────────────────────────────────────────────────────

export interface TaskForResponse {
  id: string;
  task_name: string;
  task_type: string;
  category: string;
  status: string;
  project_id: string;
  planned_finish_date: string | null;
  // shown to sub as "Request Details" — admin puts the request here
  client_visible_notes: string;
}

// ─── Conversation item ────────────────────────────────────────────────────────

interface ConversationItem {
  id: string;
  response_type: string;
  response_text: string;
  responder_name: string;
  responder_role: string;
  created_at: string;
}

// ─── Action definitions ───────────────────────────────────────────────────────

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
  {
    id: 'accept',
    label: 'Accept',
    shortDesc: 'Accept and begin this task',
    Icon: CheckCircle,
    cardCls: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
    btnCls: 'bg-emerald-600 hover:bg-emerald-700',
    iconCls: 'text-emerald-700',
    statusAfter: 'In Progress',
    prefix: '[ACCEPTED]',
  },
  {
    id: 'decline',
    label: 'Decline',
    shortDesc: 'Decline with a reason',
    Icon: XCircle,
    cardCls: 'border-red-200 bg-red-50 hover:bg-red-100',
    btnCls: 'bg-red-600 hover:bg-red-700',
    iconCls: 'text-red-700',
    statusAfter: 'Needs Review',
    prefix: '[DECLINED]',
  },
  {
    id: 'question',
    label: 'Ask Question',
    shortDesc: 'Ask admin for clarification',
    Icon: HelpCircle,
    cardCls: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    btnCls: 'bg-blue-600 hover:bg-blue-700',
    iconCls: 'text-blue-700',
    statusAfter: 'Needs Review',
    prefix: '[QUESTION]',
  },
  {
    id: 'material-list',
    label: 'Material List',
    shortDesc: 'Submit materials needed',
    Icon: List,
    cardCls: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
    btnCls: 'bg-amber-600 hover:bg-amber-700',
    iconCls: 'text-amber-700',
    statusAfter: 'Ready for Review',
    prefix: '[MATERIAL LIST]',
  },
  {
    id: 'quote',
    label: 'Quote',
    shortDesc: 'Submit a price quote',
    Icon: DollarSign,
    cardCls: 'border-teal-200 bg-teal-50 hover:bg-teal-100',
    btnCls: 'bg-teal-700 hover:bg-teal-800',
    iconCls: 'text-teal-700',
    statusAfter: 'Ready for Review',
    prefix: '[QUOTE]',
  },
  {
    id: 'daily-update',
    label: 'Daily Update',
    shortDesc: 'Submit a progress update',
    Icon: ClipboardList,
    cardCls: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    btnCls: 'bg-slate-800 hover:bg-slate-900',
    iconCls: 'text-slate-700',
    statusAfter: 'In Progress',
    prefix: '[DAILY UPDATE]',
  },
];

const FULL_ACTION_TYPES = new Set([
  'Material Task', 'File/Document Request', 'Subcontractor Request', 'Follow-Up', 'GC Task',
]);

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

// ─── Conversation trail ───────────────────────────────────────────────────────

function ConversationTrail({ items }: { items: ConversationItem[] }) {
  if (items.length === 0) return null;

  // Strip bracket prefix like [ACCEPTED], [QUESTION] etc. from stored response text
// The response_type badge already communicates the type — no need to show it twice.
function stripBracketPrefix(text: string): string {
  return text.replace(/^\[[A-Z \/]+\]\n?/, '').trim();
}

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

  return (
    <div className="space-y-2.5">
      {items.map(item => {
        const isAdminReply = item.response_type === 'admin_reply';
        const displayText  = stripBracketPrefix(item.response_text);
        const roleLabel    = ROLE_LABELS[item.responder_role] || item.responder_role;
        const typeLabel    = RESPONSE_TYPE_LABELS[item.response_type] || item.response_type;
        return (
          <div key={item.id} className="flex flex-col gap-0.5">
            {/* Sender line */}
            <div className={`flex items-center gap-1.5 ${isAdminReply ? '' : 'flex-row-reverse'}`}>
              <span className="text-[10px] font-semibold text-slate-500">
                {item.responder_name || (isAdminReply ? 'Admin' : 'You')}
              </span>
              {roleLabel && (
                <span className="text-[10px] text-slate-400">· {roleLabel}</span>
              )}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeBadgeCls(item.response_type)}`}>
                {typeLabel}
              </span>
              <span className="text-[10px] text-slate-300">·</span>
              <span className="text-[10px] text-slate-400">
                {new Date(item.created_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </div>
            {/* Bubble */}
            <div className={isAdminReply ? 'mr-8' : 'ml-8'}>
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                isAdminReply
                  ? 'bg-blue-600 text-white rounded-tl-sm'
                  : 'bg-slate-100 text-slate-800 rounded-tr-sm'
              }`}>
                {displayText ? (
                  <p className="whitespace-pre-wrap">{displayText}</p>
                ) : (
                  <p className="italic opacity-60">{typeLabel}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  task: TaskForResponse;
  projectName: string;
  userId: string;
  userRole: string;
  onClose: () => void;
  onSubmitted: (taskId: string, newStatus: string) => void;
}

export default function SubTaskResponseModal({
  task, projectName, userId, userRole, onClose, onSubmitted,
}: Props) {
  const [selected, setSelected] = useState<ActionId | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [text, setText] = useState('');
  const [duWorkDone, setDuWorkDone]   = useState('');
  const [duBlockers, setDuBlockers]   = useState('');
  const [duMaterials, setDuMaterials] = useState('');
  const [duTomorrow, setDuTomorrow]   = useState('');

  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [convLoading, setConvLoading] = useState(true);

  const action = selected ? ACTIONS.find(a => a.id === selected)! : null;

  const visibleActions = FULL_ACTION_TYPES.has(task.task_type)
    ? ACTIONS
    : ACTIONS.filter(a => a.id !== 'material-list' && a.id !== 'quote');

  const dueLabel = task.planned_finish_date
    ? new Date(task.planned_finish_date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
      })
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
      responder_name: nameMap[r.responder_user_id] || '',
      responder_role: r.responder_role || '',
      created_at:     r.created_at,
    })));
    setConvLoading(false);
  }

  function reset() {
    setSelected(null);
    setText('');
    setSubmitError('');
    setDuWorkDone(''); setDuBlockers(''); setDuMaterials(''); setDuTomorrow('');
  }

  function canSubmit(): boolean {
    if (!action) return false;
    if (action.id === 'accept') return true;
    if (action.id === 'daily-update') return duWorkDone.trim().length > 0;
    return text.trim().length > 0;
  }

  function buildResponseText(): string {
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

  async function handleSubmit() {
    if (!action || !canSubmit()) return;
    setSaving(true);
    setSubmitError('');

    const responseText = buildResponseText();
    const responseType = ACTION_TO_RESPONSE_TYPE[action.id];
    const newStatus    = action.statusAfter;

    try {
      // Step 1 — save response (critical; surface error if it fails)
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

      // Step 2 — update task status (best-effort)
      if (!['Completed', 'Closed'].includes(task.status)) {
        await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
      }

      // Step 3 — daily update record (best-effort, fire and forget)
      if (action.id === 'daily-update') {
        // Also saved to daily_updates for the Daily Updates page
        supabase.from('daily_updates').insert({
          project_id:            task.project_id,
          task_id:               task.id,
          user_id:               userId,
          update_date:           new Date().toISOString().split('T')[0],
          work_completed_today:  duWorkDone.trim(),
          work_planned_tomorrow: duTomorrow.trim(),
          current_status:        'In Progress',
          blockers:              duBlockers.trim(),
          materials_pending:     duMaterials.trim(),
          delay_reason: '', delay_days: 0,
          materials_delivered: '', permit_update: '',
          inspection_update: '', weather_issue: '',
          client_decision_needed: '', internal_note: '',
          client_visible_note: '',
        }).then(() => {});
      }

      // Step 4 — notify admin/GC (fire and forget — never block UI on this)
      supabase.from('project_members_safe')
        .select('user_id, role')
        .eq('project_id', task.project_id)
        .then(({ data: members }) => {
          const admins = (members || []).filter((m: any) =>
            ['DECKARC_ADMIN', 'CONVAZANT_SUPER_ADMIN', 'GENERAL_CONTRACTOR'].includes(m.role)
          );
          if (admins.length > 0) {
            supabase.from('notifications').insert(
              admins.map((a: any) => ({
                project_id:        task.project_id,
                user_id:           a.user_id,
                notification_type: 'task_response_submitted',
                title:             `${action.label}: ${task.task_name}`,
                message:           `"${action.label}" submitted for "${task.task_name}" on ${projectName}.`,
                status:            'unread',
              }))
            );
          }
        });

      // Step 5 — show success, refresh conversation, notify parent
      await loadConversation();
      setSaving(false);
      setSubmitted(true);
      onSubmitted(task.id, newStatus);

    } catch (err) {
      console.error('SubTaskResponseModal submit error', err);
      setSubmitError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[96dvh] sm:max-h-[88vh] rounded-t-2xl overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          {selected && !submitted ? (
            <button
              onClick={reset}
              disabled={saving}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0"
              aria-label="Back"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {submitted ? 'Submitted' : selected ? action!.label : 'Respond to Request'}
            </p>
            <h2 className="text-sm font-bold text-slate-900 truncate leading-tight mt-0.5">
              {task.task_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">
          <div className="px-5 py-4 space-y-4">

            {/* ── Success screen ──────────────────────────────────────── */}
            {submitted && action && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                  action.id === 'accept'  ? 'bg-emerald-50' :
                  action.id === 'decline' ? 'bg-red-50'     : 'bg-slate-100'
                }`}>
                  <action.Icon className={`w-7 h-7 ${action.iconCls}`} />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {action.id === 'accept'       ? 'Request Accepted'        :
                   action.id === 'decline'       ? 'Response Sent'           :
                   action.id === 'daily-update'  ? 'Daily Update Submitted'  :
                   `${action.label} Submitted`}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  {action.id === 'accept'
                    ? 'Task is now In Progress. Admin has been notified.'
                    : action.id === 'question'
                    ? 'Your question was sent. Admin will reply in the task conversation.'
                    : action.id === 'daily-update'
                    ? 'Your update was saved. It also appears on the Daily Updates page.'
                    : 'Admin has been notified and will review your response.'}
                </p>
                <button
                  onClick={onClose}
                  className="mt-5 px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* ── Normal view ─────────────────────────────────────────── */}
            {!submitted && (
              <>
                {/* Task info card */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-slate-500">{projectName}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      task.status === 'Ready for Review' ? 'bg-sky-100 text-sky-700'  :
                      task.status === 'In Progress'      ? 'bg-blue-100 text-blue-700' :
                      task.status === 'Blocked'          ? 'bg-red-100 text-red-700'  :
                      'bg-slate-200 text-slate-600'
                    }`}>{task.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                      {task.task_type}
                    </span>
                    {dueLabel && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Due {dueLabel}
                      </span>
                    )}
                  </div>
                  {task.client_visible_notes?.trim() && (
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Request Details
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {task.client_visible_notes.trim()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Conversation trail */}
                {(convLoading || conversation.length > 0) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Conversation
                      </span>
                    </div>
                    {convLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                        <Loader className="w-3 h-3 animate-spin" /> Loading...
                      </div>
                    ) : (
                      <ConversationTrail items={conversation} />
                    )}
                  </div>
                )}

                {/* Error banner */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{submitError}</p>
                  </div>
                )}

                {/* ── Action selection grid ────────────────────────────── */}
                {!selected && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Select your response
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {visibleActions.map(a => {
                        const Icon = a.Icon;
                        return (
                          <button
                            key={a.id}
                            onClick={() => { setSubmitError(''); setSelected(a.id); }}
                            className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-sm active:scale-[0.98] ${a.cardCls}`}
                          >
                            <Icon className={`w-5 h-5 flex-shrink-0 ${a.iconCls}`} />
                            <div className="min-w-0">
                              <p className={`text-sm font-bold ${a.iconCls}`}>{a.label}</p>
                              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                                {a.shortDesc}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Accept form ─────────────────────────────────────── */}
                {selected === 'accept' && (
                  <div className="space-y-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Confirm Acceptance</p>
                        <p className="text-xs text-emerald-600 mt-1">
                          Task will be set to <strong>In Progress</strong> and admin notified.
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Note <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        autoFocus
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={2}
                        placeholder="Any notes about how you'll complete this..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* ── Decline / Question / Material List / Quote ───────── */}
                {selected && !['accept', 'daily-update'].includes(selected) && action && (
                  <div className="space-y-3">
                    {selected === 'decline' && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                          Admin will be notified and the task will return to Needs Review.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        {selected === 'decline'       ? 'Reason for declining'                         :
                         selected === 'question'      ? 'Your question'                                :
                         selected === 'material-list' ? 'Material list'                                :
                         'Quote details'
                        } <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        autoFocus
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={selected === 'material-list' ? 6 : 4}
                        placeholder={
                          selected === 'decline'       ? 'Explain why you are declining...'               :
                          selected === 'question'      ? 'What do you need clarified before proceeding?' :
                          selected === 'material-list' ? 'List materials, quantities, specifications...' :
                          'Total amount, line items, timeline, terms...'
                        }
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none leading-relaxed"
                      />
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Task status → <span className="font-semibold text-slate-600">{action.statusAfter}</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Daily Update ─────────────────────────────────────── */}
                {selected === 'daily-update' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Work completed today <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        autoFocus
                        value={duWorkDone}
                        onChange={e => setDuWorkDone(e.target.value)}
                        rows={3}
                        placeholder="Describe what was completed today..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Blockers / delays <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={duBlockers}
                        onChange={e => setDuBlockers(e.target.value)}
                        rows={2}
                        placeholder="Any issues blocking progress?"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Materials needed <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={duMaterials}
                        onChange={e => setDuMaterials(e.target.value)}
                        rows={2}
                        placeholder="Materials required before next visit..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        Tomorrow's plan <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        value={duTomorrow}
                        onChange={e => setDuTomorrow(e.target.value)}
                        rows={2}
                        placeholder="What's the plan for tomorrow?"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      This update will also appear on the Daily Updates page.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Footer — only shown when action selected and not yet submitted ── */}
        {selected && !submitted && (
          <div className="flex justify-between items-center gap-3 px-5 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
            <button
              onClick={reset}
              disabled={saving}
              className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !canSubmit()}
              className={`flex items-center gap-2 px-6 py-2.5 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 min-w-[140px] justify-center ${action!.btnCls}`}
            >
              {saving
                ? <><Loader className="w-4 h-4 animate-spin" /> Submitting...</>
                : <><Send className="w-4 h-4" /> Submit {action!.label}</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
