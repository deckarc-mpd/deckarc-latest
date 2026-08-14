// Command Center (Frozen §17) — "Apple-simple": a headline, minimal counts,
// and nothing else. No badges, no color-coded alerts, no icons per row —
// none of that changes what the owner should do next, so none of it is
// here. Detail (and the one place decisions get made) lives in the Action
// Center; this page is the 10-second morning read.
//
// NOT exercised against a live Supabase project or live model from this
// sandbox — same caveat as ActionCenterPage.tsx and supabaseRepository.ts.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, Project, Task, Permit, Inspection, PaymentMilestone, Incident, ClientDecision } from '../lib/supabase';
import { getCriticalItems, getNeedsReviewItems, DbActionItemRow } from '../lib/actionBoardHelpers';
import { synthesizeChiefOfStaffBrief, GeminiSynthesisClient } from '../lib/aiBrain/domains/chiefOfStaff/synthesis';
import type { ResolvedException, ChiefOfStaffSynthesis } from '../lib/aiBrain/domains/chiefOfStaff/types';

interface ApprovalRow { id: string; project_id: string | null; }

export default function CommandCenterPage({ onOpenActionCenter }: { onOpenActionCenter?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [synthesis, setSynthesis] = useState<ChiefOfStaffSynthesis | null>(null);
  const [counts, setCounts] = useState({ needsDecision: 0, critical: 0, watching: 0 });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [projectsRes, tasksRes, permitsRes, inspectionsRes, paymentsRes, incidentsRes, decisionsRes, delaysRes, actionItemsRes, approvalsRes] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('tasks').select('*').eq('is_deleted', false),
      supabase.from('permits').select('*'),
      supabase.from('inspections').select('*'),
      supabase.from('payment_milestones').select('*'),
      supabase.from('incidents').select('*').neq('incident_status', 'Resolved').neq('incident_status', 'Closed'),
      supabase.from('client_decisions').select('*'),
      supabase.from('project_delay_reasons').select('*').neq('status', 'Closed').neq('status', 'Resolved'),
      supabase.from('action_items').select('id,source_id,status,snoozed_until'),
      supabase.from('ai_approvals').select('id, project_id').eq('decision', 'pending'),
    ]);

    const allProjects = (projectsRes.data || []) as Project[];
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
    const approvals = (approvalsRes.data || []) as ApprovalRow[];

    const exceptions: ResolvedException[] = [
      ...criticalItems.map((i) => ({ source: 'critical_item' as const, id: i.id, projectId: i.projectId, title: i.title, detail: i.subtitle })),
      ...approvals.map((a) => ({ source: 'sweep_escalation' as const, id: a.id, projectId: a.project_id || '', title: 'Awaiting your decision', detail: '' })),
      ...needsReviewItems.map((i) => ({ source: 'needs_review_item' as const, id: i.id, projectId: i.projectId, title: i.title, detail: i.subtitle })),
    ];

    setCounts({ needsDecision: approvals.length, critical: criticalItems.length, watching: needsReviewItems.length });
    setSynthesis(await synthesizeChiefOfStaffBrief(exceptions, new GeminiSynthesisClient()));
    setLoading(false);
  }

  if (loading || !synthesis) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>;
  }

  const hasAnything = counts.needsDecision + counts.critical + counts.watching > 0;

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <h1 className="text-3xl font-light text-gray-900 leading-snug">{synthesis.headline}</h1>

      {synthesis.aiFraming && (
        <p className="mt-6 text-lg text-gray-600 leading-relaxed">{synthesis.aiFraming}</p>
      )}

      {hasAnything && (
        <div className="mt-10 flex items-center justify-center gap-10 text-sm text-gray-500">
          {counts.needsDecision > 0 && <span>{counts.needsDecision} need your decision</span>}
          {counts.critical > 0 && <span>{counts.critical} critical</span>}
          {counts.watching > 0 && <span>{counts.watching} being watched</span>}
        </div>
      )}

      {hasAnything && (
        <button
          onClick={onOpenActionCenter}
          className="mt-10 px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm hover:bg-gray-800"
        >
          Open Action Center
        </button>
      )}
    </div>
  );
}
