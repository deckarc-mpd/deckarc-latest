/**
 * Shared helpers for computing Action Board item categories.
 *
 * Both DashboardPage and ActionBoardPage call these functions with the same
 * raw DB data so every count and rendered-row list derives from a single source.
 *
 * Key contract: the helper applies the SAME Done/snoozed filtering that
 * ActionBoardPage's mergeDb() applies, so Dashboard counts always equal
 * Action Board filter counts for the same item IDs.
 */

import { Task, Permit, Inspection, PaymentMilestone, Incident, ClientDecision } from './supabase';

// ─── DB action_items row shape (minimal fields needed) ────────────────────────

export interface DbActionItemRow {
  id:           string;
  source_id:    string | null;
  status:       string | null;       // 'Open' | 'In Progress' | 'Done' | 'Snoozed'
  snoozed_until?: string | null;     // YYYY-MM-DD
}

// ─── Input shape ──────────────────────────────────────────────────────────────

export interface RawBoardData {
  tasks:          Task[];
  permits:        Permit[];
  inspections:    Inspection[];
  payments:       PaymentMilestone[];
  incidents:      Incident[];
  decisions:      ClientDecision[];
  delays:         any[];             // project_delay_reasons rows
  actionItemsDb:  DbActionItemRow[]; // rows from action_items table (with source_id)
  activeProjectIds: Set<string>;
  today:          string;            // YYYY-MM-DD
}

/** Minimal shape returned to callers — enough to count + display. */
export interface BoardItemSummary {
  id:        string;
  category:  'critical' | 'needs-review' | 'overdue' | 'due-today' | 'follow-up' | 'decisions';
  title:     string;
  subtitle:  string;
  projectId: string;
}

// ─── Internal DB map helpers ───────────────────────────────────────────────────

function buildDbMap(rows: DbActionItemRow[]): Map<string, DbActionItemRow> {
  const m = new Map<string, DbActionItemRow>();
  rows.forEach(r => { if (r.source_id) m.set(r.source_id, r); });
  return m;
}

/**
 * Returns true when an item should appear as ACTIVE on the board.
 *
 * - If no DB row exists → open (never been touched).
 * - If DB row is Done → suppressed UNLESS forceOpen (delay items whose
 *   underlying source record still requires attention).
 * - If DB row is Snoozed and snoozed_until >= today → suppressed.
 */
function isItemActive(
  sourceId: string,
  dbMap: Map<string, DbActionItemRow>,
  today: string,
  forceOpen = false,
): boolean {
  const row = dbMap.get(sourceId);
  if (!row) return true;
  if (row.status === 'Done') return forceOpen;
  if (row.status === 'Snoozed' && row.snoozed_until && row.snoozed_until >= today) return false;
  return true;
}

// ─── Critical items ────────────────────────────────────────────────────────────
// Definition: truly blocked/failed/rejected items that require immediate action.
// Overdue-only items are NOT critical unless also blocked/failed/rejected.
//
// MUST match ActionBoardPage's critical filter logic exactly.

