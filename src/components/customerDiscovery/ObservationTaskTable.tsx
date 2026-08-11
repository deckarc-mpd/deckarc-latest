import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { ObservationTask } from './types';
import { CONFUSION_RANK } from './types';
import { Select, TextInput, TextArea } from './ui';

export interface ObservationRow {
  id: string; // temp id for local state
  task_name: string;
  completed: 'Yes' | 'No' | 'Partially';
  needed_help: 'Yes' | 'No';
  time_taken: string;
  confusion_level: 'None' | 'Low' | 'Medium' | 'High';
  observer_notes: string;
}

export function observationsToRows(tasks: ObservationTask[]): ObservationRow[] {
  return [...tasks]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(t => ({
      id: t.id,
      task_name: t.task_name,
      completed: t.completed,
      needed_help: t.needed_help,
      time_taken: t.time_taken,
      confusion_level: t.confusion_level,
      observer_notes: t.observer_notes,
    }));
}

export function rowsToObservations(rows: ObservationRow[]): ObservationRow[] {
  return rows.map((r, i) => ({ ...r, sort_order: i }));
}

export function computeMetrics(rows: ObservationRow[]) {
  const total = rows.length;
  const completed = rows.filter(r => r.completed === 'Yes').length;
  const partial = rows.filter(r => r.completed === 'Partially').length;
  const completionRate = total > 0
    ? Math.round(((completed + partial * 0.5) / total) * 100)
    : 0;
  const needingHelp = rows.filter(r => r.needed_help === 'Yes').length;
  const confusionVals = rows
    .map(r => CONFUSION_RANK[r.confusion_level] ?? 0)
    .filter(v => v > 0);
  const avgConfusion = confusionVals.length > 0
    ? (confusionVals.reduce((a, b) => a + b, 0) / confusionVals.length).toFixed(1)
    : '0';
  const avgConfusionLabel =
    Number(avgConfusion) >= 2.5 ? 'High' :
    Number(avgConfusion) >= 1.5 ? 'Medium' :
    Number(avgConfusion) > 0 ? 'Low' : 'None';

  return { total, completed, partial, completionRate, needingHelp, avgConfusion, avgConfusionLabel };
}

const COMPLETED_OPTIONS = ['Yes', 'No', 'Partially'] as const;
const NEEDED_HELP_OPTIONS = ['Yes', 'No'] as const;
const CONFUSION_OPTIONS = ['None', 'Low', 'Medium', 'High'] as const;

export function ObservationTaskTable({
  rows,
  onChange,
}: {
  rows: ObservationRow[];
  onChange: (rows: ObservationRow[]) => void;
}) {
  const metrics = computeMetrics(rows);

  function update(id: string, patch: Partial<ObservationRow>) {
    onChange(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex(r => r.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(idx, 1);
    next.splice(newIdx, 0, item);
    onChange(next);
  }
  function add() {
    const newRow: ObservationRow = {
      id: `temp-${Date.now()}`,
      task_name: '',
      completed: 'No',
      needed_help: 'No',
      time_taken: '',
      confusion_level: 'None',
      observer_notes: '',
    };
    onChange([...rows, newRow]);
  }

  return (
    <div>
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <div className="text-xl font-bold text-slate-900">{metrics.completionRate}%</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Task Completion Rate</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <div className="text-xl font-bold text-slate-900">{metrics.needingHelp}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Tasks Needing Help</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <div className="text-xl font-bold text-slate-900">{metrics.avgConfusionLabel}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Avg Confusion ({metrics.avgConfusion})</div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto border border-slate-200 rounded-lg">
        <table className="text-sm" style={{ minWidth: '900px', width: '100%' }}>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-8"></th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Task</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Completed</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Needed Help</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Time Taken</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Confusion</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Observer Notes</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, i) => (
              <tr key={row.id} className="hover:bg-slate-50/40">
                <td className="px-2 py-2 align-top">
                  <div className="flex flex-col items-center gap-0.5">
                    <GripVertical className="w-3.5 h-3.5 text-slate-300" />
                    <button onClick={() => move(row.id, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => move(row.id, 1)} disabled={i === rows.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <TextInput
                    value={row.task_name}
                    onChange={e => update(row.id, { task_name: e.target.value })}
                    placeholder="Task name"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Select value={row.completed} onChange={v => update(row.id, { completed: v as ObservationRow['completed'] })} options={COMPLETED_OPTIONS} placeholder="" />
                </td>
                <td className="px-3 py-2 align-top">
                  <Select value={row.needed_help} onChange={v => update(row.id, { needed_help: v as ObservationRow['needed_help'] })} options={NEEDED_HELP_OPTIONS} placeholder="" />
                </td>
                <td className="px-3 py-2 align-top">
                  <TextInput
                    value={row.time_taken}
                    onChange={e => update(row.id, { time_taken: e.target.value })}
                    placeholder="e.g. 45s"
                    className="w-20"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Select value={row.confusion_level} onChange={v => update(row.id, { confusion_level: v as ObservationRow['confusion_level'] })} options={CONFUSION_OPTIONS} placeholder="" />
                </td>
                <td className="px-3 py-2 align-top min-w-[180px]">
                  <TextArea
                    value={row.observer_notes}
                    onChange={e => update(row.id, { observer_notes: e.target.value })}
                    placeholder="Notes"
                    className="min-h-[36px]"
                  />
                </td>
                <td className="px-2 py-2 align-top">
                  <button onClick={() => remove(row.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {rows.map((row, i) => (
          <div key={row.id} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => move(row.id, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(row.id, 1)} disabled={i === rows.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <TextInput
                value={row.task_name}
                onChange={e => update(row.id, { task_name: e.target.value })}
                placeholder="Task name"
                className="flex-1"
              />
              <button onClick={() => remove(row.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Completed</label>
                <Select value={row.completed} onChange={v => update(row.id, { completed: v as ObservationRow['completed'] })} options={COMPLETED_OPTIONS} placeholder="" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Needed Help</label>
                <Select value={row.needed_help} onChange={v => update(row.id, { needed_help: v as ObservationRow['needed_help'] })} options={NEEDED_HELP_OPTIONS} placeholder="" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Time Taken</label>
                <TextInput value={row.time_taken} onChange={e => update(row.id, { time_taken: e.target.value })} placeholder="e.g. 45s" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Confusion</label>
                <Select value={row.confusion_level} onChange={v => update(row.id, { confusion_level: v as ObservationRow['confusion_level'] })} options={CONFUSION_OPTIONS} placeholder="" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-slate-500">Observer Notes</label>
                <TextArea value={row.observer_notes} onChange={e => update(row.id, { observer_notes: e.target.value })} placeholder="Notes" className="min-h-[48px]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Task
      </button>
    </div>
  );
}
