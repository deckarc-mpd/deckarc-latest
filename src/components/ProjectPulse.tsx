import { useEffect, useState } from 'react';
import { supabase, FIELD_NEEDS_ATTENTION_STATUSES } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getAdminNeedsAttentionItems, DbActionItemRow } from '../lib/actionBoardHelpers';
import { ArrowRight, History, Target, CalendarDays, ChevronDown } from 'lucide-react';

type PriorityLevel = 'Informational' | 'Time Sensitive' | 'Critical' | 'Escalation' | 'Action Needed' | 'Urgent';
type PeriodKey = 'Yesterday' | 'Today' | 'Tomorrow';

interface PulseBubble {
  period: PeriodKey;
  summary: string;
  supporting: string;
  count: number | null;
  status: 'green' | 'yellow' | 'red' | 'dark-red';
  priority: PriorityLevel;
  viewLabel?: string;
}

export interface SubBlockedTask {
  id: string;
  task_name: string;
  project_name: string;
  blocked_reason: string | null;
  planned_finish_date: string | null;
  project_id: string;
  task_type: string;
  category: string;
  status: string;
  client_visible_notes: string;
}

interface ProjectPulseProps {
  onViewYesterday?: () => void;
  onViewToday?: () => void;
  onViewTodayNeedsAttention?: () => void;
  onViewTomorrow?: () => void;
  onViewSubBlockedTasks?: (tasks: SubBlockedTask[]) => void;
}

const STATUS_RING: Record<PulseBubble['status'], string> = {
  green:      '',
  yellow:     '',
  red:        '',
  'dark-red': '',
};

const STATUS_DOT: Record<PulseBubble['status'], string> = {
  green:      'bg-emerald-500',
  yellow:     'bg-amber-500',
  red:        'bg-red-500',
  'dark-red': 'bg-red-700',
};

const STATUS_ICON_COLOR: Record<PulseBubble['status'], string> = {
  green:      '',
  yellow:     '',
  red:        '',
  'dark-red': '',
};

const STATUS_LABEL_COLOR: Record<PulseBubble['status'], string> = {
  green:      'text-emerald-700',
  yellow:     'text-amber-700',
  red:        'text-red-600',
  'dark-red': 'text-red-800',
};

const PRIORITY_PILL: Record<PriorityLevel, string> = {
  Informational:   'bg-slate-100 text-slate-500',
  'Time Sensitive':'bg-amber-50 text-amber-700',
  'Action Needed': 'bg-blue-50 text-blue-700',
  Urgent:          'bg-red-50 text-red-700',
  Critical:        'bg-red-50 text-red-700',
  Escalation:      'bg-red-100 text-red-800',
};

const PERIOD_ICON: Record<PeriodKey, React.ElementType> = {
  Yesterday: History,
  Today:     Target,
  Tomorrow:  CalendarDays,
};

const TOMORROW_REASONS = [
  'DECKARC is coordinating the next project step.',
  'The next phase is pending schedule confirmation.',
  'Material delivery is being confirmed before the next step.',
  'DECKARC is monitoring the schedule for the next work phase.',
];

