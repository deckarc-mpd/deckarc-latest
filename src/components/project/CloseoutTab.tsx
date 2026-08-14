import { useEffect, useState } from 'react';
import { supabase, ProjectCloseoutChecklist, Project } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, Circle, MinusCircle, ClipboardCheck, AlertTriangle, RefreshCw } from 'lucide-react';

const CLOSEOUT_ITEMS = [
  'Final inspection passed',
  'Punch list reviewed and completed',
  'Client walkthrough completed',
  'Final payment reviewed and collected',
  'Final site photos uploaded',
  'Warranty items documented if applicable',
  'Client sign-off recorded',
  'Final client update approved and sent',
];

const STATUS_CONFIG = {
  'Pending': { icon: Circle, color: 'text-concrete-400', bg: 'hover:bg-concrete-50' },
  'Complete': { icon: CheckCircle, color: 'text-site-600', bg: 'bg-site-50' },
  'N/A': { icon: MinusCircle, color: 'text-concrete-400', bg: 'bg-concrete-50' },
};

export default function CloseoutTab({ project, onProjectUpdate }: { project: Project; onProjectUpdate: () => void }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ProjectCloseoutChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [closingOut, setClosingOut] = useState(false);

  const isAdmin = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN'].includes(profile?.role || '');

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('project_closeout_checklists')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order');
    setItems(data || []);
    setLoading(false);
  }

  async function seedItems() {
    setSeeding(true);
    const rows = CLOSEOUT_ITEMS.map((item, i) => ({
      project_id: project.id,
      item_name: item,
      status: 'Pending',
      sort_order: i,
    }));
    await supabase.from('project_closeout_checklists').insert(rows);
    setSeeding(false);
    load();
  }

  async function updateStatus(id: string, status: string) {
    const completedAt = status === 'Complete' ? new Date().toISOString() : null;
    await supabase.from('project_closeout_checklists').update({
      status,
      completed_at: completedAt,
      completed_by_user_id: status === 'Complete' ? profile?.id : null,
    }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, status, completed_at: completedAt || null } : i));
  }

  async function markProjectComplete() {
    const incomplete = items.filter(i => i.status === 'Pending');
    if (incomplete.length > 0) {
      if (!window.confirm(`${incomplete.length} closeout item(s) are still pending. Are you sure you want to mark this project as Completed?`)) return;
    }
    setClosingOut(true);
    await supabase.from('projects').update({
      status: 'Completed',
      actual_finish_date: new Date().toISOString().split('T')[0],
      progress_percentage: 100,
      alert_status: 'green',
    }).eq('id', project.id);
    setClosingOut(false);
    onProjectUpdate();
  }

  const complete = items.filter(i => i.status === 'Complete' || i.status === 'N/A');
  const pending = items.filter(i => i.status === 'Pending');
  const pct = items.length > 0 ? Math.round((complete.length / items.length) * 100) : 0;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-concrete-500" />
          <h3 className="text-sm font-semibold text-concrete-700">Project Closeout Checklist</h3>
        </div>
        {isAdmin && items.length === 0 && (
          <button onClick={seedItems} disabled={seeding} className="btn-secondary text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> {seeding ? 'Creating...' : 'Load Checklist'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2 text-concrete-300" />
          No closeout checklist yet. Load the standard checklist to begin project closeout.
        </div>
      ) : (
        <>
          {/* Progress summary */}
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-concrete-800">Closeout Progress</span>
              <span className={`text-sm font-bold ${pct === 100 ? 'text-site-600' : pending.length > 0 ? 'text-amber-600' : 'text-concrete-600'}`}>{pct}%</span>
            </div>
            <div className="h-2 bg-concrete-100 rounded-full overflow-hidden mb-2">
              <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-site-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex gap-4 text-xs text-concrete-500">
              <span className="text-site-600 font-medium">{complete.length} complete</span>
              <span>{pending.length} pending</span>
            </div>
          </div>

          {pending.length > 0 && project.status !== 'Completed' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg mb-4">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{pending.length} item{pending.length > 1 ? 's' : ''} still pending. Complete these before marking the project closed.</span>
            </div>
          )}

          <div className="card overflow-hidden mb-4">
            <div className="divide-y divide-concrete-50">
              {items.map(item => {
                const config = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG['Pending'];
                const StatusIcon = config.icon;
                return (
                  <div key={item.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${config.bg}`}>
                    <StatusIcon className={`w-5 h-5 flex-shrink-0 ${config.color}`} />
                    <span className={`flex-1 text-sm ${item.status === 'Complete' ? 'text-concrete-400 line-through' : item.status === 'N/A' ? 'text-concrete-400' : 'text-concrete-800'}`}>
                      {item.item_name}
                    </span>
                    {item.completed_at && (
                      <span className="text-xs text-concrete-400 flex-shrink-0">
                        {new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {isAdmin && (
                      <select
                        value={item.status}
                        onChange={e => updateStatus(item.id, e.target.value)}
                        className="text-xs border border-concrete-200 rounded-lg px-2 py-1 bg-white text-concrete-600 focus:outline-none focus:border-steel-400 flex-shrink-0"
                      >
                        <option>Pending</option>
                        <option>Complete</option>
                        <option>N/A</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isAdmin && project.status !== 'Completed' && (
            <button
              onClick={markProjectComplete}
              disabled={closingOut}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                pending.length === 0
                  ? 'bg-site-700 hover:bg-site-800 text-white shadow-sm'
                  : 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
              } disabled:opacity-50`}
            >
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {closingOut ? 'Closing project...' : pending.length > 0 ? `Mark Complete (${pending.length} items pending)` : 'Mark Project Complete'}
              </span>
            </button>
          )}

          {project.status === 'Completed' && (
            <div className="flex items-center gap-2 bg-site-50 border border-site-200 text-site-700 px-4 py-3 rounded-xl">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold text-sm">Project marked as Completed</span>
              {project.actual_finish_date && (
                <span className="text-xs ml-auto">
                  {new Date(project.actual_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
