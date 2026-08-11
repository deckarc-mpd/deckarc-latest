import { useEffect, useState } from 'react';
import { supabase, ScheduleChangeLog, Task } from '../../lib/supabase';
import { History, Calendar, ArrowRight, CheckCircle, XCircle, User, GitBranch } from 'lucide-react';

const CHANGE_TYPE_COLORS: Record<string, string> = {
  'Task Delay':              'bg-red-100 text-red-700',
  'Weather Delay':           'bg-blue-100 text-blue-700',
  'Holiday Conflict':        'bg-amber-100 text-amber-700',
  'Permit Delay':            'bg-amber-100 text-amber-700',
  'Inspection Delay':        'bg-amber-100 text-amber-700',
  'Material Delay':          'bg-orange-100 text-orange-700',
  'Incident Delay':          'bg-red-100 text-red-700',
  'Payment Delay':           'bg-red-100 text-red-700',
  'Client Decision Delay':   'bg-yellow-100 text-yellow-700',
  'Change Order Impact':     'bg-slate-100 text-slate-700',
  'Subcontractor Delay':     'bg-orange-100 text-orange-700',
  'Manual Adjustment':       'bg-slate-100 text-slate-600',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTs(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ScheduleChangeLogTab({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<ScheduleChangeLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [l, t] = await Promise.all([
      supabase.from('schedule_change_log').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id,task_name').eq('project_id', projectId),
    ]);
    setLogs(l.data || []);
    setTasks(t.data || []);
    setLoading(false);
  }

  const taskName = (id: string | null) =>
    id ? (tasks.find(t => t.id === id)?.task_name || 'Unknown Task') : 'Project Level';

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading history...
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Schedule Change History</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Read-only audit trail of all approved changes, overrides, and client acknowledgements.
          </p>
        </div>
        {logs.length > 0 && (
          <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg flex-shrink-0">
            {logs.length} change{logs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
            <History className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No schedule changes yet</p>
          <p className="text-xs text-slate-400 mt-1">Changes are recorded automatically when schedule approvals are processed.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition-colors">
              <div className="flex items-start gap-4 p-4">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CHANGE_TYPE_COLORS[log.change_type] || 'bg-slate-100 text-slate-600'}`}>
                      {log.change_type}
                    </span>
                    <span className="text-xs text-slate-400">{fmtTs(log.created_at)}</span>
                  </div>

                  <p className="text-sm font-semibold text-slate-800 mb-2">{taskName(log.affected_task_id)}</p>

                  {/* Date changes */}
                  <div className="space-y-1.5 mb-2">
                    {(log.old_finish_date || log.new_finish_date) && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 w-24 flex-shrink-0">Task finish:</span>
                        <span className="text-slate-500 line-through">{fmtDate(log.old_finish_date)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        <span className="text-red-600 font-semibold">{fmtDate(log.new_finish_date)}</span>
                      </div>
                    )}
                    {log.new_projected_finish_date && log.new_projected_finish_date !== log.old_projected_finish_date && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 w-24 flex-shrink-0">Project finish:</span>
                        <span className="text-slate-500 line-through">{fmtDate(log.old_projected_finish_date)}</span>
                        <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        <span className="text-red-600 font-semibold">{fmtDate(log.new_projected_finish_date)}</span>
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    {log.reason && <span className="text-slate-500">Reason: {log.reason}</span>}
                    {log.responsible_party && (
                      <span className="flex items-center gap-1">
                        <User className="w-2.5 h-2.5" /> {log.responsible_party}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-slate-400 pt-2">
        Schedule Change History is read-only. Changes are recorded automatically by the schedule engine.
      </p>
    </div>
  );
}
