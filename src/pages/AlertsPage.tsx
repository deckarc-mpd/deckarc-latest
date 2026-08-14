import { useEffect, useState, useCallback } from 'react';
import { supabase, Task, Permit, Inspection, ClientDecision, PaymentMilestone } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  RefreshCw, X, Search, ArrowDown, ArrowUp,
  MessageSquare, ChevronRight, CheckCheck, Calendar, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertItem {
  id:               string;
  level:            'red' | 'yellow';
  type:             'task_question' | 'task_material_list' | 'task_quote' | 'task_declined'
                  | 'task_daily_update' | 'task_response_submitted' | 'admin_reply'
                  | 'task_overdue' | 'task_blocked' | 'permit_issue' | 'inspection_failed'
                  | 'client_decision' | 'payment_issue';
  title:            string;      // Human-readable "Miguel asked about Foundation Work"
  project:          string;
  projectId:        string;
  detail:           string;      // Short preview text shown in quotes
  createdAt:        string;      // ISO for sorting
  actionBoardItemId: string;
  actionFilter:     'critical' | 'overdue' | 'due-today' | 'needs-review' | 'follow-up' | 'decisions';
  actionLabel:      string;
  // Notification-backed
  notificationId?:  string;
  taskId?:          string;
  actionTarget?:    string;
  isReadFromNotif?: boolean;
  // Grouping
  groupCount?:      number;
  groupIds?:        string[];    // notification IDs in the group (for bulk mark-read)
}

type SortDir    = 'desc' | 'asc';
type DateFilter = 'all' | 'today' | '7d' | '30d';

const DATE_LABELS: Record<DateFilter, string> = {
  all: 'All Time', today: 'Today', '7d': 'Last 7 Days', '30d': 'Last 30 Days',
};

// ─── Title helpers ────────────────────────────────────────────────────────────