export default function ProjectPulse({ onViewYesterday, onViewToday, onViewTodayNeedsAttention, onViewTomorrow, onViewSubBlockedTasks }: ProjectPulseProps) {
  const { profile } = useAuth();
  const [bubbles, setBubbles]   = useState<PulseBubble[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<PeriodKey | null>('Today');
  const [subBlockedTasks, setSubBlockedTasks] = useState<SubBlockedTask[]>([]);

  const isClient = profile?.role === 'CLIENT';
  const isGC     = profile?.role === 'GENERAL_CONTRACTOR';
  const isSub    = profile?.role === 'SUBCONTRACTOR';

  useEffect(() => { load(); }, [profile?.id]);

  async function load() {
    if (!profile) return;
    setLoading(true);
    try {
      const today    = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const yd       = new Date(today); yd.setDate(yd.getDate() - 1);
      const yStr     = yd.toISOString().split('T')[0];
      const tm       = new Date(today); tm.setDate(tm.getDate() + 1);
      const tmStr    = tm.toISOString().split('T')[0];

      const [projectsRes, tasksRes, updatesRes, permitsRes, inspectionsRes, decisionsRes, alertsRes, delayRes, subBlockedRes, paymentsRes, incidentsRes] =
        await Promise.all([
          supabase.from('projects').select('id,status,alert_status,is_archived,is_deleted').eq('is_archived', false),
          supabase.from('tasks').select('id,task_name,task_type,category,status,planned_finish_date,planned_start_date,projected_start_date,projected_finish_date,project_id,assigned_user_id,blocked_reason').eq('is_deleted', false),
          supabase.from('daily_updates').select('id,update_date,blockers').gte('update_date', yStr).lte('update_date', todayStr),
          supabase.from('permits').select('id,project_id,permit_status,permit_type,permit_number,revision_notes,delay_reason,permit_delay_expected'),
          supabase.from('inspections').select('id,project_id,result,scheduled_date,correction_required,inspection_type,correction_notes,delay_reason'),
          supabase.from('client_decisions').select('id,project_id,status,needed_by_date,decision_title,description,client_visible_note'),
          supabase.from('action_items').select('id,source_id,priority,status,snoozed_until,resolved_at'),
          supabase.from('project_delay_reasons').select('id,status,client_response_status,client_response_required,schedule_impact_status,client_visibility_status,task_id,delay_category,project_id').neq('status', 'Closed'),
          // Sub only: their assigned tasks that need attention
          isSub && profile?.id
            ? supabase.from('tasks')
                .select('id,task_name,task_type,category,status,blocked_reason,planned_finish_date,project_id,client_visible_notes')
                .eq('assigned_user_id', profile.id)
                .eq('is_deleted', false)
                .in('status', [...FIELD_NEEDS_ATTENTION_STATUSES])
            : Promise.resolve({ data: [] }),
          supabase.from('payment_milestones').select('id,project_id,milestone_name,amount,status,due_date,work_hold_required'),
          supabase.from('incidents').select('id,project_id,incident_title,incident_status,severity_level,work_hold_required').neq('incident_status', 'Resolved').neq('incident_status', 'Closed'),
        ]);

      const projects    = projectsRes.data    || [];
      const tasks       = tasksRes.data       || [];
      const updates     = updatesRes.data     || [];
      const permits     = permitsRes.data     || [];
      const inspections = inspectionsRes.data || [];
      const decisions   = decisionsRes.data   || [];
      const allActionItems = alertsRes.data   || [];
      const delays      = delayRes.data       || [];
      const payments    = paymentsRes.data    || [];
      const incidents   = incidentsRes.data   || [];

      // Build project name map for sub blocked task display
      const projectNameMap = new Map(projects.map((p: any) => [p.id, p.project_name || 'Project']));
      const rawSubBlocked: SubBlockedTask[] = (subBlockedRes.data || []).map((t: any) => ({
        id: t.id,
        task_name: t.task_name,
        project_name: projectNameMap.get(t.project_id) || 'Project',
        blocked_reason: t.blocked_reason || null,
        planned_finish_date: t.planned_finish_date || null,
        project_id: t.project_id,
        task_type: t.task_type || 'Project Task',
        category: t.category || 'Other',
        status: t.status,
        client_visible_notes: t.client_visible_notes || '',
      }));
      // Prioritize Blocked status first
      rawSubBlocked.sort((a, b) => {
        if (a.status === 'Blocked' && b.status !== 'Blocked') return -1;
        if (b.status === 'Blocked' && a.status !== 'Blocked') return 1;
        return 0;
      });
      setSubBlockedTasks(rawSubBlocked);

      // Split action_items into active (Open, not snoozed) and resolved TODAY only (Done with resolved_at = today)
      const abActive   = allActionItems.filter(a => a.status !== 'Done' && !(a.snoozed_until && a.snoozed_until >= todayStr)).length;
      const abResolved = allActionItems.filter(a => a.status === 'Done' && a.resolved_at && a.resolved_at.startsWith(todayStr)).length;
      const abTotal    = abActive + abResolved;

      // Legacy: critA was previously only Open items flagged Critical/Escalation
      const alerts = allActionItems.filter(a => a.status === 'Open');

      const delayed  = projects.filter(p => p.status === 'Delayed').length;
      const critical = projects.filter(p => p.alert_status === 'red').length;

      // Delay-specific counts
      const openDelays           = delays.filter(d => !['Resolved', 'Closed'].includes(d.status)).length;
      const pendingAdminReview   = delays.filter(d => d.schedule_impact_status === 'Pending Admin Review').length;
      const pendingClientNotice  = delays.filter(d => d.client_visibility_status === 'Pending Admin Approval').length;
      const clientPendingResp    = delays.filter(d => d.client_response_required && d.client_response_status === 'Pending Response').length;
      const clientReviewRequested = delays.filter(d => d.client_response_status === 'Client Requested Review').length;
      const clientQuestions      = delays.filter(d => d.client_response_status === 'Question Submitted').length;

      // Sub: only delays for their tasks
      const subDelays = isSub
        ? delays.filter(d => d.task_id && tasks.some(t => t.id === d.task_id && t.assigned_user_id === profile.id))
        : [];

      // GC: open delays need operational attention
      const gcOpenDelays = (isGC ? openDelays : 0);

      // Yesterday
      const yUpdates   = updates.filter(u => u.update_date === yStr);
      const completedY = tasks.filter(t => t.status === 'Completed').length;
      const blockersY  = updates.filter(u => u.blockers && u.update_date === yStr).length;

      let yStatus: PulseBubble['status'] = 'green';
      let yPri: PriorityLevel = 'Informational';
      if (blockersY > 0) { yStatus = 'yellow'; yPri = isClient ? 'Informational' : 'Time Sensitive'; }
      if (critical > 0)  { yStatus = 'red';    yPri = isClient ? 'Action Needed' : 'Critical'; }

      const yBubble: PulseBubble = isClient
        ? { period: 'Yesterday', summary: completedY > 0 ? `${completedY} project item${completedY !== 1 ? 's' : ''} completed.` : 'No new approved update yesterday.', supporting: 'DECKARC reviewed and approved this progress.', count: completedY || null, status: 'green', priority: 'Informational' }
        : { period: 'Yesterday', summary: yUpdates.length > 0 ? `${yUpdates.length} update${yUpdates.length !== 1 ? 's' : ''} submitted yesterday.` : 'No daily updates received yesterday.', supporting: yUpdates.length === 0 ? 'Follow up with the field team.' : blockersY > 0 ? `${blockersY} blocker${blockersY > 1 ? 's' : ''} reported. ${completedY} task${completedY !== 1 ? 's' : ''} completed.` : `${completedY} task${completedY !== 1 ? 's' : ''} completed. All updates received.`, count: yUpdates.length, status: yUpdates.length === 0 ? 'yellow' : yStatus, priority: yUpdates.length === 0 ? 'Time Sensitive' : yPri };

      // Today
      const overdueD = decisions.filter(d => d.status !== 'Received' && d.needed_by_date && d.needed_by_date <= todayStr).length;
      const todayI   = inspections.filter(i => i.scheduled_date === todayStr).length;
      const critA    = alerts.filter(a => a.priority === 'Critical' || a.priority === 'Escalation').length;
      const pendingP = permits.filter(p => !['Approved', 'Not Required', 'Closed'].includes(p.permit_status)).length;

      // Admin today: also factor in delay review items and client review requests
      const adminDelayWork = pendingAdminReview + pendingClientNotice + clientReviewRequested + clientQuestions;
      // Client today: schedule updates needing response
      const clientScheduleAct = clientPendingResp;

      let tStatus: PulseBubble['status'] = 'green';
      let tPri: PriorityLevel = 'Informational';
      if (overdueD > 0 || pendingP > 0 || (isClient && clientScheduleAct > 0)) {
        tStatus = 'yellow'; tPri = isClient ? 'Action Needed' : 'Time Sensitive';
      }
      if (critA > 0 || delayed > 0 || (isClient && clientReviewRequested > 0)) {
        tStatus = 'red'; tPri = isClient ? 'Urgent' : 'Critical';
      }
      if (critA > 2) { tStatus = 'dark-red'; tPri = isClient ? 'Urgent' : 'Escalation'; }

      const clientAct = overdueD + clientScheduleAct;
      const todaySum  = critA + overdueD + todayI + adminDelayWork;
      const gcTodaySum = gcOpenDelays + todayI;
      const subTodayCount = subDelays.length;

      let tBubble: PulseBubble;
      if (isClient) {
        const clientMsg = clientAct > 0
          ? `${clientAct} item${clientAct !== 1 ? 's' : ''} need${clientAct === 1 ? 's' : ''} your attention.`
          : 'No action needed from you today.';
        const clientSub = clientReviewRequested > 0
          ? 'Your review request is being reviewed by DECKARC.'
          : clientScheduleAct > 0
          ? `${clientScheduleAct} schedule update${clientScheduleAct > 1 ? 's' : ''} need${clientScheduleAct === 1 ? 's' : ''} your review.`
          : clientAct > 0
          ? 'Please review your pending items. Responding on time keeps your project moving.'
          : 'Your project is progressing on schedule. DECKARC is coordinating the next step.';
        tBubble = { period: 'Today', summary: clientMsg, supporting: clientSub, count: clientAct || null, status: clientAct > 0 ? (clientReviewRequested > 0 ? 'red' : 'yellow') : 'green', priority: clientAct > 0 ? (clientReviewRequested > 0 ? 'Urgent' : 'Action Needed') : 'Informational' };
      } else if (isGC) {
        // GC Today: use Action Board active/resolved counts for accuracy
        const gcSummary = abActive > 0
          ? `${abActive} item${abActive !== 1 ? 's' : ''} still need${abActive === 1 ? 's' : ''} attention.`
          : abResolved > 0
          ? `${abResolved}/${abTotal} addressed today.`
          : 'No critical items today.';
        const gcSupporting = abActive > 0
          ? (abResolved > 0 ? `${abResolved}/${abTotal} addressed today.` : (gcOpenDelays > 0 ? `${gcOpenDelays} delay item${gcOpenDelays > 1 ? 's' : ''} may impact schedule.` : todayI > 0 ? `${todayI} inspection${todayI > 1 ? 's' : ''} scheduled today.` : 'Open Action Board to review.'))
          : abResolved > 0
          ? 'All clear for today.'
          : 'All clear — confirm crew readiness.';
        tBubble = {
          period: 'Today',
          summary: gcSummary,
          supporting: gcSupporting,
          count: abActive > 0 ? abActive : abResolved > 0 ? abTotal : null,
          status: abActive > 0 ? (gcOpenDelays > 0 ? 'yellow' : 'green') : 'green',
          priority: abActive > 0 ? 'Action Needed' : 'Informational',
        };
      } else if (isSub) {
        const subActCount = rawSubBlocked.length;
        const firstBlocked = rawSubBlocked.find(t => t.status === 'Blocked');
        const subSupporting = subActCount > 0
          ? firstBlocked
            ? `${firstBlocked.task_name} on ${firstBlocked.project_name} is blocked${firstBlocked.blocked_reason ? ': ' + firstBlocked.blocked_reason : '.'}`
            : rawSubBlocked[0]
            ? `${rawSubBlocked[0].task_name} on ${rawSubBlocked[0].project_name} needs your attention.`
            : 'Open My Tasks to see what needs your attention.'
          : 'Check your task list for today\'s work.';
        tBubble = {
          period: 'Today',
          summary: subActCount > 0
            ? `${subActCount} task${subActCount !== 1 ? 's' : ''} need${subActCount === 1 ? 's' : ''} your attention.`
            : 'No action needed on your tasks today.',
          supporting: subSupporting,
          count: subActCount || null,
          status: subActCount > 0 ? (rawSubBlocked.some(t => t.status === 'Blocked') ? 'red' : 'yellow') : 'green',
          priority: subActCount > 0 ? 'Action Needed' : 'Informational',
          viewLabel: subActCount === 1 ? 'View Task' : subActCount > 1 ? 'View Tasks' : undefined,
        };
      } else {
        // Admin: use shared getAdminNeedsAttentionItems() so count matches Action Board Needs Attention filter exactly
        const adminActiveProjectIds = new Set(
          projects
            .filter(p => p.is_deleted !== true && p.is_archived !== true && p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted')
            .map(p => p.id)
        );
        const boardData = {
          tasks: tasks.filter(t => !['Completed', 'Closed', 'Cancelled'].includes(t.status)) as any[],
          permits: permits as any[],
          inspections: inspections as any[],
          payments: payments as any[],
          incidents: incidents as any[],
          decisions: decisions.filter(d => d.status !== 'Received') as any[],
          delays,
          actionItemsDb: (allActionItems as DbActionItemRow[]),
          activeProjectIds: adminActiveProjectIds,
          today: todayStr,
        };
        const adminAttnItems = getAdminNeedsAttentionItems(boardData);
        const adminAttnCount = adminAttnItems.length;
        // Resolved today: still use action_items for resolved-today count
        const resolvedToday = allActionItems.filter(a => a.status === 'Done' && a.resolved_at && a.resolved_at.startsWith(todayStr)).length;

        console.log('adminNeedsAttentionItems (ProjectPulse)', adminAttnItems);

        const adminSummary = adminAttnCount > 0
          ? `${adminAttnCount} item${adminAttnCount !== 1 ? 's' : ''} still need${adminAttnCount === 1 ? 's' : ''} attention.`
          : resolvedToday > 0
          ? `${resolvedToday} resolved today. All clear.`
          : 'No critical items today.';
        const adminSupporting = adminAttnCount > 0
          ? (clientReviewRequested > 0
              ? `${clientReviewRequested} client review request${clientReviewRequested > 1 ? 's' : ''} need${clientReviewRequested === 1 ? 's' : ''} your response.`
              : pendingAdminReview > 0
              ? `${pendingAdminReview} schedule impact${pendingAdminReview > 1 ? 's' : ''} pending review.`
              : todayI > 0
              ? `${todayI} inspection${todayI > 1 ? 's' : ''} scheduled today.`
              : 'Open Action Board to review and respond.')
          : resolvedToday > 0
          ? 'All clear for today.'
          : clientReviewRequested > 0
          ? `${clientReviewRequested} client review request${clientReviewRequested > 1 ? 's' : ''} in progress.`
          : 'All clear.';
        const adminStatus: PulseBubble['status'] = adminAttnCount > 0 ? (adminAttnCount > 2 ? 'dark-red' : 'red') : 'green';
        const adminPriority: PriorityLevel = adminAttnCount > 0 ? (adminAttnCount > 2 ? 'Escalation' : 'Critical') : 'Informational';
        tBubble = {
          period: 'Today',
          summary: adminSummary,
          supporting: adminSupporting,
          count: adminAttnCount > 0 ? adminAttnCount : resolvedToday > 0 ? resolvedToday : null,
          status: adminStatus,
          priority: adminPriority,
        };
      }

      // Tomorrow — use same active-project filter as TomorrowWorkPage
      const activeProjectIds = new Set(
        projects
          .filter(p => p.is_deleted !== true && p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted')
          .map(p => p.id)
      );

      // Tasks on tomorrow's plan (starting, due, or in-progress spanning tomorrow) — excludes Completed tasks
      const tmTasksAll = tasks.filter(t => {
        if (!activeProjectIds.has(t.project_id)) return false;
        if (t.status === 'Completed') return false;
        const startsTomorrow = t.planned_start_date === tmStr || t.projected_start_date === tmStr;
        const dueTomorrow    = t.planned_finish_date === tmStr || t.projected_finish_date === tmStr;
        const continuing     = t.status === 'In Progress'
          && (t.planned_start_date || t.projected_start_date) <= tmStr
          && (t.planned_finish_date || t.projected_finish_date) >= tmStr;
        return startsTomorrow || dueTomorrow || continuing;
      });
      const tmTaskCount = tmTasksAll.length;

      const tmInsp  = inspections.filter(i => i.scheduled_date === tmStr).length;
      const blocked = tasks.filter(t => activeProjectIds.has(t.project_id) && t.status === 'Blocked').length;
      // Delays that may impact tomorrow's work
      const delayRisk = delays.filter(d =>
        ['Pending Admin Review', 'Possible Impact'].includes(d.schedule_impact_status)
      ).length;

      // Total "items on tomorrow's plan" count for the badge
      const tmTotal = tmTaskCount + tmInsp;

      let tmStatus: PulseBubble['status'] = 'green';
      let tmPri: PriorityLevel = 'Informational';
      if (blocked > 0 || tmInsp > 0 || delayRisk > 0 || tmTaskCount > 0) { tmStatus = 'yellow'; tmPri = isClient ? 'Informational' : 'Time Sensitive'; }
      if (blocked > 2) { tmStatus = 'red'; tmPri = isClient ? 'Informational' : 'Critical'; }

      let tmBubble: PulseBubble;
      if (isClient) {
        tmBubble = {
          period: 'Tomorrow',
          summary: 'No client action is needed tomorrow.',
          supporting: TOMORROW_REASONS[Math.floor(Math.random() * TOMORROW_REASONS.length)],
          count: null, status: 'green', priority: 'Informational',
        };
      } else if (isGC) {
        const gcTmCount = delayRisk > 0 ? delayRisk : (tmTotal || null);
        tmBubble = {
          period: 'Tomorrow',
          summary: delayRisk > 0
            ? `${delayRisk} delay item${delayRisk !== 1 ? 's' : ''} may impact tomorrow's schedule.`
            : tmTotal === 0 ? 'No items on tomorrow\'s plan.' : `${tmTotal} item${tmTotal !== 1 ? 's' : ''} on tomorrow's plan.`,
          supporting: blocked > 0
            ? `${blocked} blocked task${blocked > 1 ? 's' : ''} — resolve today so work can proceed.`
            : tmInsp > 0
            ? `${tmInsp} inspection${tmInsp > 1 ? 's' : ''} scheduled.`
            : delayRisk > 0
            ? 'Review delay items so your crew has clear direction.'
            : 'Confirm crew readiness for tomorrow.',
          count: gcTmCount, status: tmStatus, priority: tmPri,
        };
      } else if (isSub) {
        const subBlocked = subDelays.filter(d => !['Resolved', 'Closed'].includes(d.status)).length;
        tmBubble = {
          period: 'Tomorrow',
          summary: subBlocked > 0
            ? 'Your assigned task may still be blocked tomorrow.'
            : 'No known blockers for your tasks tomorrow.',
          supporting: subBlocked > 0
            ? 'Your assigned task is waiting for inspection approval or a dependency.'
            : 'Check with your supervisor for tomorrow\'s schedule.',
          count: subBlocked || null,
          status: subBlocked > 0 ? 'yellow' : 'green',
          priority: subBlocked > 0 ? 'Time Sensitive' : 'Informational',
        };
      } else {
        // Admin
        tmBubble = {
          period: 'Tomorrow',
          summary: tmTotal === 0 ? 'No items on tomorrow\'s plan.' : `${tmTotal} item${tmTotal !== 1 ? 's' : ''} on tomorrow's plan.`,
          supporting: blocked > 0
            ? `${blocked} blocked task${blocked > 1 ? 's' : ''} — resolve before end of day.`
            : delayRisk > 0
            ? `${delayRisk} schedule impact${delayRisk > 1 ? 's are' : ' is'} at risk of affecting tomorrow's schedule.`
            : tmInsp > 0
            ? `${tmInsp} inspection${tmInsp > 1 ? 's' : ''} scheduled.`
            : tmTotal === 0 ? 'Confirm crew availability.' : 'Confirm crew readiness before end of day.',
          count: tmTotal || null, status: tmStatus, priority: tmPri,
        };
      }

      setBubbles([yBubble, tBubble, tmBubble]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  const handlers: Record<PeriodKey, (() => void) | undefined> = {
    Yesterday: onViewYesterday,
    Today: isSub && onViewSubBlockedTasks && subBlockedTasks.length > 0
      ? () => onViewSubBlockedTasks(subBlockedTasks)
      : (isClient ? onViewToday : (onViewTodayNeedsAttention || onViewToday)),
    Tomorrow:  onViewTomorrow,
  };

  function toggle(period: PeriodKey) {
    setExpanded(prev => prev === period ? null : period);
  }

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex justify-around">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex flex-col items-center gap-2 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-slate-100" />
              <div className="h-3 w-14 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Three circles row */}
      <div className="flex items-center justify-around px-6 py-5 gap-2">
        {bubbles.map(b => {
          const Icon = PERIOD_ICON[b.period];
          const isOpen = expanded === b.period;
          const ringCls = STATUS_RING[b.status];
          const iconCls = STATUS_ICON_COLOR[b.status];
          const labelCls = STATUS_LABEL_COLOR[b.status];
          return (
            <button
              key={b.period}
              onClick={() => toggle(b.period)}
              className="flex flex-col items-center gap-2 group focus:outline-none"
            >
              {/* Circle */}
              <div
                className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-105 ${isOpen ? 'shadow-md' : ''}`}
                style={{
                  background: 'rgba(56,114,188,0.08)',
                  border: `2px solid #3872bc`,
                  outline: isOpen ? '2px solid rgba(56,114,188,0.2)' : undefined,
                  outlineOffset: isOpen ? '2px' : undefined,
                }}
              >
                <Icon className="w-6 h-6" style={{ color: '#3872bc' }} strokeWidth={isOpen ? 2.5 : 2} />
                {/* status dot */}
                <span className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${STATUS_DOT[b.status]}`} />
                {/* count badge */}
                {b.count !== null && b.count > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none">
                    {b.count}
                  </span>
                )}
              </div>
              {/* Label */}
              <div className="flex items-center gap-1">
                <span
                  className="text-[12px] font-semibold transition-colors"
                  style={{ color: isOpen ? '#0d1e36' : '#64748b' }}
                >
                  {b.period}
                </span>
                <ChevronDown
                  className="w-3 h-3 transition-transform duration-200"
                  style={{ color: isOpen ? '#162f52' : '#cbd5e1', transform: isOpen ? 'rotate(180deg)' : undefined }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {expanded && (() => {
        const active = bubbles.find(b => b.period === expanded);
        if (!active) return null;
        return (
          <div className="border-t border-slate-100 px-5 py-4 animate-fade-in">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[active.status]}`} />
                <div className="min-w-0 flex-1">
                  <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5 ${PRIORITY_PILL[active.priority]}`}>
                    {active.priority}
                  </span>
                  <p className="text-sm font-medium text-slate-800 leading-snug">
                    {active.summary}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{active.supporting}</p>
                </div>
              </div>
              {handlers[active.period] && (
                <button
                  onClick={handlers[active.period]}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-200 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                >
                  {active.viewLabel || 'View'} <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
