import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';
import { logActivity } from './ActivityLogTab';
import { cascadeDelayFromTask } from '../../lib/scheduleEngine';
import {
  AlertTriangle, Plus, Edit2, CheckCircle, Clock, Eye, EyeOff,
  FileText, MessageSquare, Calendar, ArrowRight, Info,
  Shield, AlertCircle, GitBranch, XCircle, ChevronDown, ChevronUp, Reply, Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DelayReason {
  id: string;
  organization_id: string | null;
  project_id: string;
  task_id: string | null;
  related_record_type: string;
  related_record_id: string | null;
  delay_category: string;
  internal_reason: string;
  client_safe_reason: string;
  estimated_delay_days: number;
  approved_delay_days: number;
  schedule_impact_possible: boolean;
  schedule_impact_status: string;
  original_projected_completion: string | null;
  revised_projected_completion: string | null;
  owner_user_id: string | null;
  responsible_role: string;
  client_visible: boolean;
  client_visibility_status: string;
  client_response_required: boolean;
  client_response_status: string;
  auto_acknowledgement_enabled: boolean;
  response_deadline: string | null;
  status: string;
  next_action: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  admin_reply: string;
  admin_replied_at: string | null;
  admin_replied_by: string | null;
  client_review_reason: string;
  task_name?: string;
}

interface ScheduleChangeRequest {
  id: string;
  project_id: string;
  requested_by_user_id: string;
  requested_by_name: string;
  requested_by_role: string;
  affected_task_id: string | null;
  change_type: string;
  delay_days: number;
  reason: string;
  status: string;
  admin_notes: string | null;
  approved_delay_days: number | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Task { id: string; task_name: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const DELAY_CATEGORIES = [
  'Weather', 'Permit Pending', 'Inspection Pending',
  'Inspection Failed / Correction Required', 'Material Delay',
  'Client Decision Pending', 'Client No-Access / Vacation', 'Payment Hold',
  'Change Order Impact', 'Design / Plan Clarification', 'Site Condition',
  'Crew Scheduling', 'Subcontractor Delay', 'Supplier Delay',
  'Safety / Incident', 'Admin Hold', 'Other',
];

const SCHEDULE_IMPACT_STATUSES = [
  'No Impact', 'Possible Impact', 'Pending Admin Review',
  'Approved', 'Rejected', 'Recalculated', 'Resolved',
];

const CLIENT_VISIBILITY_STATUSES = [
  'Internal Only', 'Draft', 'Pending Admin Approval',
  'Approved for Client', 'Visible to Client',
];

const DELAY_STATUSES = [
  'Open', 'Under Review', 'Waiting on Client', 'Needs Admin Review',
  'Schedule Impact Approved', 'Client Acknowledged', 'Client Question Submitted',
  'Auto-Acknowledged', 'Resolved', 'Closed',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Weather':                                  'bg-blue-100 text-blue-700',
  'Permit Pending':                           'bg-amber-100 text-amber-700',
  'Inspection Pending':                       'bg-amber-100 text-amber-700',
  'Inspection Failed / Correction Required':  'bg-red-100 text-red-700',
  'Material Delay':                           'bg-orange-100 text-orange-700',
  'Client Decision Pending':                  'bg-yellow-100 text-yellow-700',
  'Client No-Access / Vacation':              'bg-yellow-100 text-yellow-700',
  'Payment Hold':                             'bg-red-100 text-red-700',
  'Change Order Impact':                      'bg-slate-100 text-slate-700',
  'Design / Plan Clarification':              'bg-teal-100 text-teal-700',
  'Site Condition':                           'bg-stone-100 text-stone-700',
  'Crew Scheduling':                          'bg-slate-100 text-slate-600',
  'Subcontractor Delay':                      'bg-orange-100 text-orange-600',
  'Supplier Delay':                           'bg-orange-100 text-orange-600',
  'Safety / Incident':                        'bg-red-100 text-red-700',
  'Admin Hold':                               'bg-slate-100 text-slate-600',
  'Other':                                    'bg-slate-100 text-slate-500',
};

const STATUS_COLORS: Record<string, string> = {
  'Open':                      'bg-red-100 text-red-700',
  'Under Review':               'bg-amber-100 text-amber-700',
  'Waiting on Client':          'bg-yellow-100 text-yellow-700',
  'Needs Admin Review':         'bg-orange-100 text-orange-700',
  'Schedule Impact Approved':   'bg-emerald-100 text-emerald-700',
  'Client Acknowledged':        'bg-emerald-100 text-emerald-700',
  'Client Question Submitted':  'bg-orange-100 text-orange-700',
  'Auto-Acknowledged':          'bg-slate-100 text-slate-600',
  'Resolved':                   'bg-emerald-100 text-emerald-700',
  'Closed':                     'bg-slate-100 text-slate-500',
};

const CLIENT_RESP_COLORS: Record<string, string> = {
  'Not Required':              'bg-slate-100 text-slate-500',
  'Pending Response':          'bg-amber-100 text-amber-700',
  'Acknowledged by Client':    'bg-emerald-100 text-emerald-700',
  'Question Submitted':        'bg-orange-100 text-orange-700',
  'Client Requested Review':   'bg-orange-100 text-orange-700',
  'Admin Responded':           'bg-slate-100 text-slate-700',
  'Auto-Acknowledged':         'bg-slate-100 text-slate-600',
  'Closed':                    'bg-slate-100 text-slate-500',
};

const CATEGORY_SHORT: Record<string, string> = {
  'Inspection Failed / Correction Required': 'Insp. Failed',
  'Client No-Access / Vacation':             'No Access',
  'Design / Plan Clarification':             'Design Clarif.',
  'Change Order Impact':                     'Change Order',
  'Client Decision Pending':                 'Client Decision',
  'Subcontractor Delay':                     'Subcontractor',
  'Safety / Incident':                       'Safety',
};

const SCHEDULE_STATUS_SHORT: Record<string, string> = {
  'Pending Admin Review': 'Pending Review',
};

const SCR_STATUS_COLORS: Record<string, string> = {
  'Pending':              'bg-amber-100 text-amber-700',
  'Approved':             'bg-emerald-100 text-emerald-700',
  'Rejected':             'bg-red-100 text-red-700',
  'Clarification Needed': 'bg-slate-100 text-slate-700',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTs(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_FORM = {
  task_id: '',
  delay_category: 'Other',
  internal_reason: '',
  client_safe_reason: '',
  estimated_delay_days: 0,
  schedule_impact_possible: false,
  original_projected_completion: '',
  revised_projected_completion: '',
  responsible_role: '',
  client_visible: false,
  client_visibility_status: 'Internal Only',
  client_response_required: false,
  auto_acknowledgement_enabled: false,
  response_deadline: '',
  status: 'Open',
  next_action: '',
};

type FormState = typeof EMPTY_FORM;

// ─── Component ────────────────────────────────────────────────────────────────

export default function DelayReasonsTab({
  projectId,
  effectiveRole,
}: {
  projectId: string;
  effectiveRole: string;
}) {
  const { profile } = useAuth();
  const isAdmin = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN'].includes(effectiveRole);
  const isGC    = effectiveRole === 'GENERAL_CONTRACTOR';
  const isSub   = effectiveRole === 'SUBCONTRACTOR';
  const canEdit = isAdmin || isGC;

  const [delays,       setDelays]       = useState<DelayReason[]>([]);
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [approvals,    setApprovals]    = useState<ScheduleChangeRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<DelayReason | null>(null);
  const [detailTarget, setDetailTarget] = useState<DelayReason | null>(null);
  const [form,         setForm]         = useState<FormState>(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalsOpen, setApprovalsOpen] = useState(true);

  // GC update modal
  const [gcUpdateTarget, setGcUpdateTarget] = useState<DelayReason | null>(null);
  const [gcUpdateType, setGcUpdateType] = useState<'update' | 'blocker' | 'correction'>('update');
  const [gcUpdateText, setGcUpdateText] = useState('');
  const [gcSaving,     setGcSaving]     = useState(false);

  // Schedule change request review modal
  const [reviewItem,    setReviewItem]    = useState<ScheduleChangeRequest | null>(null);
  const [adminNotes,    setAdminNotes]    = useState('');
  const [approvedDays,  setApprovedDays]  = useState(0);
  const [reviewing,     setReviewing]     = useState(false);

  // Submit new SCR modal (non-admin users)
  const [showScrForm,   setShowScrForm]   = useState(false);
  const [scrForm,       setScrForm]       = useState({ affected_task_id: '', change_type: 'Task Delay', delay_days: 1, reason: '' });
  const [scrSaving,     setScrSaving]     = useState(false);

  // Admin reply to client review request (inside detail drawer)
  const [replyText,         setReplyText]         = useState('');
  const [replyClientReason, setReplyClientReason] = useState('');
  const [replyDelayDays,    setReplyDelayDays]     = useState<number | ''>('');
  const [replyStatus,       setReplyStatus]        = useState<'Waiting on Client Again' | 'Resolved' | 'Closed'>('Waiting on Client Again');
  const [replySaving,       setReplySaving]        = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [delayRes, taskRes, scrRes] = await Promise.all([
      supabase.from('project_delay_reasons').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, task_name').eq('project_id', projectId),
      supabase.from('schedule_change_requests').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    const taskList: Task[] = taskRes.data || [];
    const taskMap = new Map(taskList.map(t => [t.id, t.task_name]));
    const rows = (delayRes.data || []).map((d: DelayReason) => ({
      ...d,
      task_name: d.task_id ? (taskMap.get(d.task_id) || 'Unknown Task') : undefined,
    }));
    setDelays(rows);
    setTasks(taskList);
    setApprovals(scrRes.data || []);
    setLoading(false);
  }

  // ─── Delay CRUD ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(d: DelayReason) {
    setEditTarget(d);
    setForm({
      task_id:                        d.task_id || '',
      delay_category:                 d.delay_category,
      internal_reason:                d.internal_reason,
      client_safe_reason:             d.client_safe_reason,
      estimated_delay_days:           d.estimated_delay_days,
      schedule_impact_possible:       d.schedule_impact_possible,
      original_projected_completion:  d.original_projected_completion || '',
      revised_projected_completion:   d.revised_projected_completion || '',
      responsible_role:               d.responsible_role,
      client_visible:                 d.client_visible,
      client_visibility_status:       d.client_visibility_status,
      client_response_required:       d.client_response_required,
      auto_acknowledgement_enabled:   d.auto_acknowledgement_enabled,
      response_deadline:              d.response_deadline ? d.response_deadline.split('T')[0] : '',
      status:                         d.status,
      next_action:                    d.next_action,
    });
    setShowForm(true);
    setDetailTarget(null);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    const payload = {
      project_id:                    projectId,
      organization_id:               profile.organization_id,
      task_id:                       form.task_id || null,
      delay_category:                form.delay_category,
      internal_reason:               form.internal_reason,
      client_safe_reason:            form.client_safe_reason,
      estimated_delay_days:          form.estimated_delay_days,
      schedule_impact_possible:      form.schedule_impact_possible,
      original_projected_completion: form.original_projected_completion || null,
      revised_projected_completion:  form.revised_projected_completion || null,
      responsible_role:              form.responsible_role,
      client_visible:                form.client_visible,
      client_visibility_status:      form.client_visibility_status,
      client_response_required:      form.client_response_required,
      auto_acknowledgement_enabled:  form.auto_acknowledgement_enabled,
      response_deadline:             form.response_deadline || null,
      status:                        form.status,
      next_action:                   form.next_action,
      updated_by:                    profile.id,
      updated_at:                    new Date().toISOString(),
    };

    if (editTarget) {
      await supabase.from('project_delay_reasons').update(payload).eq('id', editTarget.id);
      await logActivity({
        projectId, userId: profile.id, userFullName: profile.full_name,
        userRole: profile.role, actionType: 'Delay Reason Updated',
        module: 'Schedule', relatedRecordId: editTarget.id,
        relatedRecordType: 'project_delay_reasons',
        notes: `Category: ${form.delay_category}, Status: ${form.status}`,
      });
    } else {
      const { data: inserted } = await supabase
        .from('project_delay_reasons')
        .insert({ ...payload, created_by: profile.id })
        .select()
        .maybeSingle();
      await logActivity({
        projectId, userId: profile.id, userFullName: profile.full_name,
        userRole: profile.role, actionType: 'Delay Reason Added',
        module: 'Schedule', relatedRecordId: inserted?.id,
        relatedRecordType: 'project_delay_reasons',
        notes: `Category: ${form.delay_category}`,
      });
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function markResolved(d: DelayReason) {
    if (!profile) return;
    await supabase.from('project_delay_reasons').update({
      status: 'Resolved',
      resolved_at: new Date().toISOString(),
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }).eq('id', d.id);
    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: 'Delay Reason Resolved',
      module: 'Schedule', relatedRecordId: d.id,
      relatedRecordType: 'project_delay_reasons',
      notes: `Resolved: ${d.delay_category}`,
    });
    load();
  }

  async function approveClientVisibility(d: DelayReason) {
    if (!profile || !isAdmin) return;
    await supabase.from('project_delay_reasons').update({
      client_visibility_status: 'Visible to Client',
      client_visible: true,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }).eq('id', d.id);
    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: 'Client Delay Notice Approved',
      module: 'Schedule', relatedRecordId: d.id,
      relatedRecordType: 'project_delay_reasons',
    });
    setDetailTarget(null);
    load();
  }

  async function submitAdminReply(d: DelayReason) {
    if (!profile || !replyText.trim()) return;
    setReplySaving(true);

    const newClientResponseStatus =
      replyStatus === 'Waiting on Client Again' ? 'Admin Responded' :
      replyStatus === 'Resolved' ? 'Closed' : 'Closed';

    const updatePayload: Record<string, unknown> = {
      admin_reply: replyText.trim(),
      admin_replied_at: new Date().toISOString(),
      admin_replied_by: profile.id,
      client_response_status: newClientResponseStatus,
      status: replyStatus === 'Waiting on Client Again' ? 'Waiting on Client' : replyStatus,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    if (replyClientReason.trim()) {
      updatePayload.client_safe_reason = replyClientReason.trim();
    }
    if (replyDelayDays !== '' && !isNaN(Number(replyDelayDays))) {
      updatePayload.estimated_delay_days = Number(replyDelayDays);
    }

    await supabase.from('project_delay_reasons').update(updatePayload).eq('id', d.id);

    // Notification in communication_messages so client portal surfaces it
    await supabase.from('communication_messages').insert({
      project_id: d.project_id,
      sender_user_id: profile.id,
      sender_role: profile.role,
      related_record_type: 'project_delay_reasons',
      related_record_id: d.id,
      message_type: 'Admin Reply',
      message_body: replyText.trim(),
      visibility: 'Client Visible',
      status: 'Open',
    });

    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: 'Admin Replied to Client Review Request',
      module: 'Schedule', relatedRecordId: d.id,
      relatedRecordType: 'project_delay_reasons',
      notes: `Status set to: ${replyStatus}. Reply: ${replyText.trim().substring(0, 120)}`,
    });

    setReplySaving(false);
    setReplyText('');
    setReplyClientReason('');
    setReplyDelayDays('');
    setReplyStatus('Waiting on Client Again');
    setDetailTarget(null);
    load();
  }

  async function submitGcUpdate() {
    if (!profile || !gcUpdateTarget || !gcUpdateText.trim()) return;
    setGcSaving(true);
    const actionTypeMap = {
      update:     'GC Added Internal Update',
      blocker:    'GC Reported Blocker',
      correction: 'GC Added Correction Note',
    };
    const newStatus = gcUpdateType === 'blocker' ? 'Under Review' : gcUpdateTarget.status;
    await supabase.from('project_delay_reasons').update({
      status: newStatus,
      next_action: gcUpdateType === 'blocker'
        ? `Blocker reported: ${gcUpdateText.trim()}`
        : gcUpdateTarget.next_action,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }).eq('id', gcUpdateTarget.id);
    await logActivity({
      projectId, userId: profile.id, userFullName: profile.full_name,
      userRole: profile.role, actionType: actionTypeMap[gcUpdateType],
      module: 'Schedule', relatedRecordId: gcUpdateTarget.id,
      relatedRecordType: 'project_delay_reasons',
      notes: gcUpdateText.trim(),
    });
    setGcSaving(false);
    setGcUpdateTarget(null);
    setGcUpdateText('');
    load();
  }

  // ─── Schedule Change Request actions ───────────────────────────────────────

  async function submitScrRequest() {
    if (!profile || !scrForm.reason.trim()) return;
    setScrSaving(true);
    await supabase.from('schedule_change_requests').insert({
      project_id: projectId,
      requested_by_user_id: profile.id,
      requested_by_name: profile.full_name,
      requested_by_role: profile.role,
      affected_task_id: scrForm.affected_task_id || null,
      change_type: scrForm.change_type,
      delay_days: scrForm.delay_days,
      reason: scrForm.reason,
      status: 'Pending',
    });
    setScrSaving(false);
    setShowScrForm(false);
    setScrForm({ affected_task_id: '', change_type: 'Task Delay', delay_days: 1, reason: '' });
    load();
  }

  async function reviewScrAction(action: 'Approved' | 'Rejected' | 'Clarification Needed') {
    if (!reviewItem || !profile) return;
    if (action === 'Clarification Needed' && !adminNotes.trim()) {
      alert('Please provide admin notes explaining what clarification is needed.');
      return;
    }
    setReviewing(true);
    const finalDays = action === 'Approved' ? (approvedDays || reviewItem.delay_days) : reviewItem.delay_days;
    await supabase.from('schedule_change_requests').update({
      status: action,
      reviewed_by_user_id: profile.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes,
      approved_delay_days: action === 'Approved' ? finalDays : null,
    }).eq('id', reviewItem.id);

    if (action === 'Approved' && reviewItem.affected_task_id) {
      await cascadeDelayFromTask(
        projectId,
        reviewItem.affected_task_id,
        finalDays,
        reviewItem.change_type,
        reviewItem.reason,
        reviewItem.requested_by_name,
        profile.full_name,
        profile.role
      );
    }

    await supabase.from('activity_log').insert({
      project_id: projectId,
      user_id: profile.id,
      user_full_name: profile.full_name,
      user_role: profile.role,
      action_type: `Schedule Change Request ${action}`,
      module: 'Schedule',
      related_record_id: reviewItem.id,
      related_record_type: 'schedule_change_request',
      old_value: 'Pending',
      new_value: action,
      notes: adminNotes || reviewItem.reason,
    });

    setReviewing(false);
    setReviewItem(null);
    load();
  }

  function openReview(req: ScheduleChangeRequest) {
    setReviewItem(req);
    setAdminNotes(req.admin_notes || '');
    setApprovedDays(req.approved_delay_days || req.delay_days);
  }

  const taskName = (id: string | null) =>
    id ? (tasks.find(t => t.id === id)?.task_name || 'Unknown Task') : 'Project Level';

  // ─── Derived data ──────────────────────────────────────────────────────────

  const displayed = statusFilter ? delays.filter(d => d.status === statusFilter) : delays;
  const visibleDelays = isSub
    ? displayed.filter(d => d.task_id && tasks.some(t => t.id === d.task_id))
    : displayed;

  const openCount         = delays.filter(d => !['Resolved', 'Closed'].includes(d.status)).length;
  const pendingClient     = delays.filter(d => d.client_response_status === 'Pending Response').length;
  const recentlyAcked     = delays.filter(d => d.client_response_status === 'Acknowledged by Client');
  const awaitingClientAck = delays.filter(d => d.client_response_status === 'Admin Responded');
  const pendingApprovals  = approvals.filter(r => r.status === 'Pending');
  const allApprovals      = approvals;

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 gap-3 text-sm">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading schedule data...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {isSub ? 'Task Blockers' : 'Schedule Impacts'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isSub
              ? 'Schedule impacts that may be affecting your assigned tasks.'
              : 'Track schedule impacts, pending approvals, and client update status.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isAdmin && !isSub && (
            <button
              onClick={() => setShowScrForm(true)}
              className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 bg-white text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5" /> Request Schedule Change
            </button>
          )}
          {canEdit && (
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Schedule Impact
            </button>
          )}
        </div>
      </div>

      {/* ── Pending Approvals section (admin only) ────────────────────────── */}
      {isAdmin && allApprovals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
            onClick={() => setApprovalsOpen(v => !v)}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${pendingApprovals.length > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
                <GitBranch className={`w-3.5 h-3.5 ${pendingApprovals.length > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-800">Pending Approvals</p>
                <p className="text-xs text-slate-400">
                  Schedule change requests submitted by field users
                </p>
              </div>
              {pendingApprovals.length > 0 && (
                <span className="ml-1 text-xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
                  {pendingApprovals.length}
                </span>
              )}
            </div>
            {approvalsOpen
              ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
          </button>

          {approvalsOpen && (
            <div className="divide-y divide-slate-50">
              {allApprovals.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">No schedule change requests yet.</div>
              ) : allApprovals.map(req => (
                <div key={req.id} className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SCR_STATUS_COLORS[req.status] || 'bg-slate-100 text-slate-500'}`}>
                        {req.status}
                      </span>
                      <span className="text-xs text-slate-500">{req.change_type}</span>
                      <span className="text-xs font-bold text-slate-700">+{req.delay_days}d</span>
                      {req.approved_delay_days && req.approved_delay_days !== req.delay_days && (
                        <span className="text-xs text-emerald-600 font-medium">(approved: +{req.approved_delay_days}d)</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800">{taskName(req.affected_task_id)}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{req.reason}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-400">
                      <span>By: {req.requested_by_name} ({req.requested_by_role.replace(/_/g, ' ')})</span>
                      <span>{new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    {req.admin_notes && (
                      <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                        Admin note: {req.admin_notes}
                      </p>
                    )}
                  </div>
                  {req.status === 'Pending' && (
                    <button
                      onClick={() => openReview(req)}
                      className="flex-shrink-0 text-xs font-semibold bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
                    >
                      Review
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GC: view pending approvals they submitted ─────────────────────── */}
      {isGC && approvals.filter(r => r.status === 'Pending').length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {approvals.filter(r => r.status === 'Pending').length} schedule change request{approvals.filter(r => r.status === 'Pending').length !== 1 ? 's' : ''} pending admin review
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Submitted requests are awaiting Admin approval before affecting projected dates.
            </p>
          </div>
        </div>
      )}

      {/* ── Status filter pills ───────────────────────────────────────────── */}
      {!isSub && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${statusFilter === '' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
          >
            All <span className="ml-1 opacity-70">{delays.length}</span>
          </button>
          {openCount > 0 && (
            <button
              onClick={() => setStatusFilter('Open')}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${statusFilter === 'Open' ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 hover:border-red-400'}`}
            >
              <AlertCircle className="w-3 h-3" /> Open <span className="font-bold">{openCount}</span>
            </button>
          )}
          {pendingClient > 0 && (
            <button
              onClick={() => setStatusFilter('Waiting on Client')}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${statusFilter === 'Waiting on Client' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'}`}
            >
              <Clock className="w-3 h-3" /> Awaiting Client <span className="font-bold">{pendingClient}</span>
            </button>
          )}
          {['Under Review', 'Schedule Impact Approved', 'Resolved'].map(s => {
            const cnt = delays.filter(d => d.status === s).length;
            if (cnt === 0) return null;
            return (
              <button key={s}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${statusFilter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
              >
                {s} <span className="ml-1 opacity-70">{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Status banners ────────────────────────────────────────────────── */}
      {recentlyAcked.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-800">
              {recentlyAcked.length === 1
                ? 'Client acknowledged a schedule update'
                : `Client acknowledged ${recentlyAcked.length} schedule updates`}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {recentlyAcked.map(d => d.task_name || d.delay_category).join(', ')} — you can now mark {recentlyAcked.length === 1 ? 'it' : 'them'} as Resolved or take next steps.
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {recentlyAcked.slice(0, 1).map(d => (
              <button
                key={d.id}
                onClick={() => setDetailTarget(d)}
                className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:border-emerald-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                View
              </button>
            ))}
          </div>
        </div>
      )}

      {awaitingClientAck.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-slate-100 border border-slate-200 rounded-xl">
          <Clock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Awaiting client acknowledgement</p>
            <p className="text-xs text-slate-500 mt-0.5">
              You replied to {awaitingClientAck.length} review request{awaitingClientAck.length !== 1 ? 's' : ''}. Waiting for the client to confirm they have read your response.
            </p>
          </div>
        </div>
      )}

      {/* ── Delay log ─────────────────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {isSub ? 'Task Blockers' : 'Schedule Impact Log'}
        </h4>

        {visibleDelays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {isSub ? 'No blockers on your tasks' : statusFilter ? 'No records match this filter' : 'No schedule impacts recorded'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {isSub ? 'Your assigned tasks are on track.' : 'All project items are currently on schedule.'}
            </p>
          </div>
        ) : isSub ? (
          /* Subcontractor simplified view */
          <div className="space-y-3">
            {visibleDelays.map(d => (
              <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[d.delay_category] || 'bg-slate-100 text-slate-600'}`}>{d.delay_category}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] || 'bg-slate-100 text-slate-500'}`}>{d.status}</span>
                    </div>
                    {d.task_name && <p className="text-xs text-slate-500 mb-1">Task: <span className="font-medium text-slate-700">{d.task_name}</span></p>}
                    <p className="text-sm text-slate-700">{d.next_action || 'Check with your supervisor for the next step.'}</p>
                    {d.estimated_delay_days > 0 && (
                      <p className="text-xs text-amber-600 mt-1.5 font-medium">May add {d.estimated_delay_days} day{d.estimated_delay_days !== 1 ? 's' : ''} to schedule</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Admin / GC table */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {[
                      'Date Reported', 'Phase / Task', 'Category', 'Reason',
                      'Est. Days', 'Schedule Status',
                      ...(isAdmin ? ['Client Visibility', 'Client Response'] : []),
                      'Next Action', 'Status', ''
                    ].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleDelays.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="text-xs text-slate-500">{fmtTs(d.created_at)}</span>
                      </td>
                      <td className="px-4 py-3.5 max-w-[160px]">
                        <span className="text-xs font-medium text-slate-700 truncate block">
                          {d.task_name || <span className="text-slate-400 italic">Project Level</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[d.delay_category] || 'bg-slate-100 text-slate-600'}`}
                          title={d.delay_category}
                        >
                          {CATEGORY_SHORT[d.delay_category] ?? d.delay_category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <p className="text-xs text-slate-600 line-clamp-2">{d.internal_reason || '—'}</p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-center">
                        <span className={`text-xs font-bold ${d.estimated_delay_days > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {d.estimated_delay_days > 0 ? `+${d.estimated_delay_days}d` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            d.schedule_impact_status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                            d.schedule_impact_status === 'Pending Admin Review' ? 'bg-amber-100 text-amber-700' :
                            d.schedule_impact_status === 'No Impact' ? 'bg-slate-100 text-slate-500' :
                            'bg-blue-100 text-blue-700'
                          }`}
                          title={d.schedule_impact_status}
                        >
                          {SCHEDULE_STATUS_SHORT[d.schedule_impact_status] ?? d.schedule_impact_status}
                        </span>
                      </td>
                      {isAdmin && (
                        <>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {d.client_visible
                                ? <Eye className="w-3 h-3 text-emerald-500" />
                                : <EyeOff className="w-3 h-3 text-slate-300" />}
                              <span className="text-xs text-slate-500">{d.client_visibility_status}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CLIENT_RESP_COLORS[d.client_response_status] || 'bg-slate-100 text-slate-500'}`}>
                              {d.client_response_status}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3.5 max-w-[160px]">
                        <span className="text-xs text-slate-500 line-clamp-2">{d.next_action || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] || 'bg-slate-100 text-slate-500'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setDetailTarget(d)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                            title="View Details"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => openEdit(d)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isGC && !['Resolved', 'Closed'].includes(d.status) && (
                            <>
                              <button
                                onClick={() => { setGcUpdateTarget(d); setGcUpdateType('update'); setGcUpdateText(''); }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Add Internal Update"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setGcUpdateTarget(d); setGcUpdateType('blocker'); setGcUpdateText(''); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                title="Report Blocker"
                              >
                                <AlertCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {isAdmin && !['Resolved', 'Closed'].includes(d.status) && (
                            <button
                              onClick={() => markResolved(d)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Mark Resolved"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-400">
                {visibleDelays.length} record{visibleDelays.length !== 1 ? 's' : ''}
                {statusFilter && <span className="ml-2 font-medium text-slate-600">· Filtered: {statusFilter}</span>}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── GC Update Modal ───────────────────────────────────────────────── */}
      {gcUpdateTarget && (
        <Modal
          title={
            gcUpdateType === 'blocker'    ? 'Report Blocker' :
            gcUpdateType === 'correction' ? 'Add Correction Note' :
            'Add Internal Update'
          }
          onClose={() => setGcUpdateTarget(null)}
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500">Delay:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[gcUpdateTarget.delay_category] || 'bg-slate-100 text-slate-600'}`}>
                {gcUpdateTarget.delay_category}
              </span>
              {gcUpdateTarget.task_name && (
                <span className="text-xs text-slate-600 ml-1">— {gcUpdateTarget.task_name}</span>
              )}
            </div>

            {gcUpdateType === 'blocker' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">
                  Reporting a blocker will notify Admin and update the delay status to "Under Review".
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {gcUpdateType === 'blocker' ? 'Describe the Blocker' :
                 gcUpdateType === 'correction' ? 'Correction Details' : 'Update Notes'}
              </label>
              <textarea
                value={gcUpdateText}
                onChange={e => setGcUpdateText(e.target.value)}
                rows={4}
                placeholder={
                  gcUpdateType === 'blocker' ? 'What is blocking progress?' :
                  gcUpdateType === 'correction' ? 'Describe the correction made...' :
                  'Provide an operational update on this delay item...'
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setGcUpdateTarget(null)} className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button
                onClick={submitGcUpdate}
                disabled={!gcUpdateText.trim() || gcSaving}
                className={`text-sm font-semibold text-white px-5 py-2 rounded-lg disabled:opacity-50 transition-colors ${
                  gcUpdateType === 'blocker' ? 'bg-red-600 hover:bg-red-700' :
                  gcUpdateType === 'correction' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-slate-900 hover:bg-slate-700'
                }`}
              >
                {gcSaving ? 'Submitting...' :
                 gcUpdateType === 'blocker' ? 'Report Blocker' :
                 gcUpdateType === 'correction' ? 'Save Correction Note' :
                 'Submit Update'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Admin Review SCR Modal ────────────────────────────────────────── */}
      {reviewItem && (
        <Modal title="Review Schedule Change Request" onClose={() => setReviewItem(null)} size="md">
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800">{taskName(reviewItem.affected_task_id)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{reviewItem.change_type} · +{reviewItem.delay_days} days</p>
              <p className="text-sm text-slate-600 mt-2">{reviewItem.reason}</p>
              <p className="text-xs text-slate-400 mt-1.5">Submitted by {reviewItem.requested_by_name} · {new Date(reviewItem.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Approved Delay Days</label>
              <input
                type="number" min="0"
                value={approvedDays}
                onChange={e => setApprovedDays(parseInt(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900"
              />
              <p className="text-xs text-slate-400 mt-1">Leave as-is to approve the original request.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Admin Notes <span className="text-slate-400 font-normal">(required for Clarification)</span>
              </label>
              <textarea
                rows={2}
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="Reason for decision or clarification needed..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => reviewScrAction('Approved')}
                disabled={reviewing}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => reviewScrAction('Clarification Needed')}
                disabled={reviewing}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold border border-slate-200 text-slate-700 bg-white py-2.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <MessageSquare className="w-4 h-4" /> Clarify
              </button>
              <button
                onClick={() => reviewScrAction('Rejected')}
                disabled={reviewing}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold border border-red-200 text-red-700 bg-red-50 py-2.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── GC / Sub: Submit SCR Modal ────────────────────────────────────── */}
      {showScrForm && (
        <Modal title="Request Schedule Change" onClose={() => setShowScrForm(false)} size="md">
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              Schedule changes require Admin approval before they affect projected dates.
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Affected Task</label>
              <select
                value={scrForm.affected_task_id}
                onChange={e => setScrForm(f => ({ ...f, affected_task_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900"
              >
                <option value="">Project Level</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Change Type</label>
                <select
                  value={scrForm.change_type}
                  onChange={e => setScrForm(f => ({ ...f, change_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900"
                >
                  {['Task Delay', 'Weather Delay', 'Material Delay', 'Subcontractor Delay', 'Client Decision Delay', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Delay Days</label>
                <input
                  type="number" min="1"
                  value={scrForm.delay_days}
                  onChange={e => setScrForm(f => ({ ...f, delay_days: parseInt(e.target.value) || 1 }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason *</label>
              <textarea
                rows={3}
                value={scrForm.reason}
                onChange={e => setScrForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Explain what happened and why this delay is needed..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowScrForm(false)} className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button
                onClick={submitScrRequest}
                disabled={scrSaving || !scrForm.reason.trim()}
                className="text-sm font-semibold bg-slate-900 text-white px-5 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {scrSaving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add / Edit Delay Modal ────────────────────────────────────────── */}
      {showForm && (
        <Modal title={editTarget ? 'Edit Schedule Impact' : 'Add Schedule Impact'} onClose={() => setShowForm(false)} size="xl">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phase / Task</label>
                <select value={form.task_id} onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900">
                  <option value="">Project Level</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Delay Category</label>
                <select value={form.delay_category} onChange={e => setForm(f => ({ ...f, delay_category: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900">
                  {DELAY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Internal Reason <span className="text-slate-400 font-normal">(Admin only)</span>
              </label>
              <textarea value={form.internal_reason} onChange={e => setForm(f => ({ ...f, internal_reason: e.target.value }))}
                rows={3} placeholder="Describe the delay in full operational detail..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Client-Safe Reason <span className="text-slate-400 font-normal">(shown to client if approved)</span>
              </label>
              <textarea value={form.client_safe_reason} onChange={e => setForm(f => ({ ...f, client_safe_reason: e.target.value }))}
                rows={3} placeholder="e.g. Soil conditions required additional excavation."
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estimated Delay Days</label>
                <input type="number" min={0} value={form.estimated_delay_days}
                  onChange={e => setForm(f => ({ ...f, estimated_delay_days: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Responsible Role</label>
                <input type="text" value={form.responsible_role} onChange={e => setForm(f => ({ ...f, responsible_role: e.target.value }))}
                  placeholder="e.g. GC, Inspector, Client..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Original Projected Completion</label>
                <input type="date" value={form.original_projected_completion}
                  onChange={e => setForm(f => ({ ...f, original_projected_completion: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Revised Projected Completion</label>
                <input type="date" value={form.revised_projected_completion}
                  onChange={e => setForm(f => ({ ...f, revised_projected_completion: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900" />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <input type="checkbox" id="sip" checked={form.schedule_impact_possible}
                onChange={e => setForm(f => ({ ...f, schedule_impact_possible: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-400" />
              <label htmlFor="sip" className="text-sm text-slate-700 font-medium cursor-pointer">Schedule impact is possible / expected</label>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Client Visibility</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Visibility Status</label>
                  <select value={form.client_visibility_status}
                    onChange={e => setForm(f => ({ ...f, client_visibility_status: e.target.value, client_visible: e.target.value === 'Visible to Client' }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900">
                    {CLIENT_VISIBILITY_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Response Deadline</label>
                  <input type="date" value={form.response_deadline}
                    onChange={e => setForm(f => ({ ...f, response_deadline: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.client_response_required}
                    onChange={e => setForm(f => ({ ...f, client_response_required: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300" />
                  <span className="text-sm text-slate-700">Client response required</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.auto_acknowledgement_enabled}
                    onChange={e => setForm(f => ({ ...f, auto_acknowledgement_enabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300" />
                  <span className="text-sm text-slate-700">Auto-acknowledge after deadline</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900">
                  {DELAY_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Next Action</label>
                <input type="text" value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))}
                  placeholder="e.g. Awaiting permit approval..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving}
                className="text-sm font-semibold bg-slate-900 text-white px-5 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Add Schedule Impact'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      {detailTarget && (
        <Modal title="Schedule Impact Details" onClose={() => setDetailTarget(null)} size="xl">
          <div className="space-y-6">

            <section>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Reason for Schedule Impact
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Detail label="Category">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[detailTarget.delay_category] || 'bg-slate-100 text-slate-600'}`}>
                    {detailTarget.delay_category}
                  </span>
                </Detail>
                <Detail label="Status">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[detailTarget.status] || 'bg-slate-100 text-slate-500'}`}>
                    {detailTarget.status}
                  </span>
                </Detail>
                <Detail label="Task / Phase">{detailTarget.task_name || 'Project Level'}</Detail>
                <Detail label="Date Reported">{fmtTs(detailTarget.created_at)}</Detail>
                <Detail label="Est. Delay Days">
                  <span className={detailTarget.estimated_delay_days > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>
                    {detailTarget.estimated_delay_days > 0 ? `+${detailTarget.estimated_delay_days} days` : 'None'}
                  </span>
                </Detail>
                <Detail label="Approved Delay Days">
                  <span className={detailTarget.approved_delay_days > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {detailTarget.approved_delay_days > 0 ? `+${detailTarget.approved_delay_days} days` : '—'}
                  </span>
                </Detail>
                <Detail label="Responsible Role">{detailTarget.responsible_role || '—'}</Detail>
                <Detail label="Next Action">{detailTarget.next_action || '—'}</Detail>
              </div>
              {detailTarget.internal_reason && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Internal Reason (Admin Only)
                  </p>
                  <p className="text-sm text-slate-700">{detailTarget.internal_reason}</p>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> Schedule Impact
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Detail label="Schedule Impact Possible">{detailTarget.schedule_impact_possible ? 'Yes' : 'No'}</Detail>
                <Detail label="Schedule Impact Status">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    detailTarget.schedule_impact_status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                    detailTarget.schedule_impact_status === 'No Impact' ? 'bg-slate-100 text-slate-500' :
                    'bg-amber-100 text-amber-700'
                  }`}>{detailTarget.schedule_impact_status}</span>
                </Detail>
              </div>
              {(detailTarget.original_projected_completion || detailTarget.revised_projected_completion) && (
                <div className="mt-3 flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-medium mb-0.5">Original</p>
                    <p className="text-sm font-semibold text-slate-700">{fmtDate(detailTarget.original_projected_completion)}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-medium mb-0.5">Revised</p>
                    <p className="text-sm font-bold text-red-600">{fmtDate(detailTarget.revised_projected_completion)}</p>
                  </div>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Eye className="w-3.5 h-3.5" /> Client Visibility
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Detail label="Visibility Status">{detailTarget.client_visibility_status}</Detail>
                <Detail label="Client Response Required">{detailTarget.client_response_required ? 'Yes' : 'No'}</Detail>
                <Detail label="Auto-Acknowledgement">{detailTarget.auto_acknowledgement_enabled ? 'Enabled (72h)' : 'Disabled'}</Detail>
                <Detail label="Response Deadline">{detailTarget.response_deadline ? new Date(detailTarget.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</Detail>
              </div>
              {detailTarget.client_safe_reason && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Client-Safe Reason</p>
                  <p className="text-sm text-blue-800">{detailTarget.client_safe_reason}</p>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" /> Client Response
              </h4>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CLIENT_RESP_COLORS[detailTarget.client_response_status] || 'bg-slate-100 text-slate-500'}`}>
                  {detailTarget.client_response_status}
                </span>
                {detailTarget.resolved_at && (
                  <span className="text-xs text-slate-400">Resolved {fmtTs(detailTarget.resolved_at)}</span>
                )}
              </div>
              {detailTarget.client_response_status === 'Acknowledged by Client' && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">Client has acknowledged this update. You can mark it as Resolved.</p>
                </div>
              )}
              {detailTarget.client_response_status === 'Admin Responded' && detailTarget.admin_reply && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Reply className="w-3 h-3" /> Your Reply (sent to client)
                  </p>
                  <p className="text-sm text-slate-700">{detailTarget.admin_reply}</p>
                  {detailTarget.admin_replied_at && (
                    <p className="text-[10px] text-slate-400 mt-1">Sent {fmtTs(detailTarget.admin_replied_at)}</p>
                  )}
                </div>
              )}
            </section>

            {/* ── Client Requested Review panel + Admin Reply form ── */}
            {isAdmin && detailTarget.client_response_status === 'Client Requested Review' && (
              <section className="rounded-xl border border-orange-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-orange-800">Client Requested Review</p>
                    <p className="text-xs text-orange-600 mt-0.5">The client has asked DECKARC to review this schedule update before taking action.</p>
                  </div>
                </div>

                {/* Client's stated reason */}
                <div className="px-4 py-3 border-b border-orange-100 bg-white">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Client's Review Reason</p>
                  {detailTarget.client_review_reason ? (
                    <p className="text-sm text-slate-700 leading-relaxed">{detailTarget.client_review_reason}</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No reason provided.</p>
                  )}
                </div>

                {/* Original schedule update shown to client */}
                <div className="px-4 py-3 border-b border-orange-100 bg-white">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Original Schedule Update Shown to Client</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {detailTarget.client_safe_reason || <span className="italic text-slate-400">No client-safe reason on record.</span>}
                  </p>
                  {detailTarget.estimated_delay_days > 0 && (
                    <p className="text-xs text-amber-600 mt-1.5 font-medium">
                      Estimated impact: +{detailTarget.estimated_delay_days} day{detailTarget.estimated_delay_days !== 1 ? 's' : ''}
                    </p>
                  )}
                  {detailTarget.response_deadline && (
                    <p className="text-xs text-slate-400 mt-1">
                      Response deadline: {new Date(detailTarget.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </div>

                {/* Admin reply form */}
                <div className="px-4 py-4 bg-white space-y-3">
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Reply className="w-3.5 h-3.5 text-slate-500" /> Admin Reply to Client
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Reply Message <span className="text-red-500">*</span>
                      <span className="ml-1 text-slate-400 font-normal">(shown to client — keep professional and client-safe)</span>
                    </label>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={4}
                      placeholder="Address the client's concerns. Explain the schedule impact clearly and professionally. Do not include internal details."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-slate-900 placeholder-slate-400 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Revised Client-Safe Explanation
                      <span className="ml-1 text-slate-400 font-normal">(optional — replaces current explanation shown to client)</span>
                    </label>
                    <textarea
                      value={replyClientReason}
                      onChange={e => setReplyClientReason(e.target.value)}
                      rows={2}
                      placeholder="Leave blank to keep the existing explanation."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Revised Estimated Delay Days
                        <span className="ml-1 text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={replyDelayDays}
                        onChange={e => setReplyDelayDays(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        placeholder={String(detailTarget.estimated_delay_days)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900 placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Status After Reply</label>
                      <select
                        value={replyStatus}
                        onChange={e => setReplyStatus(e.target.value as typeof replyStatus)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-900"
                      >
                        <option value="Waiting on Client Again">Waiting on Client Again</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-500 space-y-0.5">
                    <p><span className="font-semibold text-slate-700">Waiting on Client Again</span> — client will see your reply and must acknowledge it.</p>
                    <p><span className="font-semibold text-slate-700">Resolved</span> — marks the schedule impact resolved. Client sees reply but no action needed.</p>
                    <p><span className="font-semibold text-slate-700">Closed</span> — closes the record. Use when no further action is required.</p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => { setReplyText(''); setReplyClientReason(''); setReplyDelayDays(''); setReplyStatus('Waiting on Client Again'); }}
                      className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => submitAdminReply(detailTarget)}
                      disabled={!replyText.trim() || replySaving}
                      className="flex items-center gap-1.5 text-sm font-semibold bg-orange-600 text-white px-5 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                    >
                      {replySaving ? (
                        <>
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <><Send className="w-3.5 h-3.5" /> Send Reply to Client</>
                      )}
                    </button>
                  </div>
                </div>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {isAdmin && (
                <button onClick={() => openEdit(detailTarget)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" /> Edit Schedule Impact
                </button>
              )}
              {isAdmin && detailTarget.client_visibility_status === 'Pending Admin Approval' && (
                <button onClick={() => approveClientVisibility(detailTarget)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5" /> Approve for Client
                </button>
              )}
              {isAdmin && !['Resolved', 'Closed'].includes(detailTarget.status) && (
                <button onClick={() => { markResolved(detailTarget); setDetailTarget(null); }}
                  className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
                </button>
              )}
              {isGC && !['Resolved', 'Closed'].includes(detailTarget.status) && (
                <>
                  <button onClick={() => { setDetailTarget(null); setGcUpdateTarget(detailTarget); setGcUpdateType('update'); setGcUpdateText(''); }}
                    className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> Add Update
                  </button>
                  <button onClick={() => { setDetailTarget(null); setGcUpdateTarget(detailTarget); setGcUpdateType('blocker'); setGcUpdateText(''); }}
                    className="flex items-center gap-1.5 text-xs font-medium border border-red-200 text-red-600 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
                    <AlertCircle className="w-3.5 h-3.5" /> Report Blocker
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}
