import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Archive, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface ArchiveRequest {
  id: string;
  project_id: string;
  project_name: string;
  requester_name: string;
  requested_by_user_id: string;
  requested_by_role: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-steel-500/20 focus:border-steel-500 transition-colors';

export default function ArchiveRequestsPanel({ onProjectArchived }: { onProjectArchived: () => void }) {
  const { profile } = useAuth();
  const [requests, setRequests]     = useState<ArchiveRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(true);
  const [acting, setActing]         = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => { loadRequests(); }, []);

  async function loadRequests() {
    setLoading(true);
    const { data } = await supabase
      .from('archive_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRequests((data || []) as ArchiveRequest[]);
    setLoading(false);
  }

  async function handleDecision(req: ArchiveRequest, decision: 'approved' | 'denied') {
    if (!profile?.id) return;
    setActing(req.id);

    // Update the archive request record
    const { error: reqError } = await supabase
      .from('archive_requests')
      .update({
        status: decision,
        reviewed_by_user_id: profile.id,
        reviewed_at: new Date().toISOString(),
        admin_note: adminNotes[req.id] || null,
      })
      .eq('id', req.id);

    if (reqError) { setActing(null); return; }

    if (decision === 'approved') {
      // Archive the project
      await supabase.from('projects').update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by_user_id: profile.id,
        archive_reason: req.reason,
      }).eq('id', req.project_id);
    }

    // Activity log
    await supabase.from('activity_log').insert({
      project_id: req.project_id,
      user_id: profile.id,
      user_full_name: profile.full_name,
      user_role: profile.role,
      action_type: decision === 'approved' ? 'archive_request_approved' : 'archive_request_denied',
      module: 'Projects',
      related_record_id: req.id,
      related_record_type: 'archive_request',
      notes: adminNotes[req.id] || '',
    });

    // Notify requester
    await supabase.from('notifications').insert({
      project_id: req.project_id,
      user_id: req.requested_by_user_id,
      notification_type: decision === 'approved' ? 'archive_request_approved' : 'archive_request_denied',
      title: decision === 'approved'
        ? `Archive Approved: ${req.project_name}`
        : `Archive Request Denied: ${req.project_name}`,
      message: decision === 'approved'
        ? `Your request to archive "${req.project_name}" has been approved.${adminNotes[req.id] ? ' Note: ' + adminNotes[req.id] : ''}`
        : `Your request to archive "${req.project_name}" was denied.${adminNotes[req.id] ? ' Reason: ' + adminNotes[req.id] : ''}`,
      status: 'unread',
    });

    setActing(null);
    if (decision === 'approved') onProjectArchived();
    loadRequests();
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <Archive className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Archive Requests</p>
            <p className="text-[11px] text-slate-400">
              {pending.length > 0
                ? <span className="text-amber-600 font-semibold">{pending.length} pending</span>
                : <span className="text-slate-400">No pending requests</span>}
              {resolved.length > 0 && <span className="ml-1 text-slate-400">· {resolved.length} resolved</span>}
            </p>
          </div>
          {pending.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex-shrink-0">
              {pending.length}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {pending.length === 0 && resolved.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-5">No archive requests yet.</p>
          )}

          {/* Pending requests */}
          {pending.map(req => (
            <RequestRow
              key={req.id}
              req={req}
              acting={acting}
              adminNote={adminNotes[req.id] || ''}
              onNoteChange={v => setAdminNotes(n => ({ ...n, [req.id]: v }))}
              onApprove={() => handleDecision(req, 'approved')}
              onDeny={() => handleDecision(req, 'denied')}
            />
          ))}

          {/* Resolved requests (collapsed list) */}
          {resolved.length > 0 && (
            <div className="border-t border-slate-100">
              <div className="px-4 py-2 bg-slate-50">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Resolved</p>
              </div>
              {resolved.slice(0, 5).map(req => (
                <div key={req.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
                  {req.status === 'approved'
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{req.project_name || 'Project'}</p>
                    <p className="text-[11px] text-slate-400 truncate">by {req.requester_name || 'GC'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    req.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {req.status === 'approved' ? 'Approved' : 'Denied'}
                  </span>
                </div>
              ))}
              {resolved.length > 5 && (
                <p className="text-[11px] text-slate-400 text-center py-2">+{resolved.length - 5} more resolved</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestRow({
  req, acting, adminNote, onNoteChange, onApprove, onDeny,
}: {
  req: ArchiveRequest;
  acting: string | null;
  adminNote: string;
  onNoteChange: (v: string) => void;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [open, setOpen] = useState(true);
  const isActing = acting === req.id;

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/70 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
          <Clock className="w-3 h-3 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{req.project_name || 'Project'}</p>
          <p className="text-[11px] text-slate-400">
            Requested by <span className="font-medium text-slate-600">{req.requester_name || 'GC'}</span>
            <span className="mx-1">·</span>
            {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex-shrink-0 whitespace-nowrap">
          Pending
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Reason */}
          <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason from GC</p>
            <p className="text-sm text-slate-700">{req.reason || '(no reason provided)'}</p>
          </div>

          {/* Admin note */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              Admin Note <span className="text-slate-400 font-normal">(optional — sent to requester)</span>
            </label>
            <input
              value={adminNote}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="e.g. Approved — project is complete. / Denied — still active scope remaining."
              className={inputCls}
            />
          </div>

          {/* Warning for approve */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              Approving will immediately archive this project and remove it from active views. This can be undone by any admin.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onDeny}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              {isActing ? 'Processing...' : 'Deny Request'}
            </button>
            <button
              onClick={onApprove}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isActing ? 'Processing...' : 'Approve & Archive'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