export function getCriticalItems(d: RawBoardData): BoardItemSummary[] {
  const items: BoardItemSummary[] = [];
  const dbMap = buildDbMap(d.actionItemsDb);

  // Tasks that are explicitly Blocked (have a blocked_reason set)
  d.tasks.forEach(t => {
    if (!d.activeProjectIds.has(t.project_id)) return;
    if (t.status === 'Completed' || t.status === 'Cancelled' || t.status === 'Closed') return;
    if (t.status === 'Needs Review' || t.status === 'Ready for Review') return; // handled by needs-review
    if (!t.blocked_reason) return;
    const sid = `task-${t.id}`;
    if (!isItemActive(sid, dbMap, d.today)) return;
    items.push({
      id: sid,
      category: 'critical',
      title: t.task_name,
      subtitle: `Blocked: ${t.blocked_reason}`,
      projectId: t.project_id,
    });
  });

  // Failed / Correction-Required inspections
  d.inspections.forEach(i => {
    if (!d.activeProjectIds.has(i.project_id)) return;
    if (!(['Failed', 'Correction Required'].includes(i.result) || i.correction_required)) return;
    const sid = `ins-${i.id}`;
    if (!isItemActive(sid, dbMap, d.today)) return;
    items.push({
      id: sid,
      category: 'critical',
      title: `${i.inspection_type} Inspection`,
      subtitle: `Result: ${i.result}`,
      projectId: i.project_id,
    });
  });

  // Rejected / expired / revision-required permits
  d.permits.forEach(p => {
    if (!d.activeProjectIds.has(p.project_id)) return;
    if (!['Rejected', 'Correction Requested', 'Revision Needed', 'Expired'].includes(p.permit_status)) return;
    const sid = `per-${p.id}`;
    if (!isItemActive(sid, dbMap, d.today)) return;
    items.push({
      id: sid,
      category: 'critical',
      title: `${p.permit_type || 'Permit'} — ${p.permit_status}`,
      subtitle: p.permit_number ? `#${p.permit_number}` : 'No permit number',
      projectId: p.project_id,
    });
  });

  // Payments on work hold — matches ActionBoard: filter: i.work_hold_required ? 'critical' : ...
  d.payments.forEach(p => {
    if (!d.activeProjectIds.has(p.project_id)) return;
    if (!(p.work_hold_required || p.status === 'Payment Hold')) return;
    const sid = `pmt-${p.id}`;
    if (!isItemActive(sid, dbMap, d.today)) return;
    items.push({
      id: sid,
      category: 'critical',
      title: p.milestone_name,
      subtitle: `Work hold — $${p.amount.toLocaleString()}`,
      projectId: p.project_id,
    });
  });

  // Incidents with work hold (ANY severity) — matches ActionBoard: filter: i.work_hold_required ? 'critical'
  d.incidents.forEach(i => {
    if (!d.activeProjectIds.has(i.project_id)) return;
    if (!i.work_hold_required) return;
    if (['Resolved', 'Closed'].includes(i.incident_status)) return;
    const sid = `inc-${i.id}`;
    if (!isItemActive(sid, dbMap, d.today)) return;
    items.push({
      id: sid,
      category: 'critical',
      title: i.incident_title,
      subtitle: `${i.severity_level} — Work Hold Active`,
      projectId: i.project_id,
    });
  });

  // Delay reasons: client requested review, client question, or pending admin review
  // These use forceOpen=true — same as ActionBoardPage
  d.delays.forEach((del: any) => {
    if (!d.activeProjectIds.has(del.project_id)) return;
    if (['Resolved', 'Closed'].includes(del.status)) return;

    if (del.client_response_status === 'Client Requested Review') {
      const sid = `delay-review-req-${del.id}`;
      if (isItemActive(sid, dbMap, d.today, true)) {
        items.push({
          id: sid,
          category: 'critical',
          title: `Client Requested Review on Schedule Impact — ${del.delay_category || 'Delay'}`,
          subtitle: 'Client has requested a review — response required',
          projectId: del.project_id,
        });
      }
    }
    if (del.client_response_status === 'Question Submitted') {
      const sid = `delay-question-${del.id}`;
      if (isItemActive(sid, dbMap, d.today, true)) {
        items.push({
          id: sid,
          category: 'critical',
          title: `Client Question on Schedule Impact — ${del.delay_category || 'Delay'}`,
          subtitle: 'Client submitted a question — review and respond',
          projectId: del.project_id,
        });
      }
    }
    if (del.schedule_impact_status === 'Pending Admin Review') {
      const sid = `delay-review-${del.id}`;
      if (isItemActive(sid, dbMap, d.today, true)) {
        items.push({
          id: sid,
          category: 'critical',
          title: `Admin Review Needed: Schedule Impact — ${del.delay_category || 'Delay'}`,
          subtitle: 'Pending admin review',
          projectId: del.project_id,
        });
      }
    }
  });

  console.log('HELPER_CRITICAL_IDS', items.map(i => i.id));
  return items;
}

// ─── Needs-Attention (needs-review) items ─────────────────────────────────────
// Definition: tasks with sub/field responses that need admin review.

export function getNeedsReviewItems(d: RawBoardData): BoardItemSummary[] {
  const items: BoardItemSummary[] = [];
  const dbMap = buildDbMap(d.actionItemsDb);

  d.tasks.forEach(t => {
    if (!d.activeProjectIds.has(t.project_id)) return;
    if (t.status !== 'Needs Review' && t.status !== 'Ready for Review') return;
    const sid = `task-review-${t.id}`;
    if (!isItemActive(sid, dbMap, d.today)) return;
    items.push({
      id: sid,
      category: 'needs-review',
      title: t.task_name,
      subtitle: `${t.status} · ${t.task_type || t.category}`,
      projectId: t.project_id,
    });
  });

  console.log('HELPER_NEEDS_REVIEW_IDS', items.map(i => i.id));
  return items;
}

// ─── Admin Needs Attention (union) ────────────────────────────────────────────
// This is what Action Board "Needs Attention" filter shows:
// critical items + needs-review items combined.

export function getAdminNeedsAttentionItems(d: RawBoardData): BoardItemSummary[] {
  const result = [...getCriticalItems(d), ...getNeedsReviewItems(d)];
  console.log('HELPER_NEEDS_ATTENTION_IDS', result.map(i => i.id));
  return result;
}
