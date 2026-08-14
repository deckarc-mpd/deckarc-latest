import { useEffect, useState, useRef } from 'react';
import { supabase, Task, Inspection, Permit, PaymentMilestone, RFI, Incident, ActionItemRecord, UserProfile, ClientDecision } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, ShieldCheck, AlertTriangle, DollarSign,
  HelpCircle, Zap, RefreshCw, Filter, CalendarClock,
  ChevronDown, ChevronRight, Eye, Calendar, Search,
  Plus, X, Check, BellOff, MessageSquare, User,
  CheckCircle2, MoreHorizontal, Pencil,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  dbId?: string;
  type: 'task' | 'inspection' | 'permit' | 'payment' | 'rfi' | 'incident' | 'delay' | 'manual';
  priority: 'high' | 'medium' | 'low';
  filter: 'needs-review' | 'critical' | 'due-today' | 'overdue' | 'follow-up' | 'decisions';
  title: string;
  subtitle: string;
  project: string;
  projectId: string;
  detail?: string;
  dueDate?: string;
  status: 'Open' | 'In Progress' | 'Done' | 'Snoozed';
  notes: string;
  assignedUserId?: string | null;
  assignedRole?: string;
  snoozedUntil?: string | null;
  resolvedAt?: string | null;
}

type FilterType = 'all' | 'needs-review' | 'needs-attention' | 'critical' | 'due-today' | 'overdue' | 'follow-up' | 'decisions';
type BoardView  = 'active' | 'done';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',              label: 'All' },
  { id: 'needs-attention',  label: 'Needs Attention' },
  { id: 'needs-review',     label: 'Needs Review' },
  { id: 'decisions',        label: 'Open Decisions' },
  { id: 'critical',         label: 'Critical' },
  { id: 'overdue',          label: 'Overdue' },
  { id: 'due-today',        label: 'Due Today' },
  { id: 'follow-up',        label: 'Follow Up' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityDot(p: ActionItem['priority']) {
  if (p === 'high')   return 'bg-red-500';
  if (p === 'medium') return 'bg-amber-400';
  return 'bg-slate-300';
}

function priorityLabel(p: ActionItem['priority']) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function typeBadgeColor(type: ActionItem['type']) {
  switch (type) {
    case 'task':       return 'bg-blue-50 text-blue-700';
    case 'inspection': return 'bg-amber-50 text-amber-700';
    case 'permit':     return 'bg-sky-50 text-sky-700';
    case 'payment':    return 'bg-emerald-50 text-emerald-700';
    case 'rfi':        return 'bg-slate-100 text-slate-600';
    case 'incident':   return 'bg-red-50 text-red-700';
    case 'delay':      return 'bg-orange-50 text-orange-700';
    case 'manual':     return 'bg-slate-100 text-slate-600';
  }
}

function typeIcon(type: ActionItem['type']) {
  switch (type) {
    case 'task':       return CheckSquare;
    case 'inspection': return ShieldCheck;
    case 'permit':     return ShieldCheck;
    case 'payment':    return DollarSign;
    case 'rfi':        return HelpCircle;
    case 'incident':   return AlertTriangle;
    case 'delay':      return CalendarClock;
    case 'manual':     return Pencil;
  }
}

function typeLabel(type: ActionItem['type']) {
  switch (type) {
    case 'task':       return 'Task';
    case 'inspection': return 'Inspection';
    case 'permit':     return 'Permit';
    case 'payment':    return 'Payment';
    case 'rfi':        return 'RFI';
    case 'incident':   return 'Incident';
    case 'delay':      return 'Schedule Impact';
    case 'manual':     return 'Manual';
  }
}

function filterBadgeStyle(f: ActionItem['filter']) {
  if (f === 'needs-review') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (f === 'decisions')    return 'bg-blue-50 text-blue-700 border-blue-200';
  if (f === 'critical')     return 'bg-red-50 text-red-700 border-red-200';
  if (f === 'overdue')      return 'bg-orange-50 text-orange-700 border-orange-200';
  if (f === 'due-today')    return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

function fmt(d: string | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({
  projects, users, onClose, onSave,
}: {
  projects: { id: string; project_name: string }[];
  users: UserProfile[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    action_title: '', action_description: '', project_id: '',
    priority: 'Medium', due_date: '', assigned_user_id: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.action_title.trim()) return;
    setSaving(true);
    await supabase.from('action_items').insert({
      action_title: form.action_title.trim(),
      action_description: form.action_description.trim(),
      project_id: form.project_id || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_user_id: form.assigned_user_id || null,
      notes: form.notes.trim(),
      source_type: 'manual',
      source_id: '',
      status: 'Open',
    });
    setSaving(false);
    onSave();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Add Action Item</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input
              autoFocus
              value={form.action_title}
              onChange={e => setForm(f => ({ ...f, action_title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="What needs to be done?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea
              value={form.action_description}
              onChange={e => setForm(f => ({ ...f, action_description: e.target.value }))}
              rows={2}
              placeholder="Additional context..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Project</label>
              <select
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-700"
              >
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-700"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assign To</label>
              <select
                value={form.assigned_user_id}
                onChange={e => setForm(f => ({ ...f, assigned_user_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-700"
              >
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !form.action_title.trim()}
            className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row quick-action popover ─────────────────────────────────────────────────

function RowActions({
  item, users, onResolve, onSnooze, onAssign, onNote, onViewProject,
}: {
  item: ActionItem;
  users: UserProfile[];
  onResolve: () => void;
  onSnooze: (days: number) => void;
  onAssign: (userId: string) => void;
  onNote: (note: string) => void;
  onViewProject?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'snooze' | 'assign' | 'note'>('menu');
  const [noteText, setNoteText] = useState(item.notes || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setMode('menu');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Keep noteText in sync when item.notes changes from outside
  useEffect(() => { setNoteText(item.notes || ''); }, [item.notes]);

  return (
    <div className="relative flex items-center justify-end gap-1" ref={ref}>
      {item.status !== 'Done' && (
        <button
          onClick={e => { e.stopPropagation(); onResolve(); }}
          title={item.type === 'delay' ? 'Mark addressed' : 'Mark done'}
          className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors"
        >
          <Check className="w-3 h-3" /> {item.type === 'delay' ? 'Addressed' : 'Done'}
        </button>
      )}
      {onViewProject && (
        <button
          onClick={e => { e.stopPropagation(); onViewProject(); }}
          title="Go to project"
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); setMode('menu'); }}
        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-slate-200 rounded-xl shadow-xl w-52 py-1.5" onClick={e => e.stopPropagation()}>
          {mode === 'menu' && (
            <>
              <button onClick={() => setMode('note')} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> {item.notes ? 'Edit Note' : 'Add Note'}
              </button>
              <button onClick={() => setMode('assign')} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                <User className="w-3.5 h-3.5 text-slate-400" /> Assign To
              </button>
              <button onClick={() => setMode('snooze')} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                <BellOff className="w-3.5 h-3.5 text-slate-400" /> Snooze
              </button>
              {item.status === 'Done' && (
                <button onClick={() => { onResolve(); setOpen(false); }} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-amber-700 hover:bg-amber-50 transition-colors border-t border-slate-100 mt-1 pt-2.5">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" /> Reopen
                </button>
              )}
            </>
          )}

          {mode === 'snooze' && (
            <div className="px-4 py-2.5">
              <p className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center gap-1.5">
                <button onClick={() => setMode('menu')} className="text-slate-400 hover:text-slate-600 mr-0.5">
                  <ChevronRight className="w-3 h-3 rotate-180" />
                </button>
                Snooze for…
              </p>
              {[{ label: '1 day', days: 1 }, { label: '2 days', days: 2 }, { label: '3 days', days: 3 }, { label: '1 week', days: 7 }].map(opt => (
                <button
                  key={opt.days}
                  onClick={() => { onSnooze(opt.days); setOpen(false); setMode('menu'); }}
                  className="block w-full text-left text-xs text-slate-600 hover:bg-slate-50 px-2 py-2 rounded-lg transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'assign' && (
            <div className="px-4 py-2.5 max-h-52 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center gap-1.5">
                <button onClick={() => setMode('menu')} className="text-slate-400 hover:text-slate-600 mr-0.5">
                  <ChevronRight className="w-3 h-3 rotate-180" />
                </button>
                Assign to…
              </p>
              <button
                onClick={() => { onAssign(''); setOpen(false); setMode('menu'); }}
                className="block w-full text-left text-xs text-slate-400 hover:bg-slate-50 px-2 py-2 rounded-lg transition-colors"
              >
                Unassigned
              </button>
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { onAssign(u.id); setOpen(false); setMode('menu'); }}
                  className={`flex items-center gap-2 w-full text-left text-xs hover:bg-slate-50 px-2 py-2 rounded-lg transition-colors ${item.assignedUserId === u.id ? 'text-blue-700 font-semibold' : 'text-slate-700'}`}
                >
                  <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-[8px] font-bold text-slate-600">{u.full_name?.charAt(0)}</span>
                  </div>
                  {u.full_name}
                  {item.assignedUserId === u.id && <Check className="w-3 h-3 ml-auto text-blue-600" />}
                </button>
              ))}
            </div>
          )}

          {mode === 'note' && (
            <div className="px-4 py-2.5">
              <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <button onClick={() => setMode('menu')} className="text-slate-400 hover:text-slate-600 mr-0.5">
                  <ChevronRight className="w-3 h-3 rotate-180" />
                </button>
                Internal Note
              </p>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
                autoFocus
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none mb-2 placeholder-slate-400"
                placeholder="Add a note..."
              />
              <button
                onClick={() => { onNote(noteText); setOpen(false); setMode('menu'); }}
                className="w-full text-xs font-semibold bg-slate-900 text-white py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Save Note
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActionBoardPage({
  onViewProject,
  initialFilter,
  focusItemId,
  focusAlertTitle,
}: {
  onViewProject?: (id: string, tab?: string, taskId?: string) => void;
  initialFilter?: FilterType;
  focusItemId?: string;
  focusAlertTitle?: string;
}) {
  const { profile } = useAuth();
  const [actions, setActions]           = useState<ActionItem[]>([]);
  const [doneItems, setDoneItems]       = useState<ActionItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [lastRefresh, setLastRefresh]   = useState(new Date());
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter ?? 'all');
  const [boardView, setBoardView]       = useState<BoardView>('active');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [projects, setProjects]         = useState<{ id: string; project_name: string }[]>([]);
  const [users, setUsers]               = useState<UserProfile[]>([]);
  const [toast, setToast]               = useState('');
  // Focus state — set when navigating from Alert Center
  const [focusedItemId, setFocusedItemId]     = useState<string | null>(focusItemId ?? null);
  const [focusedAlertTitle, setFocusedAlertTitle] = useState<string | null>(focusAlertTitle ?? null);
  const [focusHighlight, setFocusHighlight]   = useState<string | null>(null); // item ID currently highlighted
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSub = profile?.role === 'SUBCONTRACTOR';

  // Sync filter and focus when props change (e.g. navigating from Alert Center)
  useEffect(() => {
    if (initialFilter) setActiveFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (focusItemId) {
      setFocusedItemId(focusItemId);
      setFocusedAlertTitle(focusAlertTitle ?? null);
    }
  }, [focusItemId, focusAlertTitle]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today     = new Date().toISOString().split('T')[0];
    const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    const [projRes, taskRes, insRes, pmtRes, perRes, rfiRes, incRes, delayRes, dbItemsRes, usersRes, decisionsRes, schedRes] = await Promise.all([
      supabase.from('projects').select('id,project_name,status,is_archived,is_deleted'),
      supabase.from('tasks').select('*').neq('status', 'Completed').eq('is_deleted', false),
      supabase.from('inspections').select('*').neq('result', 'Passed').neq('result', 'Reinspection Passed'),
      supabase.from('payment_milestones').select('*').neq('status', 'Paid').neq('status', 'Waived'),
      supabase.from('permits').select('*').neq('permit_status', 'Approved').neq('permit_status', 'Closed'),
      supabase.from('rfis').select('*').neq('status', 'Answered').neq('status', 'Closed'),
      supabase.from('incidents').select('*').neq('incident_status', 'Resolved').neq('incident_status', 'Closed'),
      supabase.from('project_delay_reasons').select('*').neq('status', 'Closed').neq('status', 'Resolved'),
      supabase.from('action_items').select('*').order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('client_decisions').select('*').neq('status', 'Received'),
      supabase.from('schedule_change_requests').select('*').eq('status', 'Pending'),
    ]);

    // Load latest task_responses for Needs Review / Ready for Review tasks so we can show
    // "Question from [Name]" or "Response from [Name]" in the Action Board subtitle
    const reviewTaskIds = (taskRes.data || [])
      .filter((t: Task) => t.status === 'Needs Review' || t.status === 'Ready for Review')
      .map((t: Task) => t.id);

    // Map: taskId → { response_type, responder_name, response_text }
    const taskLatestResponseMap = new Map<string, { response_type: string; responder_name: string; response_text: string }>();
    if (reviewTaskIds.length > 0) {
      const { data: respData } = await supabase
        .from('task_responses')
        .select('task_id, response_type, responder_user_id, response_text, created_at')
        .in('task_id', reviewTaskIds)
        .neq('response_type', 'admin_reply')
        .order('created_at', { ascending: false });

      if (respData && respData.length > 0) {
        // Get unique responder IDs
        const responderIds = [...new Set(respData.map((r: any) => r.responder_user_id).filter(Boolean))];
        const nameMap = new Map<string, string>();
        if (responderIds.length > 0) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', responderIds);
          (profileData || []).forEach((p: any) => nameMap.set(p.id, p.full_name));
        }
        // Keep only the most recent non-admin response per task
        respData.forEach((r: any) => {
          if (!taskLatestResponseMap.has(r.task_id)) {
            taskLatestResponseMap.set(r.task_id, {
              response_type: r.response_type,
              responder_name: nameMap.get(r.responder_user_id) || 'Subcontractor',
              response_text: r.response_text || '',
            });
          }
        });
      }
    }

    // Only include records from active operational projects (not deleted, archived, or completed)
    const allProjects = (projRes.data || []) as { id: string; project_name: string; status: string; is_archived: boolean; is_deleted: boolean }[];
    const activeProjects = allProjects.filter(p =>
      p.is_deleted !== true && p.is_archived !== true &&
      p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted'
    );
    const activeProjectIds = new Set(activeProjects.map(p => p.id));

    setProjects(activeProjects.map(p => ({ id: p.id, project_name: p.project_name })));
    setUsers(usersRes.data || []);

    const pmap: Record<string, string> = {};
    activeProjects.forEach(p => { pmap[p.id] = p.project_name; });

    // Helper to skip records from inactive projects
    function inActiveProject(projectId: string) { return activeProjectIds.has(projectId); }

    const dbItems: ActionItemRecord[] = dbItemsRes.data || [];
    const dbBySourceId: Record<string, ActionItemRecord> = {};
    dbItems.forEach(d => { if (d.source_id) dbBySourceId[d.source_id] = d; });

    const items: ActionItem[] = [];

    function mergeDb(sourceId: string, base: Omit<ActionItem, 'status'|'notes'|'assignedUserId'|'assignedRole'|'snoozedUntil'|'resolvedAt'|'dbId'>, forceOpen = false): ActionItem {
      const db = dbBySourceId[sourceId];
      // forceOpen: source record is still actively pending — a stale 'Done' in action_items must not suppress it
      const resolvedStatus = (db?.status as ActionItem['status']) || 'Open';
      const effectiveStatus = forceOpen && resolvedStatus === 'Done' ? 'Open' : resolvedStatus;
      return {
        ...base,
        dbId: db?.id,
        status: effectiveStatus,
        notes: db?.notes || '',
        assignedUserId: db?.assigned_user_id,
        assignedRole: db?.assigned_role || '',
        snoozedUntil: db?.snoozed_until,
        resolvedAt: effectiveStatus === 'Open' ? undefined : db?.resolved_at,
      };
    }

    // Tasks — Needs Review (client/sub requests pending admin/GC action)
    (taskRes.data || [] as Task[]).forEach((t: Task) => {
      if (!inActiveProject(t.project_id)) return;
      if (t.status === 'Needs Review' || t.status === 'Ready for Review') {
        if (isSub) return; // Sub shouldn't see all review requests on the board
        const sid = `task-review-${t.id}`;

        // Build a rich subtitle showing who responded and with what type
        const latestResp = taskLatestResponseMap.get(t.id);
        let subtitle: string;
        if (latestResp) {
          const typeLabel = latestResp.response_type === 'question' ? 'Question'
            : latestResp.response_type === 'accepted' ? 'Accepted'
            : latestResp.response_type === 'declined' ? 'Declined'
            : latestResp.response_type === 'material_list' ? 'Material List'
            : latestResp.response_type === 'quote' ? 'Quote'
            : latestResp.response_type === 'daily_update' ? 'Daily Update'
            : 'Response';
          const preview = latestResp.response_text.replace(/^\[[A-Z \/]+\]\n?/, '').trim().slice(0, 60);
          subtitle = `${typeLabel} from ${latestResp.responder_name}${preview ? ` · "${preview}${preview.length >= 60 ? '…' : ''}"` : ''}`;
        } else {
          subtitle = `${t.status} · ${t.task_type || t.category}${t.created_by_role ? ` · from ${t.created_by_role === 'CLIENT' ? 'Client' : t.created_by_role === 'SUBCONTRACTOR' ? 'Subcontractor' : t.created_by_role}` : ''}`;
        }

        items.push(mergeDb(sid, {
          id: sid, type: 'task',
          priority: latestResp?.response_type === 'question' ? 'high' : 'medium',
          filter: 'needs-review',
          title: t.task_name,
          subtitle,
          project: pmap[t.project_id] || 'Unknown', projectId: t.project_id,
          detail: latestResp?.response_text.replace(/^\[[A-Z \/]+\]\n?/, '').trim() || t.internal_notes || t.client_visible_notes || undefined,
          dueDate: t.planned_finish_date || undefined,
        }));
        return; // Don't double-count in overdue/blocked below
      }
    });

    // Tasks — overdue, due today, due soon, blocked
    (taskRes.data || [] as Task[]).forEach((t: Task) => {
      if (!inActiveProject(t.project_id)) return;
      if (t.status === 'Needs Review' || t.status === 'Ready for Review') return; // handled above
      if (isSub && t.assigned_role !== 'SUBCONTRACTOR') return;
      const overdue  = t.planned_finish_date && t.planned_finish_date < today;
      const dueToday = t.planned_finish_date && t.planned_finish_date === today;
      const dueSoon  = t.planned_finish_date && t.planned_finish_date > today && t.planned_finish_date <= threeDays;
      const blocked  = !!t.blocked_reason;
      if (overdue || dueToday || dueSoon || blocked) {
        const sid = `task-${t.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'task',
          priority: overdue || blocked ? 'high' : 'medium',
          filter: blocked ? 'critical' : overdue ? 'overdue' : dueToday ? 'due-today' : 'follow-up',
          title: t.task_name,
          subtitle: `Status: ${t.status}${t.delay_days > 0 ? ` · +${t.delay_days}d delayed` : ''}`,
          project: pmap[t.project_id] || 'Unknown', projectId: t.project_id,
          detail: t.blocked_reason || t.delay_reason || undefined,
          dueDate: t.planned_finish_date || undefined,
        }));
      }
    });

    // Inspections
    (insRes.data || []).forEach((i: Inspection) => {
      if (!inActiveProject(i.project_id)) return;
      const failed = ['Failed', 'Correction Required'].includes(i.result);
      if (failed || i.correction_required) {
        const sid = `ins-${i.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'inspection', priority: 'high', filter: 'critical',
          title: `${i.inspection_type} Inspection`, subtitle: `Result: ${i.result}`,
          project: pmap[i.project_id] || 'Unknown', projectId: i.project_id,
          detail: i.correction_notes || i.delay_reason || undefined,
        }));
      } else if (['Scheduled', 'Reinspection Scheduled', 'Reinspection Required'].includes(i.result)) {
        const sid = `ins-${i.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'inspection', priority: 'medium',
          filter: i.scheduled_date === today ? 'due-today' : 'follow-up',
          title: `${i.inspection_type} Inspection`, subtitle: `Status: ${i.result}`,
          project: pmap[i.project_id] || 'Unknown', projectId: i.project_id,
          dueDate: i.scheduled_date || i.reinspection_scheduled_date || undefined,
        }));
      }
    });

    // Payments
    (pmtRes.data || []).forEach((p: PaymentMilestone) => {
      if (!inActiveProject(p.project_id)) return;
      const overdue  = p.status === 'Overdue' || (p.due_date && p.due_date < today);
      const dueToday = p.due_date && p.due_date === today;
      const hold     = p.work_hold_required || p.status === 'Payment Hold';
      if (hold || overdue) {
        const sid = `pmt-${p.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'payment', priority: 'high', filter: hold ? 'critical' : 'overdue',
          title: p.milestone_name, subtitle: `$${p.amount.toLocaleString()} · ${p.status}`,
          project: pmap[p.project_id] || 'Unknown', projectId: p.project_id,
          detail: hold ? 'Work hold active — do not proceed until payment received' : undefined,
          dueDate: p.due_date || undefined,
        }));
      } else if (dueToday || p.status === 'Due Soon' || p.status === 'Invoice Sent') {
        const sid = `pmt-${p.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'payment', priority: 'medium', filter: dueToday ? 'due-today' : 'follow-up',
          title: p.milestone_name, subtitle: `$${p.amount.toLocaleString()} · ${p.status}`,
          project: pmap[p.project_id] || 'Unknown', projectId: p.project_id,
          dueDate: p.due_date || undefined,
        }));
      }
    });

    // Permits
    (perRes.data || []).forEach((p: Permit) => {
      if (!inActiveProject(p.project_id)) return;
      if (['Rejected', 'Correction Requested', 'Revision Needed', 'Expired'].includes(p.permit_status)) {
        const sid = `per-${p.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'permit', priority: 'high', filter: 'critical',
          title: `${p.permit_type || 'Permit'} — ${p.permit_status}`,
          subtitle: p.permit_number ? `#${p.permit_number}` : 'No permit number',
          project: pmap[p.project_id] || 'Unknown', projectId: p.project_id,
          detail: p.revision_notes || p.delay_reason || undefined,
        }));
      } else if (p.permit_delay_expected) {
        const sid = `per-${p.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'permit', priority: 'medium', filter: 'follow-up',
          title: `${p.permit_type || 'Permit'} — Delay Expected`, subtitle: p.permit_status,
          project: pmap[p.project_id] || 'Unknown', projectId: p.project_id,
          detail: p.delay_reason || undefined,
        }));
      }
    });

    // RFIs
    (rfiRes.data || []).forEach((r: RFI) => {
      if (!inActiveProject(r.project_id)) return;
      const overdue  = r.due_date && r.due_date < today;
      const dueToday = r.due_date && r.due_date === today;
      if (overdue || dueToday || r.delay_expected) {
        const sid = `rfi-${r.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'rfi', priority: overdue ? 'high' : 'medium',
          filter: overdue ? 'overdue' : dueToday ? 'due-today' : 'follow-up',
          title: r.question_title, subtitle: `Assigned to: ${r.assigned_to || 'Unassigned'}`,
          project: pmap[r.project_id] || 'Unknown', projectId: r.project_id,
          dueDate: r.due_date || undefined,
        }));
      }
    });

    // Incidents
    (incRes.data || []).forEach((i: Incident) => {
      if (!inActiveProject(i.project_id)) return;
      const critical = i.severity_level === 'Critical' || i.severity_level === 'High';
      if (critical || i.work_hold_required || i.insurance_claim_needed) {
        const sid = `inc-${i.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'incident', priority: critical ? 'high' : 'medium',
          filter: i.work_hold_required ? 'critical' : 'follow-up',
          title: i.incident_title, subtitle: `${i.severity_level} · ${i.incident_status}`,
          project: pmap[i.project_id] || 'Unknown', projectId: i.project_id,
          detail: i.resolution_plan || undefined,
        }));
      }
    });

    // Delays
    if (!isSub) {
      (delayRes.data || []).forEach((d: any) => {
        if (!inActiveProject(d.project_id)) return;
        const proj = pmap[d.project_id] || 'Unknown';
        if (d.client_response_status === 'Client Requested Review') {
          const sid = `delay-review-req-${d.id}`;
          items.push(mergeDb(sid, {
            id: sid, type: 'delay', priority: 'high', filter: 'critical',
            title: `Client Requested Review on Schedule Impact — ${d.delay_category}`,
            subtitle: 'Client has requested a review — response required',
            project: proj, projectId: d.project_id,
            detail: "Open the project Schedule Impacts tab to review and respond.",
          }, true));
        }
        if (d.client_response_status === 'Question Submitted') {
          const sid = `delay-question-${d.id}`;
          items.push(mergeDb(sid, {
            id: sid, type: 'delay', priority: 'high', filter: 'critical',
            title: `Client Question on Schedule Impact — ${d.delay_category}`,
            subtitle: 'Client submitted a question — review and respond',
            project: proj, projectId: d.project_id,
            detail: 'Review the client question and respond via the project Schedule Impacts tab.',
          }, true));
        }
        if (d.schedule_impact_status === 'Pending Admin Review') {
          const sid = `delay-review-${d.id}`;
          const delayLabel = d.estimated_delay_days > 0 ? `+${d.estimated_delay_days}d` : null;
          items.push(mergeDb(sid, {
            id: sid, type: 'delay', priority: 'high', filter: 'critical',
            title: `Admin Review Needed: Schedule Impact${delayLabel ? ` ${delayLabel}` : ''} — ${d.delay_category}`,
            subtitle: `Est. ${d.estimated_delay_days}d delay — pending admin approval`,
            project: proj, projectId: d.project_id,
            detail: d.internal_reason || undefined,
          }, true));
        }
        if (d.client_visibility_status === 'Pending Admin Approval') {
          const sid = `delay-approve-${d.id}`;
          items.push(mergeDb(sid, {
            id: sid, type: 'delay', priority: 'medium', filter: 'follow-up',
            title: `Approve Client Delay Notice: ${d.delay_category}`,
            subtitle: 'Draft notice waiting for your approval',
            project: proj, projectId: d.project_id,
            detail: d.client_safe_reason || undefined,
          }));
        }
        if (d.client_response_required && d.client_response_status === 'Pending Response' && d.response_deadline) {
          const deadline = new Date(d.response_deadline);
          const hoursLeft = (deadline.getTime() - Date.now()) / 3600000;
          if (hoursLeft >= 0 && hoursLeft <= 24) {
            const sid = `delay-deadline-${d.id}`;
            items.push(mergeDb(sid, {
              id: sid, type: 'delay', priority: 'high', filter: 'due-today',
              title: `Response Deadline Soon: ${d.delay_category}`,
              subtitle: `Client hasn't responded — deadline in ${Math.ceil(hoursLeft)}h`,
              project: proj, projectId: d.project_id,
              dueDate: deadline.toISOString().split('T')[0],
              detail: d.auto_acknowledgement_enabled ? 'Auto-acknowledgement will trigger at deadline.' : undefined,
            }));
          }
        }
      });
    }

    // Client Decisions — open decisions pending client response appear as Needs Review
    (decisionsRes.data || [] as ClientDecision[]).forEach((d: ClientDecision) => {
      if (!inActiveProject(d.project_id)) return;
      const overdue = d.needed_by_date && d.needed_by_date < today;
      const sid = `decision-${d.id}`;
      items.push(mergeDb(sid, {
        id: sid, type: 'manual',
        priority: overdue ? 'high' : 'medium',
        filter: 'decisions',
        title: d.decision_title,
        subtitle: `Client Decision · Status: ${d.status}${d.needed_by_date ? ` · Needed by ${fmt(d.needed_by_date)}` : ''}`,
        project: pmap[d.project_id] || 'Unknown', projectId: d.project_id,
        detail: d.description || d.client_visible_note || undefined,
        dueDate: d.needed_by_date || undefined,
      }));
    });

    // Schedule Change Requests — pending approvals appear as Follow Up
    if (!isSub) {
      (schedRes.data || []).forEach((s: any) => {
        if (!inActiveProject(s.project_id)) return;
        const sid = `sched-${s.id}`;
        items.push(mergeDb(sid, {
          id: sid, type: 'manual',
          priority: 'medium',
          filter: 'follow-up',
          title: `Schedule Change Request — ${s.change_type || 'Change'}`,
          subtitle: `Requested by ${s.requested_by_name || 'Unknown'} · Pending Approval`,
          project: pmap[s.project_id] || 'Unknown', projectId: s.project_id,
          detail: s.reason || s.description || undefined,
        }));
      });
    }

    // Manual items from action_items table
    // If project_id is set, only include items from active projects; workspace-level items (no project_id) always appear
    dbItems
      .filter(d => (d.source_type === 'manual' || !d.source_id) && (!d.project_id || inActiveProject(d.project_id)))
      .forEach(d => {
        items.push({
          id: `manual-${d.id}`, dbId: d.id, type: 'manual',
          priority: (d.priority?.toLowerCase() as ActionItem['priority']) || 'medium',
          filter: 'follow-up',
          title: d.action_title, subtitle: d.action_description || '',
          project: pmap[d.project_id || ''] || (d.project_id ? 'Unknown' : '—'),
          projectId: d.project_id || '',
          dueDate: d.due_date || undefined,
          detail: d.ai_recommended_next_step || undefined,
          status: (d.status as ActionItem['status']) || 'Open',
          notes: d.notes || '',
          assignedUserId: d.assigned_user_id,
          assignedRole: d.assigned_role || '',
          snoozedUntil: d.snoozed_until,
          resolvedAt: d.resolved_at,
        });
      });

    items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    const active = items.filter(i => i.status !== 'Done' && !(i.snoozedUntil && i.snoozedUntil >= today));
    const done   = items.filter(i => i.status === 'Done');

    console.log('ACTIONBOARD_CRITICAL_IDS', active.filter(a => a.filter === 'critical').map(a => a.id));
    console.log('ACTIONBOARD_NEEDS_ATTENTION_IDS', active.filter(a => a.filter === 'needs-review' || a.filter === 'critical').map(a => a.id));

    setActions(active);
    setDoneItems(done);
    setLastRefresh(new Date());
    setLoading(false);
  }

  // When data loads and we have a focusedItemId, apply filter + expand + scroll + highlight
  useEffect(() => {
    if (loading || !focusedItemId) return;

    const allLoaded = [...actions, ...doneItems];
    const target = allLoaded.find(a => a.id === focusedItemId);

    if (!target) {
      // Item not found — fall back to 'all' and show toast
      setActiveFilter('all');
      setToast('Original item could not be found or may have been resolved.');
      setFocusedItemId(null);
      return;
    }

    // If the item is in done list, switch to done view
    if (doneItems.find(a => a.id === focusedItemId)) {
      setBoardView('done');
    } else {
      setBoardView('active');
      // Apply the correct filter so the row is visible
      const correctFilter: FilterType = target.filter === 'needs-review' ? 'needs-review'
        : target.filter === 'critical' ? 'critical'
        : target.filter === 'overdue' ? 'overdue'
        : target.filter === 'due-today' ? 'due-today'
        : target.filter === 'follow-up' ? 'follow-up'
        : target.filter === 'decisions' ? 'decisions'
        : 'all';
      setActiveFilter(correctFilter);
    }

    setExpanded(focusedItemId);
    setFocusHighlight(focusedItemId);

    // Scroll after a short delay so the filter renders first
    setTimeout(() => {
      if (focusRowRef.current) {
        focusRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    // Clear highlight after 5 seconds
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      setFocusHighlight(null);
    }, 5000);

    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [loading, focusedItemId, actions.length]);

  // ── Quick actions ─────────────────────────────────────────────────────────

  async function upsertDbItem(item: ActionItem, patch: Record<string, unknown>) {
    if (item.dbId) {
      await supabase.from('action_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', item.dbId);
    } else {
      await supabase.from('action_items').insert({
        action_title: item.title,
        action_description: item.subtitle,
        project_id: item.projectId || null,
        priority: item.priority === 'high' ? 'High' : item.priority === 'medium' ? 'Medium' : 'Low',
        source_type: item.type,
        source_id: item.id,
        status: 'Open',
        ...patch,
      });
    }
    load();
  }

  // Extract the UUID from a compound delay item ID like "delay-review-{uuid}"
  function extractDelaySourceId(itemId: string): string | null {
    const prefixes = ['delay-review-req-', 'delay-question-', 'delay-review-', 'delay-approve-', 'delay-impact-', 'delay-deadline-'];
    for (const p of prefixes) {
      if (itemId.startsWith(p)) return itemId.slice(p.length);
    }
    return null;
  }

  async function handleResolve(item: ActionItem) {
    const isDone = item.status === 'Done';
    await upsertDbItem(item, {
      status: isDone ? 'Open' : 'Done',
      resolved_at: isDone ? null : new Date().toISOString(),
      resolved_by_user_id: isDone ? null : (profile?.id ?? null),
    });
    // For delay-type items, also update the underlying project_delay_reasons record
    // so it no longer drives a forceOpen override on the next page load.
    if (!isDone && item.type === 'delay') {
      const delayId = extractDelaySourceId(item.id);
      if (delayId) {
        await supabase.from('project_delay_reasons').update({
          schedule_impact_status: 'Closed',
          status: 'Resolved',
          resolved_at: new Date().toISOString(),
        }).eq('id', delayId);
      }
    }
    setToast(isDone ? 'Item reopened.' : 'Item marked resolved.');
  }

  async function handleSnooze(item: ActionItem, days: number) {
    const until = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    await upsertDbItem(item, { snoozed_until: until, status: 'Snoozed' });
  }

  async function handleAssign(item: ActionItem, userId: string) {
    await upsertDbItem(item, { assigned_user_id: userId || null });
  }

  async function handleNote(item: ActionItem, note: string) {
    await upsertDbItem(item, { notes: note });
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0];
  const q = search.trim().toLowerCase();
  const currentList = boardView === 'active' ? actions : doneItems;

  // "Needs Attention" = needs-review + critical items (what requires immediate admin action)
  function matchesFilter(a: ActionItem, f: FilterType): boolean {
    if (f === 'all') return true;
    if (f === 'needs-attention') return a.filter === 'needs-review' || a.filter === 'critical';
    return a.filter === f;
  }

  const filtered = currentList
    .filter(a => boardView === 'done' || matchesFilter(a, activeFilter))
    .filter(a => !q || a.title.toLowerCase().includes(q) || a.project.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q) || typeLabel(a.type).toLowerCase().includes(q));

  // "Resolved today" = items marked Done with resolvedAt timestamp on today's date only
  const resolvedToday = doneItems.filter(i => i.resolvedAt && i.resolvedAt.startsWith(today)).length;

  // Filter counts: derived from the active list WITHOUT search so pill numbers are stable.
  // Each count uses the same matchesFilter helper as the rendered list.
  const filterCounts: Record<FilterType, number> = {
    all:                 actions.length,
    'needs-attention':   actions.filter(a => matchesFilter(a, 'needs-attention')).length,
    'needs-review':      actions.filter(a => a.filter === 'needs-review').length,
    decisions:           actions.filter(a => a.filter === 'decisions').length,
    critical:            actions.filter(a => a.filter === 'critical').length,
    overdue:             actions.filter(a => a.filter === 'overdue').length,
    'due-today':         actions.filter(a => a.filter === 'due-today').length,
    'follow-up':         actions.filter(a => a.filter === 'follow-up').length,
  };

  const totalToday      = actions.length + resolvedToday;
  const completedToday  = resolvedToday;
  const completionPct   = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
  const userMap         = Object.fromEntries(users.map(u => [u.id, u.full_name]));

  return (
    <div className="p-5 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Action Board</h1>
          </div>
          <p className="text-sm text-slate-400 pl-9">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            &nbsp;· {actions.length} active · {resolvedToday} resolved today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-ghost text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {!isSub && (
            <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* Daily progress bar */}
      {totalToday > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Today's Progress</span>
              <span className="text-xs font-bold text-slate-900">{completedToday} / {totalToday} resolved</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${completionPct}%`,
                  background: completionPct === 100 ? '#10b981' : completionPct >= 60 ? '#3b82f6' : '#f59e0b',
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-2xl font-bold tabular-nums ${completionPct === 100 ? 'text-emerald-600' : 'text-slate-900'}`}>
              {completionPct}%
            </span>
            {completionPct === 100 && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(['active', 'done'] as BoardView[]).map(v => (
            <button
              key={v}
              onClick={() => setBoardView(v)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                boardView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v === 'active' ? `Active (${actions.length})` : `Resolved (${doneItems.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items, projects, types..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
        />
      </div>

      {/* Filters */}
      {boardView === 'active' && (
        <>
          {/* Alert Center context banner */}
          {focusedItemId && focusedAlertTitle && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-xs text-blue-700 font-medium flex-1">
                Opened from Alert Center: <span className="font-bold">{focusedAlertTitle}</span>
              </span>
              <button
                onClick={() => { setFocusedItemId(null); setFocusedAlertTitle(null); setFocusHighlight(null); setActiveFilter('all'); }}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" />
                Show all
              </button>
            </div>
          )}
          {/* Filter context banner — shown when navigated from dashboard with a pre-set filter */}
          {activeFilter !== 'all' && !focusedItemId && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-xs text-amber-700 font-medium flex-1">
                {activeFilter === 'needs-attention'
                  ? 'Showing items needing attention from Dashboard.'
                  : <>Showing <span className="font-bold">{FILTERS.find(f => f.id === activeFilter)?.label}</span> items</>
                }
              </span>
              <button
                onClick={() => setActiveFilter('all')}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" />
                Show all
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                activeFilter === f.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
              }`}
            >
              {f.label}
              {filterCounts[f.id] > 0 && (
                <span className={`ml-1.5 text-[10px] font-bold ${activeFilter === f.id ? 'opacity-70' : 'text-slate-400'}`}>
                  {filterCounts[f.id]}
                </span>
              )}
            </button>
          ))}
          </div>
        </>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Loading action items...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${boardView === 'done' ? 'bg-slate-50' : 'bg-emerald-50'}`}>
              <CheckSquare className={`w-6 h-6 ${boardView === 'done' ? 'text-slate-400' : 'text-emerald-500'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">
              {boardView === 'done'
                ? 'No resolved items yet'
                : activeFilter === 'all'
                  ? 'All clear for today'
                  : activeFilter === 'needs-review'
                    ? 'No items need review'
                    : `No ${FILTERS.find(f => f.id === activeFilter)?.label.toLowerCase()} items`}
            </p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              {boardView === 'done'
                ? 'Mark items as done to track your daily progress.'
                : activeFilter === 'all'
                  ? 'No overdue tasks, failed inspections, or pending issues.'
                  : 'No items match this filter. Try switching to All.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="w-5 px-4 py-3"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Assigned</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Due</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(item => {
                  const Icon = typeIcon(item.type);
                  const isExpanded = expanded === item.id;
                  const isOverdue  = item.dueDate && item.dueDate < today;
                  const isDone     = item.status === 'Done';
                  const assigneeName = item.assignedUserId ? userMap[item.assignedUserId] : null;
                  const isFocused = focusHighlight === item.id;

                  return (
                    <>
                      <tr
                        key={item.id}
                        ref={isFocused ? focusRowRef : undefined}
                        className={`transition-colors cursor-pointer ${isDone ? 'opacity-55' : ''} ${
                          isFocused
                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-300 hover:bg-blue-50'
                            : 'hover:bg-slate-50/60'
                        }`}
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                      >
                        <td className="px-4 py-3.5">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                        </td>

                        {/* Title */}
                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="flex items-start gap-2.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${priorityDot(item.priority)}`} />
                            <div className="min-w-0">
                              {isFocused && (
                                <span className="inline-block text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mb-1">
                                  From Alert Center
                                </span>
                              )}
                              <p className={`text-sm text-slate-900 leading-snug ${isDone ? 'line-through text-slate-400' : ''}`}>
                                {item.title}
                              </p>
                              <p className="text-xs text-slate-400 truncate mt-0.5 max-w-[200px]">{item.subtitle}</p>
                              {item.notes && (
                                <p className="text-[11px] text-blue-600 mt-0.5 truncate max-w-[200px] flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3 flex-shrink-0" />{item.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${typeBadgeColor(item.type)}`}>
                              {typeLabel(item.type)}
                            </span>
                          </div>
                        </td>

                        {/* Project */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="text-xs text-slate-500 truncate max-w-[140px] block">{item.project}</span>
                        </td>

                        {/* Category/filter badge */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${filterBadgeStyle(item.filter)}`}>
                            {item.filter.replace('-', ' ')}
                          </span>
                        </td>

                        {/* Assignee */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          {assigneeName ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-bold text-slate-600">{assigneeName.charAt(0)}</span>
                              </div>
                              <span className="text-xs text-slate-600 truncate max-w-[90px]">{assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Due date */}
                        <td className="px-4 py-3.5 hidden sm:table-cell whitespace-nowrap">
                          {item.dueDate ? (
                            <div className={`flex items-center gap-1 text-xs font-medium ${isOverdue && !isDone ? 'text-red-600' : 'text-slate-500'}`}>
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              {fmt(item.dueDate)}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Row actions */}
                        <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                          <RowActions
                            item={item}
                            users={users}
                            onResolve={() => handleResolve(item)}
                            onSnooze={days => handleSnooze(item, days)}
                            onAssign={userId => handleAssign(item, userId)}
                            onNote={note => handleNote(item, note)}
                            onViewProject={onViewProject && item.projectId
                              ? () => {
                                  // For task items, extract the original task UUID and deep-link to tasks tab
                                  const taskId = item.type === 'task'
                                    ? (item.id.startsWith('task-review-') ? item.id.slice('task-review-'.length) : item.id.startsWith('task-') ? item.id.slice('task-'.length) : undefined)
                                    : undefined;
                                  onViewProject(item.projectId, taskId ? 'tasks' : undefined, taskId);
                                }
                              : undefined}
                          />
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr key={item.id + '-exp'} className="bg-slate-50/70">
                          <td colSpan={8} className="px-8 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                              {item.detail && (
                                <div>
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1">Detail</p>
                                  <p className="text-slate-700 leading-relaxed">{item.detail}</p>
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1">Priority</p>
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${priorityDot(item.priority)}`} />
                                  <span className="text-slate-700 font-medium">{priorityLabel(item.priority)}</span>
                                </div>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1">Project</p>
                                <p className="text-slate-700">{item.project || '—'}</p>
                              </div>
                              {item.notes && (
                                <div>
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1">Note</p>
                                  <p className="text-slate-700 leading-relaxed">{item.notes}</p>
                                </div>
                              )}
                              {item.resolvedAt && (
                                <div>
                                  <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mb-1">Resolved</p>
                                  <p className="text-emerald-700 font-medium">
                                    {new Date(item.resolvedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3 text-center">
        Last refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </p>

      {showAddModal && (
        <AddItemModal
          projects={projects}
          users={users}
          onClose={() => setShowAddModal(false)}
          onSave={load}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <Toast message={toast} onDone={() => setToast('')} />
      )}
    </div>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5 pointer-events-none">
      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      {message}
    </div>
  );
}
