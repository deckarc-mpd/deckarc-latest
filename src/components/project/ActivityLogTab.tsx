import { useEffect, useState } from 'react';
import { supabase, ActivityLog } from '../../lib/supabase';
import { Activity, Filter } from 'lucide-react';

const MODULE_COLORS: Record<string, string> = {
  'Task':          'bg-steel-100 text-steel-700',
  'Permit':        'bg-amber-100 text-amber-700',
  'Inspection':    'bg-amber-100 text-amber-700',
  'Payment':       'bg-site-100 text-site-700',
  'Change Order':  'bg-steel-100 text-steel-700',
  'Material':      'bg-concrete-100 text-concrete-600',
  'Incident':      'bg-hazard-100 text-hazard-700',
  'RFI':           'bg-concrete-100 text-concrete-600',
  'Daily Update':  'bg-steel-100 text-steel-700',
  'Schedule':      'bg-amber-100 text-amber-700',
  'Project':       'bg-steel-100 text-steel-700',
};

export async function logActivity(params: {
  projectId: string | null;
  userId: string | null;
  userFullName: string;
  userRole: string;
  actionType: string;
  module: string;
  relatedRecordId?: string | null;
  relatedRecordType?: string;
  oldValue?: string;
  newValue?: string;
  notes?: string;
}) {
  await supabase.from('activity_log').insert({
    project_id: params.projectId,
    user_id: params.userId,
    user_full_name: params.userFullName,
    user_role: params.userRole,
    action_type: params.actionType,
    module: params.module,
    related_record_id: params.relatedRecordId || null,
    related_record_type: params.relatedRecordType || '',
    old_value: params.oldValue || '',
    new_value: params.newValue || '',
    notes: params.notes || '',
  });
}

const thCls = 'px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap';

export default function ActivityLogTab({ projectId }: { projectId: string }) {
  const [logs, setLogs]               = useState<ActivityLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [moduleFilter, setModuleFilter] = useState('All');

  const modules = ['All', 'Task', 'Permit', 'Inspection', 'Payment', 'Material', 'Incident', 'RFI', 'Change Order', 'Daily Update', 'Schedule', 'Project'];

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs(data || []);
    setLoading(false);
  }

  const filtered = moduleFilter === 'All' ? logs : logs.filter(l => l.module === moduleFilter);

  function fmtTime(ts: string) {
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading activity log...</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-concrete-400" />
          <span className="text-sm text-concrete-500">{filtered.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-concrete-400" />
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="text-xs border border-concrete-200 rounded-lg px-2 py-1.5 bg-white text-concrete-600 focus:outline-none focus:border-steel-400"
          >
            {modules.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 text-concrete-400">
          <Activity className="w-9 h-9 mx-auto mb-2.5 text-concrete-200" />
          <p className="text-sm">No activity recorded yet.</p>
          <p className="text-xs mt-1 text-concrete-300">Actions like task status changes, delays, and payment updates will appear here.</p>
        </div>
      ) : (
        <div className="bg-white border border-concrete-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className={thCls}>Date / Time</th>
                  <th className={thCls}>Module</th>
                  <th className={thCls}>Action</th>
                  <th className={`${thCls} hidden md:table-cell`}>Performed By</th>
                  <th className={`${thCls} hidden lg:table-cell`}>Details</th>
                  <th className={`${thCls} hidden lg:table-cell`}>Visibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors group">

                    {/* Date / Time */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className="text-xs text-concrete-500">{fmtTime(log.created_at)}</span>
                    </td>

                    {/* Module badge */}
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODULE_COLORS[log.module] || 'bg-concrete-100 text-concrete-600'}`}>
                        {log.module || 'System'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm text-concrete-800">{log.action_type}</p>
                      {(log.old_value || log.new_value) && (
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                          {log.old_value && <span className="text-concrete-400 line-through truncate max-w-[100px]">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="text-concrete-300">→</span>}
                          {log.new_value && <span className="text-concrete-600 truncate max-w-[100px]">{log.new_value}</span>}
                        </div>
                      )}
                    </td>

                    {/* Performed By */}
                    <td className="px-4 py-3 align-middle hidden md:table-cell">
                      <p className="text-sm text-concrete-700">{log.user_full_name || 'System'}</p>
                      {log.user_role && (
                        <p className="text-xs text-concrete-400 mt-0.5">{log.user_role.replace(/_/g, ' ')}</p>
                      )}
                    </td>

                    {/* Details / Notes */}
                    <td className="px-4 py-3 align-middle hidden lg:table-cell">
                      {log.notes
                        ? <p className="text-xs text-concrete-500 max-w-xs truncate">{log.notes}</p>
                        : <span className="text-xs text-concrete-200">—</span>}
                    </td>

                    {/* Visibility */}
                    <td className="px-4 py-3 align-middle hidden lg:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-concrete-100 text-concrete-500 border border-concrete-200">
                        Internal
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-concrete-400">
              Showing <span className="font-medium text-concrete-600">{filtered.length}</span> of{' '}
              <span className="font-medium text-concrete-600">{logs.length}</span> entries
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
