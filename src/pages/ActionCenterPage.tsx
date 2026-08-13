// Action Center (Frozen §18) — one shared board with exactly six queues,
// never a separate inbox per agent. Read paths mirror DashboardPage.tsx's
// existing pattern (direct client-side Supabase reads, RLS-gated). The one
// write path (Approve/Reject) goes through api/ai-brain/decide-approval.ts
// because ai_approvals has no client-write RLS policy — see that file's
// header comment.
//
// NOT exercised against a live Supabase project from this sandbox (no
// network path to Supabase here) — the query shapes were checked
// column-by-column against the real migrations, same prerequisite-
// verification caveat as supabaseRepository.ts.

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Project, Task, Permit, Inspection, PaymentMilestone, Incident, ClientDecision } from '../lib/supabase';
import { getCriticalItems, getNeedsReviewItems, DbActionItemRow } from '../lib/actionBoardHelpers';
import { buildActionCenterQueues, ActionCenterQueues, QueueItem } from '../lib/aiBrain/domains/actionCenter/queues';
import type { ApprovalRecord, WorkflowRun } from '../lib/aiBrain/types';

interface ApprovalRow {
  id: string; company_id: string; project_id: string | null; correlation_id: string;
  workflow_run_id: string; payload_hash: string; payload_version: string;
  approver_user_id: string | null; decision: 'pending' | 'approved' | 'rejected';
  channel: 'ui' | 'voice' | 'email' | 'api'; decided_at: string | null; created_at: string;
}
interface WorkflowRunRow {
  id: string; company_id: string; project_id: string | null; correlation_id: string;
  sop_id: string; sop_version: string; trigger_event_id: string; status: WorkflowRun['status'];
  waiting_on: string | null; due_at: string | null; started_at: string; completed_at: string | null;
  created_at: string; updated_at: string;
}
interface SopRow { id: string; title: string; }

