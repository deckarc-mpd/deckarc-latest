import { useState } from 'react';
import { supabase, Project, Task, DailyUpdate, Permit, Inspection, ClientDecision,
  Material, Incident, RFI, PunchListItem, PaymentMilestone, WeatherRisk } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Sparkles, FileText, Users, Clipboard } from 'lucide-react';

export default function AiSummaryTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const [internalSummary, setInternalSummary] = useState('');
  const [clientSummary, setClientSummary] = useState('');
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const isClient = profile?.role === 'CLIENT';
  const canSeeInternal = !isClient;

  async function generateInternal() {
    setLoadingInternal(true);
    const [
      tasksRes, updatesRes, permitsRes, inspectionsRes, decisionsRes,
      materialsRes, incidentsRes, rfisRes, punchRes, paymentsRes,
      weatherRes, changeOrdersRes, crewRes, phaseRes
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('project_id', project.id),
      supabase.from('daily_updates').select('*').eq('project_id', project.id).order('update_date', { ascending: false }).limit(5),
      supabase.from('permits').select('*').eq('project_id', project.id),
      supabase.from('inspections').select('*').eq('project_id', project.id),
      supabase.from('client_decisions').select('*').eq('project_id', project.id),
      supabase.from('materials').select('*').eq('project_id', project.id),
      supabase.from('incidents').select('*').eq('project_id', project.id),
      supabase.from('rfis').select('*').eq('project_id', project.id),
      supabase.from('punch_list_items').select('*').eq('project_id', project.id),
      supabase.from('payment_milestones').select('*').eq('project_id', project.id),
      supabase.from('weather_risks').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(7),
      supabase.from('change_orders').select('*').eq('project_id', project.id),
      supabase.from('crew_confirmations').select('*').eq('project_id', project.id).order('scheduled_date', { ascending: false }).limit(5),
      supabase.from('phase_checklists').select('*').eq('project_id', project.id),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const tasks: Task[] = tasksRes.data || [];
    const updates: DailyUpdate[] = updatesRes.data || [];
    const permits: Permit[] = permitsRes.data || [];
    const inspections: Inspection[] = inspectionsRes.data || [];
    const decisions: ClientDecision[] = decisionsRes.data || [];
    const materials: Material[] = materialsRes.data || [];
    const incidents: Incident[] = incidentsRes.data || [];
    const rfis: RFI[] = rfisRes.data || [];
    const punch: PunchListItem[] = punchRes.data || [];
    const payments: PaymentMilestone[] = paymentsRes.data || [];
    const weather: WeatherRisk[] = weatherRes.data || [];
    const changeOrders: any[] = changeOrdersRes.data || [];
    const crews: any[] = crewRes.data || [];
    const phases: any[] = phaseRes.data || [];

    const completed = tasks.filter(t => t.status === 'Completed');
    const delayed = tasks.filter(t => t.status === 'Delayed');
    const overdue = tasks.filter(t => t.status !== 'Completed' && t.planned_finish_date && t.planned_finish_date < today);
    const inProgress = tasks.filter(t => t.status === 'In Progress');
    const blocked = tasks.filter(t => t.blocked_reason);

    const pendingPermits = permits.filter(p => !['Approved', 'Not Required'].includes(p.permit_status));
    const failedInspections = inspections.filter(i => ['Failed', 'Correction Required', 'Reinspection Required'].includes(i.result));
    const openDecisions = decisions.filter(d => d.status !== 'Received');

    const materialsNotReady = materials.filter(m => !['Ready', 'Delivered'].includes(m.material_ready_status));
    const openIncidents = incidents.filter(i => !['Resolved', 'Closed'].includes(i.incident_status));
    const openRFIs = rfis.filter(r => !['Answered', 'Closed'].includes(r.status));
    const openPunch = punch.filter(p => !['Complete', 'Closed'].includes(p.status));
    const overduePayments = payments.filter(p => p.status === 'Overdue' || (p.due_date && p.due_date < today && p.status !== 'Paid'));
    const holdPayments = payments.filter(p => p.work_hold_required);
    const approvedCOs = changeOrders.filter(co => co.approval_status === 'Approved');
    const pendingCOs = changeOrders.filter(co => ['Draft', 'Sent'].includes(co.approval_status));
    const highWeather = weather.filter(w => w.risk_level === 'High');
    const unconfirmedCrews = crews.filter(c => c.confirmation_status !== 'Confirmed');
    const blockedPhases = phases.filter(p => ['Not Ready', 'Blocked'].includes(p.status));

    // ── Confidence scoring ──────────────────────────────────────────────────
    const missingInfo: string[] = [];
    if (tasks.length === 0) missingInfo.push('No tasks added yet');
    if (updates.length === 0) missingInfo.push('No daily updates submitted');
    if (inProgress.length > 0 && updates.filter(u => {
      const d = new Date(u.update_date); const diff = (Date.now() - d.getTime()) / 86400000;
      return diff <= 3;
    }).length === 0) missingInfo.push('No updates in the last 3 days');
    if (payments.length === 0) missingInfo.push('No payment milestones defined');
    if (permits.length === 0 && project.status !== 'Planning') missingInfo.push('No permits tracked');

    let confidenceLevel: 'High' | 'Medium' | 'Low' = 'High';
    if (missingInfo.length >= 3) confidenceLevel = 'Low';
    else if (missingInfo.length >= 1) confidenceLevel = 'Medium';

    const lines: string[] = [
      `INTERNAL PROJECT SUMMARY — ${project.project_name}`,
      `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      '',
      `OVERALL STATUS: ${project.status} | Progress: ${project.progress_percentage}%`,
    ];

    // Confidence block
    lines.push('');
    lines.push(`AI CONFIDENCE: ${confidenceLevel}${confidenceLevel !== 'High' ? ' — Admin verification recommended' : ''}`);
    if (missingInfo.length > 0) {
      lines.push(`Missing information:`);
      missingInfo.forEach(m => lines.push(`  • ${m}`));
    }
    if (confidenceLevel === 'Low') {
      lines.push('NOTE: Due to insufficient data, conclusions in this report may be incomplete. Please review manually.');
    }

    if (project.projected_finish_date && project.expected_finish_date && project.projected_finish_date !== project.expected_finish_date) {
      lines.push(`FINISH DATE SHIFTED: Original ${new Date(project.expected_finish_date + 'T00:00:00').toLocaleDateString()} → Projected ${new Date(project.projected_finish_date + 'T00:00:00').toLocaleDateString()}`);
    }

    // Tasks
    lines.push('', `TASKS: ${completed.length} completed / ${tasks.length} total`);
    if (inProgress.length > 0) {
      lines.push(`  In Progress (${inProgress.length}):`);
      inProgress.forEach(t => lines.push(`    - ${t.task_name} — ${t.progress_percentage}%`));
    }
    if (delayed.length > 0 || overdue.length > 0) {
      lines.push('  Delays/Overdue:');
      delayed.forEach(t => lines.push(`    - DELAYED: ${t.task_name} (+${t.delay_days}d) — ${t.delay_reason || 'No reason given'}`));
      overdue.filter(t => !delayed.includes(t)).forEach(t => lines.push(`    - OVERDUE: ${t.task_name} (due ${t.planned_finish_date})`));
    }
    if (blocked.length > 0) {
      lines.push('  Blocked:');
      blocked.forEach(t => lines.push(`    - ${t.task_name}: ${t.blocked_reason}`));
    }

    // Payments
    if (overduePayments.length > 0 || holdPayments.length > 0) {
      lines.push('', 'PAYMENT ISSUES:');
      holdPayments.forEach(p => lines.push(`  - WORK HOLD: ${p.milestone_name} ($${p.amount.toLocaleString()}) — do not proceed`));
      overduePayments.filter(p => !holdPayments.includes(p)).forEach(p => lines.push(`  - OVERDUE: ${p.milestone_name} ($${p.amount.toLocaleString()}) due ${p.due_date}`));
    }

    // Permits
    if (pendingPermits.length > 0) {
      lines.push('', `PERMITS — ${pendingPermits.length} pending:`);
      pendingPermits.forEach(p => {
        lines.push(`  - ${p.permit_type}: ${p.permit_status}${p.revision_requested ? ' (revision requested)' : ''}`);
      });
    }

    // Inspections
    if (failedInspections.length > 0) {
      lines.push('', 'INSPECTION ISSUES:');
      failedInspections.forEach(i => {
        lines.push(`  - ${i.inspection_type}: ${i.result}${i.correction_notes ? ` — ${i.correction_notes}` : ''}`);
      });
    }

    // Materials
    if (materialsNotReady.length > 0) {
      lines.push('', `MATERIALS NOT READY (${materialsNotReady.length}):`);
      materialsNotReady.slice(0, 5).forEach(m => lines.push(`  - ${m.material_name}: ${m.material_ready_status} (expected ${m.expected_delivery_date || 'TBD'})`));
    }

    // Incidents
    if (openIncidents.length > 0) {
      lines.push('', `OPEN INCIDENTS (${openIncidents.length}):`);
      openIncidents.forEach(i => lines.push(`  - [${i.severity_level}] ${i.incident_title} — ${i.incident_status}`));
    }

    // RFIs
    if (openRFIs.length > 0) {
      lines.push('', `OPEN RFIs / QUESTIONS (${openRFIs.length}):`);
      openRFIs.forEach(r => lines.push(`  - ${r.question_title} → ${r.assigned_to || 'Unassigned'}${r.due_date ? ` (due ${r.due_date})` : ''}`));
    }

    // Change Orders
    if (pendingCOs.length > 0 || approvedCOs.length > 0) {
      lines.push('', 'CHANGE ORDERS:');
      if (pendingCOs.length > 0) lines.push(`  - ${pendingCOs.length} pending approval`);
      if (approvedCOs.length > 0) {
        const totalCost = approvedCOs.reduce((s, co) => s + co.cost_impact, 0);
        const totalTime = approvedCOs.reduce((s, co) => s + co.time_impact_days, 0);
        lines.push(`  - ${approvedCOs.length} approved: +$${totalCost.toLocaleString()} cost, +${totalTime} schedule days`);
      }
    }

    // Weather
    if (highWeather.length > 0) {
      lines.push('', `WEATHER RISKS (${highWeather.length} high-risk days logged):`);
      highWeather.slice(0, 3).forEach(w => lines.push(`  - ${w.risk_date}: ${w.risk_type} (${w.risk_level})`));
    }

    // Phase Readiness
    if (blockedPhases.length > 0) {
      lines.push('', `PHASE READINESS — ${blockedPhases.length} items blocked:`);
      const blockGroups: Record<string, string[]> = {};
      blockedPhases.forEach((p: any) => {
        if (!blockGroups[p.phase_name]) blockGroups[p.phase_name] = [];
        blockGroups[p.phase_name].push(p.checklist_item);
      });
      Object.entries(blockGroups).forEach(([phase, items]) => {
        lines.push(`  ${phase}: ${items.join(', ')}`);
      });
    }

    // Crew
    if (unconfirmedCrews.length > 0) {
      lines.push('', `CREW CONFIRMATIONS — ${unconfirmedCrews.length} unconfirmed`);
    }

    // Punch list
    if (openPunch.length > 0) {
      lines.push('', `PUNCH LIST — ${openPunch.length} open items`);
    }

    // Decisions
    if (openDecisions.length > 0) {
      lines.push('', `CLIENT DECISIONS NEEDED (${openDecisions.length}):`);
      openDecisions.forEach(d => lines.push(`  - ${d.decision_title}: ${d.status}${d.needed_by_date ? ` (by ${d.needed_by_date})` : ''}`));
    }

    // Recent updates
    if (updates.length > 0) {
      lines.push('', 'RECENT DAILY UPDATES:');
      updates.slice(0, 3).forEach(u => {
        lines.push(`  ${new Date(u.update_date + 'T00:00:00').toLocaleDateString()}: ${u.work_completed_today}`);
        if (u.delay_days > 0) lines.push(`    Delay: ${u.delay_reason} (+${u.delay_days}d)`);
      });
    }

    // Recommended actions
    lines.push('', 'RECOMMENDED NEXT ACTIONS:');
    const actions: string[] = [];
    if (holdPayments.length > 0) actions.push(`URGENT: Resolve ${holdPayments.length} work hold payment(s) before proceeding.`);
    if (openIncidents.filter((i: any) => i.severity_level === 'Critical').length > 0) actions.push('URGENT: Address critical incident(s) immediately.');
    if (overdue.length > 0) actions.push(`Address ${overdue.length} overdue task(s).`);
    if (failedInspections.length > 0) actions.push(`Reschedule ${failedInspections.length} failed inspection(s).`);
    if (pendingPermits.filter((p: any) => ['Rejected', 'Correction Requested'].includes(p.permit_status)).length > 0) actions.push('Respond to permit rejection/correction requests.');
    if (openRFIs.filter((r: any) => r.due_date && r.due_date <= today).length > 0) actions.push('Answer overdue RFIs.');
    if (materialsNotReady.length > 0) actions.push(`Confirm delivery of ${materialsNotReady.length} unready material(s).`);
    if (openDecisions.length > 0) actions.push(`Follow up on ${openDecisions.length} client decision(s).`);
    if (actions.length === 0) actions.push('Continue current progress. Submit daily updates from all field crews.');
    actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));

    await new Promise(r => setTimeout(r, 600));
    setInternalSummary(lines.join('\n'));

    await supabase.from('ai_reports').insert({
      project_id: project.id,
      report_type: 'internal',
      report_text: lines.join('\n'),
      created_by_user_id: profile?.id,
    }).then(() => {});

    setLoadingInternal(false);
  }

  async function generateClient() {
    setLoadingClient(true);
    const [tasksRes, decisionsRes, paymentsRes, changeOrdersRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('project_id', project.id).eq('is_client_visible', true),
      supabase.from('client_decisions').select('*').eq('project_id', project.id).neq('status', 'Received'),
      supabase.from('payment_milestones').select('*').eq('project_id', project.id),
      supabase.from('change_orders').select('*').eq('project_id', project.id).eq('approval_status', 'Approved'),
    ]);

    const tasks: Task[] = tasksRes.data || [];
    const decisions: ClientDecision[] = decisionsRes.data || [];
    const payments: PaymentMilestone[] = paymentsRes.data || [];
    const approvedCOs: any[] = changeOrdersRes.data || [];
    const completedTasks = tasks.filter(t => t.status === 'Completed');
    const upcomingTasks = tasks.filter(t => t.status !== 'Completed').slice(0, 3);
    const nextPayment = payments.find(p => !['Paid', 'Waived'].includes(p.status));

    const lines: string[] = [
      `PROJECT UPDATE — ${project.project_name}`,
      `For: ${project.client_name}`,
      `Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      '',
      'Dear Client,',
      '',
      `We are pleased to share the latest update on your ${project.project_type || 'project'}. Your project is currently ${project.progress_percentage}% complete${project.status === 'Delayed' ? ' with an updated timeline' : ' and progressing well'}.`,
      '',
    ];

    if (completedTasks.length > 0) {
      lines.push('COMPLETED WORK:');
      completedTasks.forEach(t => {
        lines.push(`  - ${t.client_visible_notes || t.task_name + ' — completed successfully.'}`);
      });
      lines.push('');
    }

    if (upcomingTasks.length > 0) {
      lines.push('UPCOMING WORK:');
      upcomingTasks.forEach(t => {
        lines.push(`  - ${t.client_visible_notes || 'Next step: ' + t.task_name + '.'}`);
      });
      lines.push('');
    }

    if (project.projected_finish_date) {
      const finishStr = new Date(project.projected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      lines.push(`PROJECTED COMPLETION: ${finishStr}`);
      if (project.expected_finish_date && project.projected_finish_date !== project.expected_finish_date) {
        lines.push('We have updated the projected completion date to ensure all work meets our quality standards.');
      }
      lines.push('');
    }

    if (approvedCOs.length > 0) {
      const totalCO = approvedCOs.reduce((s: number, co: any) => s + co.cost_impact, 0);
      if (totalCO > 0) {
        lines.push('APPROVED CHANGE ORDERS:');
        approvedCOs.forEach((co: any) => {
          if (co.client_visible_notes) lines.push(`  - ${co.title}: ${co.client_visible_notes}`);
        });
        lines.push('');
      }
    }

    if (nextPayment) {
      lines.push('UPCOMING PAYMENT:');
      lines.push(`  - ${nextPayment.milestone_name}: $${nextPayment.amount.toLocaleString()}${nextPayment.due_date ? ` due ${new Date(nextPayment.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''}`);
      lines.push('');
    }

    if (decisions.length > 0) {
      lines.push('YOUR INPUT IS NEEDED:');
      decisions.forEach(d => {
        lines.push(`  - ${d.decision_title}`);
        if (d.client_visible_note) lines.push(`    ${d.client_visible_note}`);
        if (d.needed_by_date) lines.push(`    Please respond by: ${new Date(d.needed_by_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`);
      });
      lines.push('');
    }

    if (project.client_visible_notes) {
      lines.push('NOTES FROM YOUR PROJECT TEAM:');
      lines.push(project.client_visible_notes);
      lines.push('');
    }

    lines.push('Thank you for your continued trust. Please do not hesitate to reach out with any questions.');
    lines.push('');
    lines.push('Best regards,');
    lines.push('CP360 — ConstructionProgress360 | A CONVAZANT Product');

    await new Promise(r => setTimeout(r, 600));
    setClientSummary(lines.join('\n'));

    await supabase.from('ai_reports').insert({
      project_id: project.id,
      report_type: 'client',
      report_text: lines.join('\n'),
      created_by_user_id: profile?.id,
    }).then(() => {});

    setLoadingClient(false);
  }

  function copyText(text: string, type: string) {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <h2 className="text-base font-semibold text-concrete-800">AI Project Summary</h2>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">AI-Enabled</span>
      </div>

      <div className={`grid gap-5 ${canSeeInternal ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {canSeeInternal && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-concrete-700" />
                <h3 className="text-sm font-semibold text-concrete-800">Internal Report</h3>
              </div>
              <button onClick={generateInternal} disabled={loadingInternal} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                {loadingInternal ? 'Analyzing...' : 'Generate'}
              </button>
            </div>
            {internalSummary ? (
              <div>
                <pre className="text-xs text-concrete-700 whitespace-pre-wrap leading-relaxed font-sans bg-concrete-50 rounded-lg p-3 max-h-96 overflow-y-auto">
                  {internalSummary}
                </pre>
                <button onClick={() => copyText(internalSummary, 'internal')} className="mt-2 flex items-center gap-1.5 text-xs text-concrete-500 hover:text-concrete-700 transition-colors">
                  <Clipboard className="w-3.5 h-3.5" />
                  {copied === 'internal' ? 'Copied!' : 'Copy to clipboard'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-concrete-400">Generate a comprehensive internal report analyzing tasks, payments, permits, inspections, materials, incidents, RFIs, change orders, weather risks, phase readiness, crew confirmations, and recommended next actions.</p>
            )}
          </div>
        )}

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-steel-600" />
              <h3 className="text-sm font-semibold text-concrete-800">Client Update</h3>
            </div>
            <button onClick={generateClient} disabled={loadingClient} className="inline-flex items-center gap-1.5 text-xs bg-steel-700 hover:bg-steel-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {loadingClient ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {clientSummary ? (
            <div>
              <pre className="text-xs text-concrete-700 whitespace-pre-wrap leading-relaxed font-sans bg-steel-50 rounded-lg p-3 max-h-96 overflow-y-auto">
                {clientSummary}
              </pre>
              <button onClick={() => copyText(clientSummary, 'client')} className="mt-2 flex items-center gap-1.5 text-xs text-concrete-500 hover:text-concrete-700 transition-colors">
                <Clipboard className="w-3.5 h-3.5" />
                {copied === 'client' ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-concrete-400">Generate a professional, client-friendly update with progress highlights, upcoming work, approved change orders, next payment, and any decisions needed. No internal details included.</p>
          )}
        </div>
      </div>
    </div>
  );
}