function extractName(title: string): string | null {
  // "Question from Miguel" → "Miguel"
  // "Task Declined by Miguel" → "Miguel"
  const fromMatch = title.match(/from\s+(.+?)(?:\s*\(|$)/i);
  const byMatch   = title.match(/by\s+(.+?)(?:\s*\(|$)/i);
  const who = fromMatch?.[1]?.trim() || byMatch?.[1]?.trim() || null;
  // Reject role-only fallbacks
  if (!who || /^(admin|subcontractor|gc|manager|homeowner|client)$/i.test(who)) return null;
  return who;
}

function buildNotifTitle(notifType: string, storedTitle: string, taskName: string | null): string {
  const who  = extractName(storedTitle);
  const task = taskName;

  switch (notifType) {
    case 'task_question':
      if (who && task) return `${who} asked a question about ${task}`;
      if (who)         return `${who} asked a question`;
      if (task)        return `New question about ${task}`;
      return 'New question from subcontractor';

    case 'task_material_list':
      if (who && task) return `${who} submitted a material list for ${task}`;
      if (task)        return `Material list submitted for ${task}`;
      return 'Material list submitted';

    case 'task_quote':
      if (who && task) return `${who} submitted a quote for ${task}`;
      if (task)        return `Quote submitted for ${task}`;
      return 'Quote submitted';

    case 'task_declined':
      if (who && task) return `${who} declined ${task}`;
      if (task)        return `${task} was declined`;
      return 'Task declined by subcontractor';

    case 'task_daily_update':
      if (who && task) return `${who} posted an update on ${task}`;
      if (task)        return `Daily update on ${task}`;
      return 'Daily update posted';

    case 'admin_reply': {
      // "Follow-Up Question from Admin" → different label
      const isFollowUp = storedTitle?.toLowerCase().includes('follow-up') || storedTitle?.toLowerCase().includes('question from admin');
      const adminName = extractName(storedTitle);
      if (isFollowUp) {
        if (adminName && task) return `${adminName} asked a follow-up question on ${task}`;
        if (task)              return `Follow-up question on ${task}`;
        return 'Follow-up question from admin';
      }
      if (adminName && task) return `${adminName} replied to ${task}`;
      if (task)              return `Admin replied to ${task}`;
      return 'Admin replied';
    }

    case 'task_response_submitted':
      if (who && task) return `${who} responded to ${task}`;
      if (task)        return `Response received on ${task}`;
      return 'Response submitted';

    default:
      return storedTitle || 'New notification';
  }
}

function buildGroupTitle(notifType: string, count: number, taskName: string | null): string {
  const task = taskName || 'this task';
  switch (notifType) {
    case 'task_question':      return `${count} new questions about ${task}`;
    case 'task_material_list': return `${count} material lists submitted for ${task}`;
    case 'task_quote':         return `${count} quotes submitted for ${task}`;
    case 'task_declined':      return `${count} declines for ${task}`;
    case 'task_daily_update':  return `${count} updates posted on ${task}`;
    case 'admin_reply':        return `${count} admin replies on ${task}`;
    default:                   return `${count} new responses on ${task}`;
  }
}

// ─── Date formatting ──────────────────────────────────────────────────────────

function fmtDateTime(d: string) {
  const date      = new Date(d);
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const time      = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === today.toDateString())     return time;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
}

function fmt(d: string) {
  return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Grouping ─────────────────────────────────────────────────────────────────
// Groups notification alerts with the same taskId + notifType into one row.
// Only groups items where ALL are unread (read items stay individual).

function groupNotifAlerts(items: AlertItem[]): AlertItem[] {
  const notifItems  = items.filter(i => i.isReadFromNotif && i.taskId);
  const otherItems  = items.filter(i => !i.isReadFromNotif || !i.taskId);

  // Map: groupKey → sorted list (newest first)
  const buckets = new Map<string, AlertItem[]>();
  notifItems.forEach(item => {
    const key = `${item.taskId}:${item.type}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  });

  const collapsed: AlertItem[] = [];
  const added = new Set<string>();

  // Preserve original order — iterate notifItems to keep sort stable
  notifItems.forEach(item => {
    const key = `${item.taskId}:${item.type}`;
    if (added.has(key)) return;
    added.add(key);

    const group = (buckets.get(key) || [item]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const allUnread = group.every(g => !g.isReadFromNotif); // all checked later via readMap

    if (group.length <= 1) {
      collapsed.push(item);
      return;
    }

    const latest = group[0];
    collapsed.push({
      ...latest,
      groupCount: group.length,
      groupIds:   group.map(g => g.notificationId).filter(Boolean) as string[],
    });
  });

  return [...otherItems, ...collapsed];
}

// ─── Level badge (dot only) ───────────────────────────────────────────────────

function LevelDot({ level, isRead }: { level: AlertItem['level']; isRead: boolean }) {
  if (isRead)             return <span className="w-2 h-2 rounded-full bg-slate-200 flex-shrink-0 mt-1" />;
  if (level === 'red')    return <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 mt-1 ring-2 ring-red-100" />;
  return                         <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0 mt-1" />;
}

// ─── Left border color ────────────────────────────────────────────────────────

function leftBorder(item: AlertItem, isRead: boolean): string {
  if (isRead) return 'border-l-[3px] border-l-slate-100';
  const t = item.type;
  if (t === 'task_question' || t === 'admin_reply' || t === 'task_response_submitted' ||
      t === 'task_daily_update' || t === 'task_material_list' || t === 'task_quote' || t === 'task_declined')
    return 'border-l-[3px] border-l-blue-400';
  if (item.level === 'red')    return 'border-l-[3px] border-l-red-400';
  return                              'border-l-[3px] border-l-amber-400';
}

// ─── Action button style ──────────────────────────────────────────────────────

function isConversationType(t: AlertItem['type']): boolean {
  return ['task_question','admin_reply','task_response_submitted','task_daily_update','task_material_list','task_quote','task_declined'].includes(t);
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      {count > 0 && (
        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AlertsPage({
  onNavigateToActionBoardItem,
  onOpenTaskConversation,
}: {
  onNavigateToActionBoardItem?: (params: {
    focusItemId: string;
    filter: AlertItem['actionFilter'];
    alertId: string;
    alertTitle: string;
  }) => void;
  onOpenTaskConversation?: (projectId: string, taskId: string) => void;
}) {
  const { profile } = useAuth();

  const [alerts,       setAlerts]       = useState<AlertItem[]>([]);
  const [notifReadMap, setNotifReadMap] = useState<Record<string, string>>({});
  const [readMap,      setReadMap]      = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [showRead,     setShowRead]     = useState(true);
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [dateFilter,   setDateFilter]   = useState<DateFilter>('all');
  const [page,         setPage]         = useState(1);
  const [toast,        setToast]        = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 50;

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, showRead, sortDir, dateFilter]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const today      = new Date().toISOString().split('T')[0];
    const twoDaysOut = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

    const [tasksRes, permitsRes, inspectionsRes, decisionsRes, paymentsRes, projectsRes, readsRes, notifsRes] =
      await Promise.all([
        supabase.from('tasks').select('*').eq('is_deleted', false),
        supabase.from('permits').select('*'),
        supabase.from('inspections').select('*'),
        supabase.from('client_decisions').select('*'),
        supabase.from('payment_milestones').select('*'),
        supabase.from('projects').select('id, project_name, status, is_archived, is_deleted, permits_applicability'),
        supabase.from('alert_reads').select('alert_id, read_at'),
        supabase.from('notifications')
          .select('id, project_id, task_id, notification_type, title, message, detail, source_type, source_id, action_label, action_target, status, read_at, created_at')
          .eq('user_id', profile.id)
          .in('notification_type', ['task_question','task_material_list','task_quote','task_declined','task_daily_update','task_response_submitted','admin_reply'])
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

    const rm: Record<string, string> = {};
    (readsRes.data || []).forEach((r: { alert_id: string; read_at: string }) => { rm[r.alert_id] = r.read_at; });
    setReadMap(rm);

    const nrm: Record<string, string> = {};
    (notifsRes.data || []).forEach((n: any) => {
      if (n.status === 'read' || n.read_at) nrm[n.id] = n.read_at || n.created_at;
    });
    setNotifReadMap(nrm);

    const allProjects = (projectsRes.data || []) as {
      id: string; project_name: string; status: string;
      is_archived: boolean; is_deleted: boolean; permits_applicability?: string;
    }[];
    const activeProjects    = allProjects.filter(p =>
      p.is_deleted !== true && p.is_archived !== true &&
      p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted'
    );
    const activeProjectIds  = new Set(activeProjects.map(p => p.id));
    const permitApplicable  = new Set(activeProjects.filter(p => p.permits_applicability !== 'Not Applicable').map(p => p.id));
    const projectMap        = new Map(activeProjects.map(p => [p.id, p.project_name]));
    const taskMap           = new Map((tasksRes.data || []).map((t: Task) => [t.id, t]));

    const raw: AlertItem[] = [];

    // ── Notification-backed alerts ────────────────────────────────────────────
    (notifsRes.data || []).forEach((n: any) => {
      if (n.project_id && !activeProjectIds.has(n.project_id)) return;
      const project  = projectMap.get(n.project_id) || 'Unknown Project';
      const task     = n.task_id ? (taskMap.get(n.task_id) as Task | undefined) : null;
      const taskName = task?.task_name || null;
      const title    = buildNotifTitle(n.notification_type, n.title || '', taskName);
      const detail   = n.detail || n.message || '';
      const abItemId = n.source_id || (n.task_id ? `task-review-${n.task_id}` : `notif-${n.id}`);

      raw.push({
        id:               `notif-${n.id}`,
        level:            'yellow',
        type:             n.notification_type as AlertItem['type'],
        title,
        project,
        projectId:        n.project_id || '',
        detail:           detail.slice(0, 180),
        createdAt:        n.created_at,
        actionBoardItemId: abItemId,
        actionFilter:     'needs-review',
        actionLabel:      'Open Conversation',
        notificationId:   n.id,
        taskId:           n.task_id || undefined,
        actionTarget:     n.action_target || 'task_conversation',
        isReadFromNotif:  true,
      });
    });

    // ── DB-derived alerts ─────────────────────────────────────────────────────

    (tasksRes.data || []).forEach((t: Task) => {
      if (!activeProjectIds.has(t.project_id)) return;
      const isPermitTask = t.task_type === 'Permit Task' || t.category === 'Permit' || t.category === 'Inspection';
      if (isPermitTask && !permitApplicable.has(t.project_id)) return;
      const project = projectMap.get(t.project_id) || 'Unknown Project';

      if (t.status !== 'Completed' && t.planned_finish_date) {
        if (t.planned_finish_date < today)
          raw.push({ id: `task-${t.id}`, level: 'red', type: 'task_overdue', title: `${t.task_name} is Overdue`, project, projectId: t.project_id, detail: `Due ${fmt(t.planned_finish_date)}`, createdAt: t.planned_finish_date + 'T00:00:00Z', actionBoardItemId: `task-${t.id}`, actionFilter: 'overdue', actionLabel: 'Open Task' });
        else if (t.planned_finish_date <= twoDaysOut)
          raw.push({ id: `task-due-${t.id}`, level: 'yellow', type: 'task_overdue', title: `${t.task_name} Due Soon`, project, projectId: t.project_id, detail: `Due ${fmt(t.planned_finish_date)}`, createdAt: t.planned_finish_date + 'T00:00:00Z', actionBoardItemId: `task-${t.id}`, actionFilter: 'due-today', actionLabel: 'Open Task' });
      }
      if (t.status === 'Blocked')
        raw.push({ id: `blocked-${t.id}`, level: 'red', type: 'task_blocked', title: `${t.task_name} is Blocked`, project, projectId: t.project_id, detail: t.blocked_reason || t.internal_notes || 'No reason provided', createdAt: t.planned_finish_date ? t.planned_finish_date + 'T00:00:00Z' : new Date().toISOString(), actionBoardItemId: `task-${t.id}`, actionFilter: 'critical', actionLabel: 'Open Task' });
    });

    (permitsRes.data || []).forEach((p: Permit) => {
      if (!permitApplicable.has(p.project_id)) return;
      const project = projectMap.get(p.project_id) || 'Unknown Project';
      if (p.permit_status === 'Rejected')
        raw.push({ id: `permit-${p.id}`, level: 'red', type: 'permit_issue', title: `${p.permit_type || 'Permit'} Rejected`, project, projectId: p.project_id, detail: 'Permit was rejected — action required', createdAt: p.submitted_date ? p.submitted_date + 'T00:00:00Z' : new Date().toISOString(), actionBoardItemId: `per-${p.id}`, actionFilter: 'critical', actionLabel: 'Open Permit' });
      else if (p.permit_status === 'Revision Required' || p.permit_status === 'Correction Requested')
        raw.push({ id: `permit-rev-${p.id}`, level: 'red', type: 'permit_issue', title: `Permit Revision Requested: ${p.permit_type || 'Permit'}`, project, projectId: p.project_id, detail: 'Revisions are required before approval', createdAt: p.submitted_date ? p.submitted_date + 'T00:00:00Z' : new Date().toISOString(), actionBoardItemId: `per-${p.id}`, actionFilter: 'critical', actionLabel: 'Open Permit' });
      else if (p.permit_required && p.permit_status === 'Not Started')
        raw.push({ id: `permit-ns-${p.id}`, level: 'yellow', type: 'permit_issue', title: `${p.permit_type || 'Permit'} Not Yet Submitted`, project, projectId: p.project_id, detail: 'Required permit has not been started', createdAt: new Date().toISOString(), actionBoardItemId: `per-${p.id}`, actionFilter: 'follow-up', actionLabel: 'Open Permit' });
    });

    (inspectionsRes.data || []).forEach((i: Inspection) => {
      if (!permitApplicable.has(i.project_id)) return;
      const project = projectMap.get(i.project_id) || 'Unknown Project';
      if (i.result === 'Failed' || i.result === 'Reinspection Required')
        raw.push({ id: `insp-${i.id}`, level: 'red', type: 'inspection_failed', title: `Inspection Failed: ${i.inspection_type}`, project, projectId: i.project_id, detail: `Result: ${i.result}`, createdAt: (i.result_date || i.scheduled_date || today) + 'T00:00:00Z', actionBoardItemId: `ins-${i.id}`, actionFilter: 'critical', actionLabel: 'Open Inspection' });
      else if (i.result === 'Not Scheduled')
        raw.push({ id: `insp-ns-${i.id}`, level: 'yellow', type: 'inspection_failed', title: `${i.inspection_type} Not Yet Scheduled`, project, projectId: i.project_id, detail: 'Inspection has not been scheduled yet', createdAt: new Date().toISOString(), actionBoardItemId: `ins-${i.id}`, actionFilter: 'follow-up', actionLabel: 'Open Inspection' });
    });

    (decisionsRes.data || []).forEach((d: ClientDecision) => {
      if (!activeProjectIds.has(d.project_id)) return;
      const project = projectMap.get(d.project_id) || 'Unknown Project';
      if (d.status !== 'Received' && d.needed_by_date) {
        if (d.needed_by_date < today)
          raw.push({ id: `dec-${d.id}`, level: 'red', type: 'client_decision', title: `Waiting for Decision: ${d.decision_title}`, project, projectId: d.project_id, detail: `Overdue since ${fmt(d.needed_by_date)}`, createdAt: d.needed_by_date + 'T00:00:00Z', actionBoardItemId: `decision-${d.id}`, actionFilter: 'decisions', actionLabel: 'Open Decision' });
        else if (d.needed_by_date <= twoDaysOut)
          raw.push({ id: `dec-due-${d.id}`, level: 'yellow', type: 'client_decision', title: `Decision Needed: ${d.decision_title}`, project, projectId: d.project_id, detail: `Needed by ${fmt(d.needed_by_date)}`, createdAt: d.needed_by_date + 'T00:00:00Z', actionBoardItemId: `decision-${d.id}`, actionFilter: 'decisions', actionLabel: 'Open Decision' });
      }
    });

    (paymentsRes.data || []).forEach((p: PaymentMilestone) => {
      if (!activeProjectIds.has(p.project_id)) return;
      const project = projectMap.get(p.project_id) || 'Unknown Project';
      if (p.status === 'Overdue')
        raw.push({ id: `pay-${p.id}`, level: 'red', type: 'payment_issue', title: `Payment Overdue: ${p.milestone_name}`, project, projectId: p.project_id, detail: `$${p.amount.toLocaleString()} overdue`, createdAt: p.due_date ? p.due_date + 'T00:00:00Z' : new Date().toISOString(), actionBoardItemId: `pmt-${p.id}`, actionFilter: 'overdue', actionLabel: 'Open Payment' });
      else if (p.status === 'Due')
        raw.push({ id: `pay-due-${p.id}`, level: 'yellow', type: 'payment_issue', title: `Payment Due: ${p.milestone_name}`, project, projectId: p.project_id, detail: `$${p.amount.toLocaleString()} due`, createdAt: p.due_date ? p.due_date + 'T00:00:00Z' : new Date().toISOString(), actionBoardItemId: `pmt-${p.id}`, actionFilter: 'due-today', actionLabel: 'Open Payment' });
    });

    setAlerts(groupNotifAlerts(raw));
    setLoading(false);
  }, [profile?.id]);

  // ── Read state ────────────────────────────────────────────────────────────────

  function isAlertRead(a: AlertItem): boolean {
    if (a.isReadFromNotif) {
      if (a.groupIds && a.groupIds.length > 0) {
        return a.groupIds.every(id => !!notifReadMap[id]);
      }
      if (a.notificationId) return !!notifReadMap[a.notificationId];
    }
    return !!readMap[a.id];
  }

  async function markRead(a: AlertItem) {
    if (isAlertRead(a)) return;
    const now = new Date().toISOString();
    if (a.isReadFromNotif) {
      const ids = a.groupIds && a.groupIds.length > 0 ? a.groupIds : a.notificationId ? [a.notificationId] : [];
      if (ids.length > 0) {
        const newNrm = { ...notifReadMap }; ids.forEach(id => { newNrm[id] = now; }); setNotifReadMap(newNrm);
        await supabase.from('notifications').update({ status: 'read', read_at: now }).in('id', ids);
      }
      return;
    }
    if (profile) {
      setReadMap(prev => ({ ...prev, [a.id]: now }));
      await supabase.from('alert_reads').upsert({ alert_id: a.id, user_id: profile.id, read_at: now });
    }
  }

  async function toggleRead(a: AlertItem) {
    const isRead = isAlertRead(a);
    const now    = new Date().toISOString();
    if (a.isReadFromNotif) {
      const ids = a.groupIds && a.groupIds.length > 0 ? a.groupIds : a.notificationId ? [a.notificationId] : [];
      if (ids.length === 0) return;
      if (isRead) {
        const newNrm = { ...notifReadMap }; ids.forEach(id => delete newNrm[id]); setNotifReadMap(newNrm);
        await supabase.from('notifications').update({ status: 'unread', read_at: null }).in('id', ids);
      } else {
        const newNrm = { ...notifReadMap }; ids.forEach(id => { newNrm[id] = now; }); setNotifReadMap(newNrm);
        await supabase.from('notifications').update({ status: 'read', read_at: now }).in('id', ids);
      }
      return;
    }
    if (!profile) return;
    if (isRead) {
      setReadMap(prev => { const n = { ...prev }; delete n[a.id]; return n; });
      await supabase.from('alert_reads').delete().eq('alert_id', a.id);
    } else {
      setReadMap(prev => ({ ...prev, [a.id]: now }));
      await supabase.from('alert_reads').upsert({ alert_id: a.id, user_id: profile.id, read_at: now });
    }
  }

  async function markAllRead(subset: AlertItem[]) {
    if (!profile) return;
    const now    = new Date().toISOString();
    const unread = subset.filter(a => !isAlertRead(a));
    if (unread.length === 0) return;
    const notifUnread = unread.filter(a => a.isReadFromNotif);
    const dbUnread    = unread.filter(a => !a.isReadFromNotif);
    if (notifUnread.length > 0) {
      const ids = notifUnread.flatMap(a => a.groupIds && a.groupIds.length > 0 ? a.groupIds : a.notificationId ? [a.notificationId] : []);
      const newNrm = { ...notifReadMap }; ids.forEach(id => { newNrm[id] = now; }); setNotifReadMap(newNrm);
      if (ids.length > 0) await supabase.from('notifications').update({ status: 'read', read_at: now }).in('id', ids);
    }
    if (dbUnread.length > 0) {
      const next = { ...readMap }; dbUnread.forEach(a => { next[a.id] = now; }); setReadMap(next);
      await supabase.from('alert_reads').upsert(dbUnread.map(a => ({ alert_id: a.id, user_id: profile.id, read_at: now })));
    }
  }

  function handleActionClick(a: AlertItem) {
    markRead(a);
    if (a.actionTarget === 'task_conversation' && a.taskId && a.projectId && onOpenTaskConversation) {
      onOpenTaskConversation(a.projectId, a.taskId);
      return;
    }
    if (isConversationType(a.type) && a.taskId && a.projectId && onOpenTaskConversation) {
      onOpenTaskConversation(a.projectId, a.taskId);
      return;
    }
    if (!onNavigateToActionBoardItem) return;
    onNavigateToActionBoardItem({ focusItemId: a.actionBoardItemId, filter: a.actionFilter, alertId: a.id, alertTitle: a.title });
  }

  function toggleExpand(id: string) {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Filtering + sorting ────────────────────────────────────────────────────────

  const nowDate = new Date();
  const dateStarts: Record<DateFilter, Date | null> = {
    all:   null,
    today: new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()),
    '7d':  new Date(Date.now() - 7  * 86400000),
    '30d': new Date(Date.now() - 30 * 86400000),
  };

  const filtered = alerts
    .filter(a => {
      if (!showRead && isAlertRead(a)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.title.toLowerCase().includes(q) && !a.project.toLowerCase().includes(q) && !a.detail.toLowerCase().includes(q)) return false;
      }
      const start = dateStarts[dateFilter];
      if (start && new Date(a.createdAt) < start) return false;
      return true;
    })
    .sort((a, b) => {
      // Unread always before read
      const aRead = isAlertRead(a), bRead = isAlertRead(b);
      if (aRead !== bRead) return aRead ? 1 : -1;
      // Within same read state: sort by date
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortDir === 'desc' ? diff : -diff;
    });

  const needsAttention = filtered.filter(a => !isAlertRead(a));
  const recentActivity = filtered.filter(a =>  isAlertRead(a));
  const unreadCount    = alerts.filter(a => !isAlertRead(a)).length;
  const hasFilters     = search !== '' || !showRead || dateFilter !== 'all';

  // Pagination applies to the full filtered list
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginatedNeeds    = needsAttention.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const paginatedActivity = recentActivity.slice(0, Math.max(0, PAGE_SIZE - needsAttention.length));

  // ── Row renderer ──────────────────────────────────────────────────────────────

  function AlertRow({ alert }: { alert: AlertItem }) {
    const isRead    = isAlertRead(alert);
    const isConvo   = isConversationType(alert.type);
    const isGrouped = (alert.groupCount ?? 1) > 1;
    const expanded  = expandedGroups.has(alert.id);

    return (
      <div className={`flex items-start gap-3 px-5 py-4 transition-colors group hover:bg-slate-50/70 ${leftBorder(alert, isRead)} ${isRead ? '' : isConvo ? 'bg-blue-50/10' : alert.level === 'red' ? 'bg-red-50/10' : 'bg-amber-50/10'}`}>

        {/* Status dot */}
        <LevelDot level={alert.level} isRead={isRead} />

        {/* Main content */}
        <div className="flex-1 min-w-0">

          {/* Title line */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span
              className={`text-sm leading-snug ${isRead ? 'text-slate-500 font-normal' : 'text-slate-900 font-semibold'}`}
            >
              {isGrouped && !expanded
                ? buildGroupTitle(alert.type, alert.groupCount!, alert.title.includes(' about ') ? alert.title.split(' about ').slice(1).join(' about ') : null)
                : alert.title
              }
            </span>
            {isGrouped && (
              <button
                onClick={e => { e.stopPropagation(); toggleExpand(alert.id); }}
                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5 font-medium"
              >
                {expanded ? 'collapse' : `+${alert.groupCount! - 1} more`}
                <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {/* Subtitle: project + time */}
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-xs ${isRead ? 'text-slate-400' : 'text-slate-500'}`}>{alert.project}</span>
            <span className="text-slate-300 text-xs">·</span>
            <span className={`text-xs ${isRead ? 'text-slate-300' : 'text-slate-400'}`}>{fmtDateTime(alert.createdAt)}</span>
          </div>

          {/* Detail preview */}
          {alert.detail && !isRead && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              <span className="text-slate-400">"</span>
              <span className="italic">{alert.detail}</span>
              <span className="text-slate-400">"</span>
            </p>
          )}
        </div>

        {/* Right: action + read toggle */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 ml-2">
          <button
            onClick={e => { e.stopPropagation(); handleActionClick(alert); }}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${
              isConvo
                ? 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300'
                : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {isConvo
              ? <MessageSquare className="w-3 h-3 flex-shrink-0" />
              : <ChevronRight  className="w-3 h-3 flex-shrink-0" />
            }
            {alert.actionLabel}
          </button>

          {/* Mark read toggle — subtle */}
          <button
            onClick={e => { e.stopPropagation(); toggleRead(alert); }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            title={isRead ? 'Mark unread' : 'Mark read'}
          >
            {isRead ? 'Mark unread' : 'Mark read'}
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Alert Center</h1>
          {unreadCount > 0 && (
            <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead(filtered)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">

        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search alerts..."
            className="w-full pl-9 pr-7 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-900 placeholder-slate-400 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setSortDir('desc')}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${sortDir === 'desc' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ArrowDown className="w-3 h-3" /> Newest
          </button>
          <button
            onClick={() => setSortDir('asc')}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${sortDir === 'asc' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ArrowUp className="w-3 h-3" /> Oldest
          </button>
        </div>

        {(['all','today','7d','30d'] as DateFilter[]).map(df => (
          <button
            key={df}
            onClick={() => setDateFilter(df)}
            className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              dateFilter === df ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            {df !== 'all' && <Calendar className="w-3 h-3" />}
            {DATE_LABELS[df]}
          </button>
        ))}

        <button
          onClick={() => setShowRead(v => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
            !showRead ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
          }`}
        >
          {showRead ? 'Unread only' : 'Show all'}
        </button>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setShowRead(true); setDateFilter('all'); }}
            className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
            <CheckCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {hasFilters ? 'No alerts match your filters' : 'All clear'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {hasFilters ? 'Try adjusting your filters.' : 'No active alerts right now.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Needs Attention section */}
          {paginatedNeeds.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Needs Attention</span>
                  <span className="text-xs font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">{needsAttention.length}</span>
                </div>
                {needsAttention.length > 0 && (
                  <button
                    onClick={() => markAllRead(needsAttention)}
                    className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {paginatedNeeds.map(alert => <AlertRow key={alert.id} alert={alert} />)}
              </div>
            </div>
          )}

          {/* Recent Activity section */}
          {showRead && paginatedActivity.length > 0 && (
            <div className={paginatedNeeds.length > 0 ? 'border-t border-slate-200' : ''}>
              <SectionHeader label="Recent Activity" count={recentActivity.length} />
              <div className="divide-y divide-slate-100">
                {paginatedActivity.map(alert => <AlertRow key={alert.id} alert={alert} />)}
              </div>
            </div>
          )}

          {/* Footer */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  Prev
                </button>
                <span className="text-xs text-slate-500 px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