function toApprovalRecord(r: ApprovalRow): ApprovalRecord {
  return {
    id: r.id, companyId: r.company_id, projectId: r.project_id, correlationId: r.correlation_id,
    workflowRunId: r.workflow_run_id, payloadHash: r.payload_hash, payloadVersion: r.payload_version,
    approverUserId: r.approver_user_id, decision: r.decision, channel: r.channel,
    decidedAt: r.decided_at, createdAt: r.created_at,
  };
}
function toWorkflowRun(r: WorkflowRunRow): WorkflowRun {
  return {
    id: r.id, companyId: r.company_id, projectId: r.project_id, correlationId: r.correlation_id,
    sopId: r.sop_id, sopVersion: r.sop_version, triggerEventId: r.trigger_event_id, status: r.status,
    waitingOn: r.waiting_on, dueAt: r.due_at, startedAt: r.started_at, completedAt: r.completed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const QUEUE_LABELS: Record<keyof ActionCenterQueues, string> = {
  needsMyDecision: 'Needs My Decision',
  criticalNow: 'Critical Now',
  aiHandling: 'AI Handling',
  watching: 'Watching',
  completed: 'Completed',
  blocked: 'Blocked',
};
const QUEUE_ORDER: Array<keyof ActionCenterQueues> = [
  'needsMyDecision', 'criticalNow', 'blocked', 'aiHandling', 'watching', 'completed',
];

export default function ActionCenterPage({ onViewProject }: { onViewProject?: (projectId: string) => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [queues, setQueues] = useState<ActionCenterQueues | null>(null);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [decidingId, setDecidingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [projectsRes, tasksRes, permitsRes, inspectionsRes, paymentsRes, incidentsRes, decisionsRes, delaysRes, actionItemsRes, approvalsRes, runningRes, completedRes, failedRes] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('tasks').select('*').eq('is_deleted', false),
      supabase.from('permits').select('*'),
      supabase.from('inspections').select('*'),
      supabase.from('payment_milestones').select('*'),
      supabase.from('incidents').select('*').neq('incident_status', 'Resolved').neq('incident_status', 'Closed'),
      supabase.from('client_decisions').select('*'),
      supabase.from('project_delay_reasons').select('*').neq('status', 'Closed').neq('status', 'Resolved'),
      supabase.from('action_items').select('id,source_id,status,snoozed_until'),
      supabase.from('ai_approvals').select('*').eq('decision', 'pending'),
      supabase.from('ai_workflow_runs').select('*').eq('status', 'running'),
      supabase.from('ai_workflow_runs').select('*').eq('status', 'completed').order('completed_at', { ascending: false }).limit(20),
      supabase.from('ai_workflow_runs').select('*').eq('status', 'failed').order('updated_at', { ascending: false }).limit(20),
    ]);

    const allProjects = (projectsRes.data || []) as Project[];
    setProjectNames(new Map(allProjects.map((p) => [p.id, p.project_name])));
    const activeProjectIds = new Set(allProjects.filter((p) => !['Completed', 'Cancelled', 'Archived'].includes(p.status)).map((p) => p.id));

    const boardData = {
      tasks: ((tasksRes.data || []) as Task[]).filter((t) => !['Completed', 'Closed', 'Cancelled'].includes(t.status)),
      permits: (permitsRes.data || []) as Permit[],
      inspections: (inspectionsRes.data || []) as Inspection[],
      payments: (paymentsRes.data || []) as PaymentMilestone[],
      incidents: (incidentsRes.data || []) as Incident[],
      decisions: ((decisionsRes.data || []) as ClientDecision[]).filter((d) => d.status !== 'Received'),
      delays: delaysRes.data || [],
      actionItemsDb: (actionItemsRes.data || []) as DbActionItemRow[],
      activeProjectIds,
      today,
    };
    const criticalItems = getCriticalItems(boardData);
    const needsReviewItems = getNeedsReviewItems(boardData);

    const approvalRows = (approvalsRes.data || []) as ApprovalRow[];
    const runningRows = (runningRes.data || []) as WorkflowRunRow[];
    const completedRows = (completedRes.data || []) as WorkflowRunRow[];
    const failedRows = (failedRes.data || []) as WorkflowRunRow[];

    const sopIds = Array.from(new Set([
      ...approvalRows.map(() => null), // resolved below via workflow_run_id -> sop_id
      ...runningRows.map((r) => r.sop_id), ...completedRows.map((r) => r.sop_id), ...failedRows.map((r) => r.sop_id),
    ].filter((id): id is string => !!id)));

    // Approvals only carry workflow_run_id, not sop_id directly — fetch their runs too.
    const approvalRunIds = approvalRows.map((a) => a.workflow_run_id);
    const approvalRunsRes = approvalRunIds.length
      ? await supabase.from('ai_workflow_runs').select('*').in('id', approvalRunIds)
      : { data: [] as WorkflowRunRow[] };
    const approvalRuns = (approvalRunsRes.data || []) as WorkflowRunRow[];
    const approvalRunById = new Map(approvalRuns.map((r) => [r.id, r]));
    for (const r of approvalRuns) if (!sopIds.includes(r.sop_id)) sopIds.push(r.sop_id);

    const sopsRes = sopIds.length ? await supabase.from('ai_sops').select('id, title').in('id', sopIds) : { data: [] as SopRow[] };
    const sopTitleById = new Map(((sopsRes.data || []) as SopRow[]).map((s) => [s.id, s.title]));

    const pendingApprovals = approvalRows
      .map((a) => {
        const runRow = approvalRunById.get(a.workflow_run_id);
        if (!runRow) return null;
        return { approval: toApprovalRecord(a), run: toWorkflowRun(runRow), sopTitle: sopTitleById.get(runRow.sop_id) || runRow.sop_id };
      })
      .filter((x): x is { approval: ApprovalRecord; run: WorkflowRun; sopTitle: string } => x !== null);

    setQueues(
      buildActionCenterQueues({
        criticalItems,
        needsReviewItems,
        pendingApprovals,
        runningWorkflowRuns: runningRows.map((r) => ({ run: toWorkflowRun(r), sopTitle: sopTitleById.get(r.sop_id) || r.sop_id })),
        completedWorkflowRuns: completedRows.map((r) => ({ run: toWorkflowRun(r), sopTitle: sopTitleById.get(r.sop_id) || r.sop_id })),
        failedWorkflowRuns: failedRows.map((r) => ({ run: toWorkflowRun(r), sopTitle: sopTitleById.get(r.sop_id) || r.sop_id })),
      })
    );
    setLoading(false);
  }

  async function decide(approvalId: string, decision: 'approved' | 'rejected') {
    if (!user) return;
    setDecidingId(approvalId);
    try {
      await fetch('/api/ai-brain/decide-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision, approverUserId: user.id }),
      });
      await load();
    } finally {
      setDecidingId(null);
    }
  }

  if (loading || !queues) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Action Center</h1>
        <p className="text-gray-500 text-sm mt-1">Everything that needs attention, in one place — not one inbox per agent.</p>
      </div>

      {QUEUE_ORDER.map((key) => {
        const items = queues[key];
        return (
          <section key={key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-medium text-gray-800">{QUEUE_LABELS[key]}</h2>
              <span className="text-sm text-gray-400">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
                <Inbox size={16} /> Nothing here.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {items.map((item: QueueItem) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
                    <button
                      className="text-left flex-1 min-w-0"
                      onClick={() => item.projectId && onViewProject?.(item.projectId)}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {item.projectId && projectNames.get(item.projectId) ? `${projectNames.get(item.projectId)} — ` : ''}
                        {item.subtitle}
                      </div>
                    </button>
                    {key === 'needsMyDecision' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          disabled={decidingId === item.id.replace('approval-', '')}
                          onClick={() => decide(item.id.replace('approval-', ''), 'approved')}
                          className="p-1.5 rounded-md text-green-600 hover:bg-green-50 disabled:opacity-40"
                          title="Approve"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                        <button
                          disabled={decidingId === item.id.replace('approval-', '')}
                          onClick={() => decide(item.id.replace('approval-', ''), 'rejected')}
                          className="p-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"
                          title="Reject"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
