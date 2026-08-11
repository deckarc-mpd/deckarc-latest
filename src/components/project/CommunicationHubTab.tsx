import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logActivity } from './ActivityLogTab';
import {
  MessageSquare, Send, AlertTriangle, Shield, Flag, User, Reply,
  CheckCircle, X, Filter, Search, ChevronDown, Eye, Lock, Loader,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender_user_id: string;
  sender_role: string;
  message_body: string;
  message_type: string;
  visibility: string;
  priority_level: string;
  is_urgent: boolean;
  response_required: boolean;
  follow_up_required: boolean;
  client_visibility_status: string;
  related_record_type: string | null;
  related_record_id: string | null;
  created_at: string;
  sender_name?: string;
}

interface DelayRecord {
  id: string;
  client_response_status: string;
  admin_reply: string;
  admin_replied_at: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MESSAGE_TYPES = [
  'General Project Message',
  'Client Message',
  'Task Question',
  'Field Note',
  'Inspection Follow-Up',
  'Permit Follow-Up',
  'Change Order Question',
  'RFI',
  'Internal Note',
  'Admin Reply',
  'Client Review Request',
];

const CLIENT_SAFE_TYPES = [
  'General Project Message',
  'Client Message',
  'Admin Reply',
];

const VISIBILITY_OPTIONS: { value: string; label: string; hint?: string }[] = [
  { value: 'Internal Only',          label: 'Internal Only',          hint: 'Only admin and GC can see this' },
  { value: 'Assigned Team Only',     label: 'Assigned Parties Only',  hint: 'Visible to anyone assigned to this project' },
  { value: 'Admin Only',             label: 'Admin Only',             hint: 'Super admin and DECKARC admin only' },
  { value: 'Client Visible Pending Approval', label: 'Pending Client Approval', hint: 'Admin must approve before client can see' },
  { value: 'Client Visible',         label: 'Client Visible',         hint: 'Immediately visible in client portal' },
];

// What each role is allowed to set as visibility
const ROLE_VISIBILITY: Record<string, string[]> = {
  CONVAZANT_SUPER_ADMIN: ['Internal Only', 'Assigned Team Only', 'Admin Only', 'Client Visible Pending Approval', 'Client Visible'],
  DECKARC_ADMIN:         ['Internal Only', 'Assigned Team Only', 'Admin Only', 'Client Visible Pending Approval', 'Client Visible'],
  GENERAL_CONTRACTOR:    ['Internal Only', 'Assigned Team Only', 'Client Visible Pending Approval'],
  SUBCONTRACTOR:         ['Internal Only', 'Assigned Team Only'],
  CLIENT:                [],
};

const PRIORITY_OPTIONS = ['Normal', 'Needs Response', 'Urgent', 'Critical / Escalation'];

// ─── Styling helpers ──────────────────────────────────────────────────────────

const visibilityBadge: Record<string, string> = {
  'Internal Only':                  'bg-slate-100 text-slate-600',
  'Assigned Team Only':             'bg-steel-100 text-steel-700',
  'Admin Only':                     'bg-slate-200 text-slate-700',
  'Client Visible Pending Approval':'bg-amber-100 text-amber-700',
  'Client Visible Approved':        'bg-emerald-100 text-emerald-700',
  'Client Visible':                 'bg-emerald-100 text-emerald-700',
  'Visible to Client':              'bg-emerald-100 text-emerald-700',
  'Approved for Client':            'bg-emerald-100 text-emerald-700',
};

const visibilityIcon: Record<string, typeof Lock> = {
  'Internal Only':   Lock,
  'Admin Only':      Lock,
};

const priorityBadge: Record<string, string> = {
  'Normal':               'bg-slate-100 text-slate-500',
  'Needs Response':       'bg-amber-100 text-amber-700',
  'Urgent':               'bg-orange-100 text-orange-700',
  'Critical / Escalation':'bg-red-100 text-red-800',
};

const typeBadge: Record<string, string> = {
  'General Project Message': 'bg-steel-100 text-steel-700',
  'Client Message':          'bg-blue-100 text-blue-700',
  'Task Question':           'bg-slate-100 text-slate-600',
  'Field Note':              'bg-amber-100 text-amber-700',
  'Inspection Follow-Up':    'bg-teal-100 text-teal-700',
  'Permit Follow-Up':        'bg-teal-100 text-teal-700',
  'Change Order Question':   'bg-orange-100 text-orange-700',
  'RFI':                     'bg-slate-100 text-slate-600',
  'Internal Note':           'bg-slate-100 text-slate-500',
  'Admin Reply':             'bg-emerald-100 text-emerald-700',
  'Client Review Request':   'bg-orange-100 text-orange-700',
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  clientSafeOnly?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommunicationHubTab({
  projectId,
  relatedRecordType,
  relatedRecordId,
  clientSafeOnly = false,
}: Props) {
  const { profile } = useAuth();

  const [messages, setMessages]         = useState<Message[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);

  // Compose form state
  const [body, setBody]                 = useState('');
  const [msgType, setMsgType]           = useState('General Project Message');
  const [visibility, setVisibility]     = useState('Internal Only');
  const [priority, setPriority]         = useState('Normal');
  const [followUp, setFollowUp]         = useState(false);
  const [responseRequired, setResponseRequired] = useState(false);
  const [saving, setSaving]             = useState(false);

  // Filter state
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState('all');
  const [filterVis, setFilterVis]       = useState('all');
  const [showFilters, setShowFilters]   = useState(false);

  // Reply state keyed by message id
  const [replyOpen, setReplyOpen]       = useState<Record<string, boolean>>({});
  const [replyText, setReplyText]       = useState<Record<string, string>>({});
  const [replySaving, setReplySaving]   = useState<Record<string, boolean>>({});
  const [replyDone, setReplyDone]       = useState<Record<string, boolean>>({});

  const [delayMap, setDelayMap]         = useState<Record<string, DelayRecord>>({});

  const isClient  = profile?.role === 'CLIENT';
  const isAdmin   = profile?.role === 'DECKARC_ADMIN' || profile?.role === 'CONVAZANT_SUPER_ADMIN';
  const isGC      = profile?.role === 'GENERAL_CONTRACTOR';
  const isSub     = profile?.role === 'SUBCONTRACTOR';

  const allowedVisibility = profile ? (ROLE_VISIBILITY[profile.role] ?? []) : [];
  const canPost = !isClient;

  useEffect(() => { load(); }, [projectId, relatedRecordId]);

  // Auto-set default visibility when role changes
  useEffect(() => {
    if (allowedVisibility.length > 0 && !allowedVisibility.includes(visibility)) {
      setVisibility(allowedVisibility[0]);
    }
  }, [profile?.role]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from('communication_messages')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'Active')
      .order('created_at', { ascending: false })
      .limit(100);

    if (relatedRecordId) query = query.eq('related_record_id', relatedRecordId);

    if (clientSafeOnly) {
      // Client sees only explicitly approved messages
      query = query.in('client_visibility_status', ['Approved for Client', 'Visible to Client', 'Client Visible Approved'])
                   .in('message_type', CLIENT_SAFE_TYPES);
    } else if (isSub) {
      // Subcontractor sees only messages on their assigned tasks (via related_record) or non-internal
      query = query.neq('visibility', 'Admin Only');
    }

    const { data } = await query;
    if (data) {
      const userIds = [...new Set(data.map((m: any) => m.sender_user_id).filter(Boolean))];
      const { data: profiles } = userIds.length
        ? await supabase.from('user_profiles').select('id,full_name,role').in('id', userIds)
        : { data: [] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const enriched: Message[] = data.map((m: any) => ({
        ...m,
        sender_name: profileMap.get(m.sender_user_id)?.full_name || m.sender_role || 'Team',
      }));
      setMessages(enriched);

      const reviewMsgs = enriched.filter(m => m.message_type === 'Client Review Request' && m.related_record_id);
      if (reviewMsgs.length > 0) {
        const ids = reviewMsgs.map(m => m.related_record_id as string);
        const { data: delays } = await supabase
          .from('project_delay_reasons')
          .select('id, client_response_status, admin_reply, admin_replied_at')
          .in('id', ids);
        if (delays) {
          const map: Record<string, DelayRecord> = {};
          (delays as DelayRecord[]).forEach(d => { map[d.id] = d; });
          setDelayMap(map);
        }
      }
    }
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !profile) return;
    setSaving(true);

    const finalVisibility = isClient ? 'Client Visible' : visibility;
    const finalCVStatus   = isClient ? 'Visible to Client' :
      (visibility === 'Client Visible' || visibility === 'Assigned Team Only') ? 'Visible to Client' :
      visibility === 'Client Visible Pending Approval' ? 'Client Visible Pending Approval' :
      'Internal Only';

    const { error } = await supabase.from('communication_messages').insert({
      project_id:             projectId,
      organization_id:        profile.organization_id,
      related_record_type:    relatedRecordType ?? null,
      related_record_id:      relatedRecordId ?? null,
      sender_user_id:         profile.id,
      sender_role:            profile.role,
      message_body:           body.trim(),
      message_type:           isClient ? 'Client Message' : msgType,
      visibility:             finalVisibility,
      priority_level:         isClient ? 'Normal' : priority,
      is_urgent:              !isClient && (priority === 'Urgent' || priority === 'Critical / Escalation'),
      response_required:      !isClient && responseRequired,
      follow_up_required:     !isClient && followUp,
      client_visibility_status: finalCVStatus,
      status: 'Active',
    });

    if (!error) {
      await logActivity({
        projectId,
        userId: profile.id,
        userFullName: profile.full_name,
        userRole: profile.role,
        actionType: 'Message Posted',
        module: 'Communication',
        relatedRecordId: relatedRecordId,
        relatedRecordType: relatedRecordType,
        notes: `${isClient ? 'Client Message' : msgType}: ${body.trim().slice(0, 100)}`,
      });
      setBody(''); setShowForm(false);
      await load();
    }
    setSaving(false);
  }

  async function approveForClient(id: string) {
    await supabase.from('communication_messages').update({
      client_visibility_status: 'Approved for Client',
      visibility: 'Client Visible',
    }).eq('id', id);
    await load();
  }

  async function submitReply(msg: Message) {
    if (!profile || !replyText[msg.id]?.trim()) return;
    const text = replyText[msg.id].trim();
    setReplySaving(p => ({ ...p, [msg.id]: true }));

    await supabase.from('communication_messages').insert({
      project_id:               projectId,
      organization_id:          profile.organization_id,
      related_record_type:      msg.related_record_type,
      related_record_id:        msg.related_record_id,
      sender_user_id:           profile.id,
      sender_role:              profile.role,
      message_body:             text,
      message_type:             'Admin Reply',
      visibility:               'Client Visible',
      priority_level:           'Normal',
      is_urgent:                false,
      response_required:        false,
      follow_up_required:       false,
      client_visibility_status: 'Visible to Client',
      status:                   'Active',
    });

    if (msg.related_record_id) {
      await supabase.from('project_delay_reasons').update({
        admin_reply:            text,
        admin_replied_at:       new Date().toISOString(),
        client_response_status: 'Admin Responded',
        updated_at:             new Date().toISOString(),
      }).eq('id', msg.related_record_id);
    }

    await logActivity({
      projectId,
      userId: profile.id,
      userFullName: profile.full_name,
      userRole: profile.role,
      actionType: 'Admin Replied to Client',
      module: 'Communication',
      relatedRecordId: msg.related_record_id ?? msg.id,
      relatedRecordType: 'communication_messages',
      notes: `Reply: ${text.slice(0, 100)}`,
    });

    setReplySaving(p => ({ ...p, [msg.id]: false }));
    setReplyDone(p => ({ ...p, [msg.id]: true }));
    setReplyOpen(p => ({ ...p, [msg.id]: false }));
    setReplyText(p => ({ ...p, [msg.id]: '' }));
    await load();
  }

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filteredMessages = messages.filter(m => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || m.message_body.toLowerCase().includes(q)
      || m.message_type.toLowerCase().includes(q)
      || (m.sender_name || '').toLowerCase().includes(q);
    const matchType = filterType === 'all' || m.message_type === filterType;
    const matchVis  = filterVis  === 'all' || m.visibility === filterVis || m.client_visibility_status === filterVis;
    return matchSearch && matchType && matchVis;
  });

