import { useEffect, useState } from 'react';
import { supabase, PhaseChecklist } from '../../lib/supabase';
import { Edit2, CheckCircle, XCircle, MinusCircle, Sparkles, RefreshCw } from 'lucide-react';

const DEFAULT_PHASES: Record<string, string[]> = {
  'Foundation Phase': ['Permit approved','811 completed','Site access ready','Excavation crew confirmed','Concrete/rebar/material ready','Weather acceptable','Payment milestone cleared'],
  'Framing Phase': ['Foundation passed inspection','Lumber/material delivered','Framing crew confirmed','Plans available on site','Weather acceptable','Required payment cleared'],
  'Rough-In Phase': ['Framing completed','Required inspection passed','Electrical subcontractor confirmed','Plumbing subcontractor confirmed','HVAC subcontractor confirmed','Materials ready'],
  'Drywall Phase': ['Rough-in inspections passed','Insulation complete and passed','Drywall material delivered','Crew confirmed'],
  'Final Phase': ['Punch list reviewed','Final inspection scheduled/passed','Final payment status reviewed','Client walkthrough scheduled'],
};

const STATUSES = ['Not Started','Ready','Not Ready','Blocked','Completed'];

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  'Not Started': { color: 'text-concrete-500', icon: MinusCircle },
  'Ready': { color: 'text-site-600', icon: CheckCircle },
  'Not Ready': { color: 'text-hazard-600', icon: XCircle },
  'Blocked': { color: 'text-hazard-600', icon: XCircle },
  'Completed': { color: 'text-site-600', icon: CheckCircle },
};

export default function PhaseReadinessTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<PhaseChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('phase_checklists').select('*').eq('project_id', projectId).order('sort_order');
    setItems(data || []);
    setLoading(false);
  }

  async function seedDefaultPhases() {
    setSeeding(true);
    const rows: any[] = [];
    Object.entries(DEFAULT_PHASES).forEach(([phase, checklistItems], pi) => {
      checklistItems.forEach((item, ii) => {
        rows.push({ project_id: projectId, phase_name: phase, checklist_item: item, status: 'Not Started', sort_order: pi * 100 + ii });
      });
    });
    await supabase.from('phase_checklists').insert(rows);
    setSeeding(false);
    load();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('phase_checklists').update({ status }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  }

  async function generateAiSummary() {
    setAiLoading(true);
    const phases = [...new Set(items.map(i => i.phase_name))];
    const lines: string[] = ['Phase Readiness Summary:', ''];
    let overallReady = true;
    for (const phase of phases) {
      const phaseItems = items.filter(i => i.phase_name === phase);
      const notReady = phaseItems.filter(i => ['Not Ready','Blocked'].includes(i.status));
      const ready = phaseItems.filter(i => ['Ready','Completed'].includes(i.status));
      const pct = Math.round((ready.length / phaseItems.length) * 100);
      lines.push(`${phase}: ${pct}% ready`);
      if (notReady.length > 0) {
        overallReady = false;
        lines.push(`  Not ready: ${notReady.map(i => i.checklist_item).join(', ')}`);
        lines.push(`  Action needed: Resolve blockers before this phase can begin.`);
      } else if (ready.length === phaseItems.length) {
        lines.push(`  All items ready. Phase can proceed.`);
      }
      lines.push('');
    }
    if (overallReady) {
      lines.push('All phases are tracking well. Continue monitoring as work progresses.');
    } else {
      lines.push('Action Required: Address all Not Ready and Blocked items before starting each phase.');
    }
    await new Promise(r => setTimeout(r, 500));
    setAiSummary(lines.join('\n'));
    setAiLoading(false);
  }

  const phases = [...new Set(items.map(i => i.phase_name))];

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading checklists...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {items.length === 0 ? (
          <div className="text-sm text-concrete-500">No phase checklists yet.</div>
        ) : (
          <div className="text-sm font-semibold text-concrete-700">{phases.length} phases tracked</div>
        )}
        <div className="flex gap-2">
          {items.length === 0 && (
            <button onClick={seedDefaultPhases} disabled={seeding} className="btn-secondary disabled:opacity-50">
              <RefreshCw className="w-3.5 h-3.5" />
              {seeding ? 'Creating...' : 'Load Default Phases'}
            </button>
          )}
          {items.length > 0 && (
            <button onClick={generateAiSummary} disabled={aiLoading} className="btn-primary text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              {aiLoading ? 'Analyzing...' : 'AI Summary'}
            </button>
          )}
        </div>
      </div>

      {aiSummary && (
        <div className="bg-concrete-50 border border-concrete-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-concrete-600 uppercase tracking-wide">AI Phase Summary</span>
          </div>
          <pre className="text-sm text-concrete-700 whitespace-pre-wrap font-sans leading-relaxed">{aiSummary}</pre>
        </div>
      )}

      {phases.map(phase => {
        const phaseItems = items.filter(i => i.phase_name === phase);
        const readyCount = phaseItems.filter(i => ['Ready','Completed'].includes(i.status)).length;
        const blockedCount = phaseItems.filter(i => ['Not Ready','Blocked'].includes(i.status)).length;
        const pct = Math.round((readyCount / phaseItems.length) * 100);
        return (
          <div key={phase} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-concrete-100 bg-concrete-50/50">
              <div>
                <h3 className="text-sm font-bold text-concrete-800">{phase}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-32 h-1.5 bg-concrete-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-site-500' : blockedCount > 0 ? 'bg-hazard-400' : 'bg-steel-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-concrete-500">{readyCount}/{phaseItems.length} ready</span>
                  {blockedCount > 0 && <span className="text-xs text-hazard-600">{blockedCount} blocked</span>}
                </div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pct === 100 ? 'text-site-700 bg-site-100' : blockedCount > 0 ? 'text-hazard-700 bg-hazard-100' : 'text-amber-700 bg-amber-100'}`}>
                {pct === 100 ? 'Ready' : blockedCount > 0 ? 'Blocked' : `${pct}%`}
              </span>
            </div>
            <div className="divide-y divide-concrete-50">
              {phaseItems.map(item => {
                const config = statusConfig[item.status] || statusConfig['Not Started'];
                const StatusIcon = config.icon;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-concrete-50 transition-colors">
                    <StatusIcon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                    <span className="flex-1 text-sm text-concrete-700">{item.checklist_item}</span>
                    <select
                      value={item.status}
                      onChange={e => updateStatus(item.id, e.target.value)}
                      className="text-xs border border-concrete-200 rounded-lg px-2 py-1 bg-white text-concrete-600 focus:outline-none focus:border-steel-400"
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
