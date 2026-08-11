import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logActivity } from './ActivityLogTab';
import {
  CheckCircle, MessageSquare, Clock, AlertCircle, Info, X,
  ThumbsUp, ChevronDown, ChevronUp, Search, Reply,
} from 'lucide-react';

interface DelayReason {
  id: string;
  project_id: string;
  task_id: string | null;
  client_safe_reason: string;
  estimated_delay_days: number;
  client_response_required: boolean;
  client_response_status: string;
  auto_acknowledgement_enabled: boolean;
  auto_acknowledgement_paused: boolean;
  response_deadline: string | null;
  status: string;
  created_at: string;
  admin_reply: string;
  admin_replied_at: string | null;
  task_name?: string;
}

interface Task { id: string; task_name: string; }

const RESP_STATUS_DISPLAY: Record<string, { label: string; cls: string }> = {
  'Pending Response':              { label: 'Needs Your Review',       cls: 'bg-amber-100 text-amber-700' },
  'Acknowledged by Client':        { label: 'Acknowledged',            cls: 'bg-emerald-100 text-emerald-700' },
  'Question Submitted':            { label: 'Question Submitted',      cls: 'bg-blue-100 text-blue-700' },
  'Client Requested Review':       { label: 'Review Requested',        cls: 'bg-orange-100 text-orange-700' },
  'Admin Responded':               { label: 'DECKARC Replied',         cls: 'bg-steel-100 text-steel-700' },
  'Pending Client Acknowledgement':{ label: 'DECKARC Replied',         cls: 'bg-steel-100 text-steel-700' },
  'Auto-Acknowledged':             { label: 'Auto-Acknowledged',       cls: 'bg-slate-100 text-slate-500' },
  'Not Required':                  { label: 'No Action Needed',        cls: 'bg-slate-100 text-slate-500' },
  'Closed':                        { label: 'Closed',                  cls: 'bg-slate-100 text-slate-400' },
};