  const pendingApproval = messages.filter(
    m => m.client_visibility_status === 'Client Visible Pending Approval' && !clientSafeOnly
  ).length;

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-slate-200" />
              <div className="h-3 bg-slate-200 rounded w-32" />
            </div>
            <div className="h-4 bg-slate-100 rounded w-full mb-1" />
            <div className="h-4 bg-slate-100 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-steel-600" />
          <h3 className="text-sm font-bold text-slate-800">
            {clientSafeOnly ? 'Project Communication' : 'Communication Hub'}
          </h3>
          <span className="text-xs text-slate-400">({filteredMessages.length}{messages.length !== filteredMessages.length ? ` of ${messages.length}` : ''})</span>
          {pendingApproval > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              {pendingApproval} pending approval
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!clientSafeOnly && (
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                showFilters ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
              }`}
            >
              <Filter className="w-3 h-3" />
              Filter
              {(filterType !== 'all' || filterVis !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-steel-600" />
              )}
            </button>
          )}
          {canPost && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-steel-800 text-white px-3 py-1.5 rounded-lg hover:bg-steel-700 transition-colors"
            >
              {showForm ? <X className="w-3 h-3" /> : <Send className="w-3 h-3" />}
              {showForm ? 'Cancel' : '+ Message'}
            </button>
          )}
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
        />
      </div>

      {/* ── Filters ── */}
      {showFilters && !clientSafeOnly && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Category</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none text-slate-600"
            >
              <option value="all">All Categories</option>
              {MESSAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Visibility</label>
            <select
              value={filterVis}
              onChange={e => setFilterVis(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none text-slate-600"
            >
              <option value="all">All</option>
              <option value="Internal Only">Internal Only</option>
              <option value="Admin Only">Admin Only</option>
              <option value="Assigned Team Only">Assigned Team Only</option>
              <option value="Client Visible Pending Approval">Pending Approval</option>
              <option value="Approved for Client">Approved for Client</option>
              <option value="Client Visible">Client Visible</option>
            </select>
          </div>
          {(filterType !== 'all' || filterVis !== 'all') && (
            <button
              onClick={() => { setFilterType('all'); setFilterVis('all'); }}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Compose form ── */}
      {showForm && canPost && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Category</label>
              <select
                value={msgType}
                onChange={e => setMsgType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {MESSAGE_TYPES.filter(t => t !== 'Client Review Request' && t !== 'Admin Reply').map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {VISIBILITY_OPTIONS.filter(o => allowedVisibility.includes(o.value)).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {VISIBILITY_OPTIONS.find(o => o.value === visibility)?.hint && (
                <p className="text-[10px] text-slate-400 mt-1">
                  {VISIBILITY_OPTIONS.find(o => o.value === visibility)!.hint}
                </p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder={msgType === 'Internal Note' ? 'Internal team note (not visible to client)...' : 'Type your message...'}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none"
              required
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} className="rounded" />
              <span className="text-xs text-slate-600 font-medium">Follow-Up Required</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={responseRequired} onChange={e => setResponseRequired(e.target.checked)} className="rounded" />
              <span className="text-xs text-slate-600 font-medium">Response Required</span>
            </label>
          </div>

          {visibility === 'Client Visible Pending Approval' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700">This message requires admin approval before the client can see it.</p>
            </div>
          )}
          {visibility === 'Client Visible' && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Eye className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-emerald-700">This message will be immediately visible in the client portal.</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="flex items-center gap-2 bg-steel-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-steel-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {saving ? 'Posting...' : 'Post Message'}
            </button>
          </div>
        </form>
      )}

      {/* ── Messages list ── */}
      {filteredMessages.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-200" />
          <p className="text-sm text-slate-400">
            {messages.length === 0
              ? clientSafeOnly ? 'No client-visible messages yet.' : 'No messages yet.'
              : 'No messages match your search or filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map(msg => {
            const isReviewRequest = msg.message_type === 'Client Review Request';
            const isAdminReply    = msg.message_type === 'Admin Reply';
            const isClientMsg     = msg.message_type === 'Client Message';
            const isPendingApproval = msg.client_visibility_status === 'Client Visible Pending Approval';
            const delay           = msg.related_record_id ? delayMap[msg.related_record_id] : null;
            const alreadyReplied  = delay?.client_response_status === 'Admin Responded'
              || delay?.client_response_status === 'Acknowledged by Client'
              || replyDone[msg.id];

            const borderClass = isReviewRequest
              ? 'border-l-4 border-l-orange-400 border-t-orange-100 border-r-orange-100 border-b-orange-100'
              : isAdminReply || isClientMsg
              ? 'border-l-4 border-l-emerald-400 border-t-emerald-100 border-r-emerald-100 border-b-emerald-100 sm:ml-5'
              : isPendingApproval
              ? 'border-l-4 border-l-amber-400 border-amber-100'
              : 'border-slate-200';

            return (
              <div
                key={msg.id}
                className={`bg-white border rounded-xl overflow-hidden hover:shadow-sm transition-shadow ${borderClass}`}
              >
                {/* Admin Reply / Client Message banner */}
                {(isAdminReply || isClientMsg) && (
                  <div className={`px-4 py-1.5 border-b flex items-center gap-1.5 ${
                    isAdminReply ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'
                  }`}>
                    <Reply className={`w-3 h-3 ${isAdminReply ? 'text-emerald-500' : 'text-blue-500'}`} />
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      isAdminReply ? 'text-emerald-700' : 'text-blue-700'
                    }`}>
                      {isAdminReply ? 'Admin Reply — Visible to Client' : 'Client Message'}
                    </span>
                  </div>
                )}

                {/* Pending approval banner */}
                {isPendingApproval && !clientSafeOnly && (
                  <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Pending client approval</span>
                  </div>
                )}

                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
                        isAdminReply ? 'bg-emerald-600' : isClientMsg ? 'bg-blue-600' : 'bg-steel-700'
                      }`}>
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{msg.sender_name}</p>
                        <p className="text-[10px] text-slate-400">{fmtTime(msg.created_at)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {/* Category */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        typeBadge[msg.message_type] || 'bg-slate-100 text-slate-500'
                      }`}>
                        {msg.message_type}
                      </span>

                      {/* Visibility (not shown in client-safe mode) */}
                      {!clientSafeOnly && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          visibilityBadge[msg.client_visibility_status] || visibilityBadge[msg.visibility] || 'bg-slate-100 text-slate-500'
                        }`}>
                          {isPendingApproval ? 'Pending Approval' :
                           msg.client_visibility_status === 'Approved for Client' ? 'Approved for Client' :
                           msg.client_visibility_status === 'Visible to Client' ? 'Client Visible' :
                           msg.visibility === 'Admin Only' ? 'Admin Only' :
                           msg.visibility || 'Internal'}
                        </span>
                      )}

                      {/* Priority */}
                      {msg.priority_level && msg.priority_level !== 'Normal' && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityBadge[msg.priority_level] || ''}`}>
                          {msg.priority_level}
                        </span>
                      )}
                      {msg.is_urgent && <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                    </div>
                  </div>

                  {/* Body */}
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.message_body}</p>

                  {/* Flags */}
                  {(msg.follow_up_required || msg.response_required) && !clientSafeOnly && (
                    <div className="flex gap-2 mt-2">
                      {msg.follow_up_required && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Flag className="w-2.5 h-2.5" /> Follow-Up
                        </span>
                      )}
                      {msg.response_required && (
                        <span className="text-[10px] text-steel-600 bg-steel-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <MessageSquare className="w-2.5 h-2.5" /> Response Needed
                        </span>
                      )}
                    </div>
                  )}

                  {/* Admin actions */}
                  {!clientSafeOnly && isAdmin && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">

                      {/* Approve for client */}
                      {isPendingApproval && (
                        <button
                          onClick={() => approveForClient(msg.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Shield className="w-3 h-3" /> Approve for Client
                        </button>
                      )}

                      {/* Approve non-pending internal messages */}
                      {!isPendingApproval && !isAdminReply && !isReviewRequest
                        && msg.visibility !== 'Admin Only'
                        && msg.client_visibility_status === 'Internal Only' && (
                        <button
                          onClick={() => approveForClient(msg.id)}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700 transition-colors"
                        >
                          <Shield className="w-3 h-3" /> Approve for Client
                        </button>
                      )}

                      {/* Reply to client review request */}
                      {isReviewRequest && !alreadyReplied && !replyOpen[msg.id] && (
                        <button
                          onClick={() => setReplyOpen(p => ({ ...p, [msg.id]: true }))}
                          className="flex items-center gap-1.5 text-xs font-semibold text-steel-700 bg-steel-50 hover:bg-steel-100 border border-steel-200 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Reply className="w-3 h-3" /> Reply to Client
                        </button>
                      )}

                      {isReviewRequest && alreadyReplied && !replyOpen[msg.id] && (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Reply sent
                        </span>
                      )}
                    </div>
                  )}

                  {/* Inline reply form */}
                  {isAdmin && isReviewRequest && replyOpen[msg.id] && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="bg-steel-50 border border-steel-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Reply className="w-3.5 h-3.5 text-steel-600" />
                            <p className="text-xs font-semibold text-steel-800">Reply to Client</p>
                          </div>
                          <button onClick={() => {
                            setReplyOpen(p => ({ ...p, [msg.id]: false }));
                            setReplyText(p => ({ ...p, [msg.id]: '' }));
                          }}>
                            <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                          </button>
                        </div>
                        <div className="flex items-start gap-1.5 bg-white border border-steel-100 rounded-lg px-3 py-2">
                          <Eye className="w-3 h-3 text-steel-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-steel-600">This reply will be immediately visible in the client portal.</p>
                        </div>
                        <textarea
                          value={replyText[msg.id] || ''}
                          onChange={e => setReplyText(p => ({ ...p, [msg.id]: e.target.value }))}
                          rows={4}
                          placeholder="Write your response..."
                          className="w-full border border-steel-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-steel-200 resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setReplyOpen(p => ({ ...p, [msg.id]: false }));
                              setReplyText(p => ({ ...p, [msg.id]: '' }));
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                          >Cancel</button>
                          <button
                            onClick={() => submitReply(msg)}
                            disabled={!replyText[msg.id]?.trim() || replySaving[msg.id]}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-steel-700 hover:bg-steel-800 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {replySaving[msg.id] ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            {replySaving[msg.id] ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Role hint for client ── */}
      {clientSafeOnly && (
        <p className="text-center text-xs text-slate-400 pb-2">
          Only messages approved for client visibility appear here.
        </p>
      )}
    </div>
  );
}