type ActionMode = 'none' | 'question' | 'review';

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtDeadline(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function ScheduleUpdatesSection({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  const [items,      setItems]      = useState<DelayReason[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [actionMode, setActionMode] = useState<Record<string, ActionMode>>({});
  const [text,       setText]       = useState<Record<string, string>>({});
  const [textError,  setTextError]  = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [delayRes, taskRes] = await Promise.all([
      supabase
        .from('project_delay_reasons')
        .select('*')
        .eq('project_id', projectId)
        .eq('client_visible', true)
        .eq('client_visibility_status', 'Visible to Client')
        .order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, task_name').eq('project_id', projectId),
    ]);
    const taskMap = new Map((taskRes.data || []).map((t: Task) => [t.id, t.task_name]));
    setItems((delayRes.data || []).map((d: DelayReason) => ({
      ...d,
      task_name: d.task_id ? taskMap.get(d.task_id) : undefined,
    })));
    setLoading(false);
  }

  function setMode(id: string, mode: ActionMode) {
    setActionMode(prev => ({ ...prev, [id]: mode }));
    setText(prev => ({ ...prev, [id]: '' }));
    setTextError(prev => ({ ...prev, [id]: '' }));
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function validateReview(id: string): boolean {
    const val = text[id]?.trim() || '';
    if (!val) {
      setTextError(prev => ({ ...prev, [id]: 'Please describe what you would like DECKARC to review.' }));
      return false;
    }
    if (val.length < 5) {
      setTextError(prev => ({ ...prev, [id]: 'Please provide at least 5 characters.' }));
      return false;
    }
    if (val.length > 300) {
      setTextError(prev => ({ ...prev, [id]: 'Please keep your message under 300 characters.' }));
      return false;
    }
    setTextError(prev => ({ ...prev, [id]: '' }));
    return true;
  }

  async function acknowledge(item: DelayReason) {
    if (!profile) return;
    setSubmitting(prev => ({ ...prev, [item.id]: true }));
    await supabase.from('project_delay_reasons').update({
      client_response_status: 'Acknowledged by Client',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: 'Client Acknowledged Schedule Update',
      module: 'Schedule', relatedRecordId: item.id,
      relatedRecordType: 'project_delay_reasons',
      notes: `Client acknowledged schedule update for${item.task_name ? ` ${item.task_name}` : ' project'}.`,
    });
    setSubmitting(prev => ({ ...prev, [item.id]: false }));
    load();
  }

  async function submitQuestion(item: DelayReason) {
    if (!profile || !text[item.id]?.trim()) return;
    setSubmitting(prev => ({ ...prev, [item.id]: true }));
    await supabase.from('project_delay_reasons').update({
      client_response_status: 'Question Submitted',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: 'Client Question Submitted',
      module: 'Schedule', relatedRecordId: item.id,
      relatedRecordType: 'project_delay_reasons',
      notes: text[item.id].trim(),
    });
    setSubmitting(prev => ({ ...prev, [item.id]: false }));
    setMode(item.id, 'none');
    load();
  }

  async function submitReviewRequest(item: DelayReason) {
    if (!profile) return;
    if (!validateReview(item.id)) return;
    const reason = text[item.id].trim();
    setSubmitting(prev => ({ ...prev, [item.id]: true }));

    // 1. Update delay record — pause auto-ack, set status
    await supabase.from('project_delay_reasons').update({
      client_response_status: 'Client Requested Review',
      status: 'Needs Admin Review',
      client_review_reason: reason,
      auto_acknowledgement_paused: true,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);

    // 2. Create Admin Action Board item
    await supabase.from('action_items').insert({
      action_title: 'Client Requested Schedule Update Review',
      action_description: `Client has requested a review of a schedule update for${item.task_name ? ` "${item.task_name}"` : ' a project phase'}. Reason: ${reason}`,
      project_id: item.project_id,
      assigned_role: 'DECKARC_ADMIN',
      priority: 'High',
      status: 'Open',
      client_visible: false,
      admin_approval_required: true,
      due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    });

    // 3. Create Communication Hub thread via communication_messages
    await supabase.from('communication_messages').insert({
      project_id: item.project_id,
      sender_user_id: profile.id,
      sender_role: profile.role,
      related_record_type: 'project_delay_reasons',
      related_record_id: item.id,
      message_type: 'Client Review Request',
      message_body: `Client requested review of schedule update${item.task_name ? ` for "${item.task_name}"` : ''}.\n\nReason: ${reason}`,
      visibility: 'Admin Only',
      priority_level: 'High',
      is_urgent: true,
      response_required: true,
      follow_up_required: true,
      response_due_by: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      follow_up_due_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    });

    // 4. Activity Log
    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: 'Client Requested Schedule Review',
      module: 'Schedule', relatedRecordId: item.id,
      relatedRecordType: 'project_delay_reasons',
      notes: reason,
    });

    setSubmitting(prev => ({ ...prev, [item.id]: false }));
    setMode(item.id, 'none');
    load();
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-slate-400 text-sm justify-center">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading schedule updates...
    </div>
  );

  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-slate-200">
      <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
        <CheckCircle className="w-6 h-6 text-emerald-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700">No schedule updates at this time</p>
      <p className="text-xs text-slate-400 mt-1">DECKARC will notify you here if anything changes.</p>
    </div>
  );

  const pendingResponse = items.filter(i => i.client_response_status === 'Pending Response');

  return (
    <div className="space-y-4">

      {pendingResponse.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {pendingResponse.length} schedule update{pendingResponse.length !== 1 ? 's need' : ' needs'} your review
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Please review each item below. Responding on time helps keep your project moving.
            </p>
          </div>
        </div>
      )}

      {items.map(item => {
        const respDisplay = RESP_STATUS_DISPLAY[item.client_response_status]
          || { label: item.client_response_status, cls: 'bg-slate-100 text-slate-500' };
        const needsAction      = item.client_response_required && item.client_response_status === 'Pending Response';
        const isAdminResponded = item.client_response_status === 'Admin Responded' || item.client_response_status === 'Pending Client Acknowledgement';
        const isSettled        = ['Acknowledged by Client', 'Auto-Acknowledged', 'Closed'].includes(item.client_response_status);
        const isReview         = item.client_response_status === 'Client Requested Review';
        const hasQuestion      = item.client_response_status === 'Question Submitted';
        const mode             = actionMode[item.id] || 'none';
        const isExpanded       = expanded[item.id] ?? (needsAction || isAdminResponded);

        return (
          <div
            key={item.id}
            className={`bg-white rounded-xl border transition-all ${
              isAdminResponded ? 'border-steel-300 shadow-sm shadow-steel-50/60' :
              needsAction ? 'border-amber-200 shadow-sm shadow-amber-50/60' :
              isReview    ? 'border-orange-200' :
              isSettled   ? 'border-slate-100'  : 'border-slate-200'
            }`}
          >
            {/* Top status bar */}
            {needsAction && (
              <div className="px-5 py-2 bg-amber-50 rounded-t-xl border-b border-amber-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">Action Requested</span>
                </div>
                {item.response_deadline && (
                  <span className="text-xs text-amber-600">
                    Respond by <span className="font-semibold">{fmtDeadline(item.response_deadline)}</span>
                  </span>
                )}
              </div>
            )}
            {isAdminResponded && (
              <div className="px-5 py-2 bg-steel-700 rounded-t-xl border-b border-steel-600 flex items-center gap-2">
                <Reply className="w-3 h-3 text-white flex-shrink-0" />
                <span className="text-xs font-semibold text-white">DECKARC Replied — Your Acknowledgement Needed</span>
              </div>
            )}
            {isReview && (
              <div className="px-5 py-2 bg-orange-50 rounded-t-xl border-b border-orange-100 flex items-center gap-2">
                <Search className="w-3 h-3 text-orange-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-orange-700">Review Requested — DECKARC Is Reviewing</span>
              </div>
            )}

            <div className="p-5">
              {/* Header row — collapsible */}
              <button
                className="w-full text-left flex items-start justify-between gap-4"
                onClick={() => toggleExpand(item.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-slate-400">{fmtDate(item.created_at.split('T')[0])}</span>
                    {item.task_name && (
                      <>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs font-medium text-slate-600">{item.task_name}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800">Schedule Update</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${respDisplay.cls}`}>
                    {respDisplay.label}
                  </span>
                  {isExpanded
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />}
                </div>
              </button>

              {/* Expandable body */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {item.client_safe_reason || 'A schedule adjustment is being reviewed for this phase of your project.'}
                  </p>

                  {item.estimated_delay_days > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-600">
                        Estimated impact:{' '}
                        <span className="font-semibold text-slate-800">
                          may add {item.estimated_delay_days} day{item.estimated_delay_days !== 1 ? 's' : ''}
                        </span>{' '}
                        to the schedule
                      </span>
                    </div>
                  )}

                  {/* Auto-ack notice — only if not paused */}
                  {needsAction && item.auto_acknowledgement_enabled && !item.auto_acknowledgement_paused && item.response_deadline && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700">
                      Please review this schedule update within 72 hours. If we do not receive a response by{' '}
                      <span className="font-semibold">{fmtDeadline(item.response_deadline)}</span>, this
                      update may be treated as acknowledged so DECKARC can continue coordinating your project.
                    </div>
                  )}

                  {/* Question text area */}
                  {mode === 'question' && (
                    <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-700">Your Question</p>
                        <button onClick={() => setMode(item.id, 'none')}>
                          <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                        </button>
                      </div>
                      <textarea
                        value={text[item.id] || ''}
                        onChange={e => setText(prev => ({ ...prev, [item.id]: e.target.value }))}
                        rows={3}
                        placeholder="What would you like to know about this schedule update?"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none mb-2"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setMode(item.id, 'none')}
                          className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={() => submitQuestion(item)}
                          disabled={!text[item.id]?.trim() || submitting[item.id]}
                          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {submitting[item.id] ? 'Submitting...' : 'Submit Question'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Review request text area */}
                  {mode === 'review' && (
                    <div className="border border-orange-200 bg-orange-50/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-slate-700">Request Review of Schedule Update</p>
                        <button onClick={() => setMode(item.id, 'none')}>
                          <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                        Please tell us what you would like DECKARC to review regarding this schedule update.
                        DECKARC will review your response before any final schedule action is taken.
                      </p>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Reason for Review <span className="text-orange-600">*</span>
                      </label>
                      <textarea
                        value={text[item.id] || ''}
                        onChange={e => {
                          setText(prev => ({ ...prev, [item.id]: e.target.value }));
                          if (textError[item.id]) setTextError(prev => ({ ...prev, [item.id]: '' }));
                        }}
                        rows={3}
                        maxLength={300}
                        placeholder="Example: I would like clarification on this schedule impact because…"
                        className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 text-slate-900 placeholder-slate-400 resize-none mb-1 ${
                          textError[item.id] ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-slate-200'
                        }`}
                      />
                      <div className="flex items-center justify-between mb-2">
                        {textError[item.id]
                          ? <p className="text-xs text-red-600">{textError[item.id]}</p>
                          : <span />}
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {(text[item.id] || '').length}/300
                        </span>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setMode(item.id, 'none')}
                          className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={() => submitReviewRequest(item)}
                          disabled={submitting[item.id]}
                          className="text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {submitting[item.id] ? 'Submitting...' : 'Submit Review Request'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Primary action buttons */}
                  {needsAction && mode === 'none' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        onClick={() => acknowledge(item)}
                        disabled={submitting[item.id]}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Acknowledge Schedule Update
                      </button>
                      <button
                        onClick={() => setMode(item.id, 'question')}
                        className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 bg-white text-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ask a Question
                      </button>
                      <button
                        onClick={() => setMode(item.id, 'review')}
                        className="flex items-center gap-1.5 text-xs font-semibold border border-orange-200 bg-orange-50 text-orange-700 px-4 py-2.5 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        <Search className="w-3.5 h-3.5" />
                        Request Review
                      </button>
                    </div>
                  )}

                  {/* Admin reply + acknowledge */}
                  {isAdminResponded && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-steel-200 bg-steel-50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-5 h-5 rounded-full bg-steel-700 flex items-center justify-center flex-shrink-0">
                            <Reply className="w-2.5 h-2.5 text-white" />
                          </div>
                          <p className="text-xs font-semibold text-steel-800">DECKARC's Response</p>
                          {item.admin_replied_at && (
                            <span className="text-[10px] text-steel-500 ml-auto">
                              {new Date(item.admin_replied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {item.admin_reply || 'Your review request has been addressed by DECKARC.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => acknowledge(item)}
                          disabled={submitting[item.id]}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-steel-800 text-white px-4 py-2.5 rounded-lg hover:bg-steel-900 disabled:opacity-50 transition-colors"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          {submitting[item.id] ? 'Confirming...' : 'Acknowledge Reply'}
                        </button>
                        <p className="text-xs text-slate-400">Confirms you have read DECKARC's response.</p>
                      </div>
                    </div>
                  )}

                  {/* Status confirmations */}
                  {isSettled && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 pt-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>
                        {item.client_response_status === 'Auto-Acknowledged'
                          ? 'This update was automatically acknowledged after the response window closed.'
                          : "You've acknowledged this update. DECKARC is coordinating next steps."}
                      </span>
                    </div>
                  )}

                  {hasQuestion && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 pt-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Your question has been submitted. DECKARC will respond shortly.</span>
                    </div>
                  )}

                  {isReview && (
                    <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <Search className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-orange-800">Review request submitted</p>
                        <p className="text-xs text-orange-700 mt-0.5">
                          Your request has been received. DECKARC is reviewing and will respond
                          before any final schedule action is taken. Auto-acknowledgement has been paused.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
