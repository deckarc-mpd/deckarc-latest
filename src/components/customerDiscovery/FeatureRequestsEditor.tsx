import { Plus, Trash2, Info } from 'lucide-react';
import type { FeatureRequest } from './types';
import { PRODUCT_AREAS, IMPORTANCE_OPTIONS, FREQUENCY_OPTIONS } from './types';
import { Field, Select, TextArea, TextInput } from './ui';

export interface FeatureRequestRow {
  id: string;
  request_text: string;
  underlying_problem: string;
  product_area: string;
  importance: string;
  frequency: string;
  admin_notes: string;
}

export function featureRequestsToRows(reqs: FeatureRequest[]): FeatureRequestRow[] {
  return [...reqs]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => ({
      id: r.id,
      request_text: r.request_text,
      underlying_problem: r.underlying_problem,
      product_area: r.product_area,
      importance: r.importance,
      frequency: r.frequency,
      admin_notes: r.admin_notes,
    }));
}

export function FeatureRequestsEditor({
  rows,
  onChange,
}: {
  rows: FeatureRequestRow[];
  onChange: (rows: FeatureRequestRow[]) => void;
}) {
  function update(id: string, patch: Partial<FeatureRequestRow>) {
    onChange(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }
  function add() {
    const newRow: FeatureRequestRow = {
      id: `temp-${Date.now()}`,
      request_text: '',
      underlying_problem: '',
      product_area: '',
      importance: '',
      frequency: '',
      admin_notes: '',
    };
    onChange([...rows, newRow]);
  }

  return (
    <div>
      <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-snug">
          Customer requests are evidence, not automatic commitments.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={row.id} className="border border-slate-200 rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Request {i + 1}
              </span>
              <button onClick={() => remove(row.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Field label="Request">
                  <TextInput value={row.request_text} onChange={e => update(row.id, { request_text: e.target.value })} placeholder="What the customer asked for" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Underlying Problem">
                  <TextArea value={row.underlying_problem} onChange={e => update(row.id, { underlying_problem: e.target.value })} placeholder="The problem behind the request" className="min-h-[48px]" />
                </Field>
              </div>
              <Field label="Product Area">
                <Select value={row.product_area} onChange={v => update(row.id, { product_area: v })} options={PRODUCT_AREAS} placeholder="Select area" />
              </Field>
              <Field label="Importance">
                <Select value={row.importance} onChange={v => update(row.id, { importance: v })} options={IMPORTANCE_OPTIONS} placeholder="Select importance" />
              </Field>
              <Field label="Frequency">
                <Select value={row.frequency} onChange={v => update(row.id, { frequency: v })} options={FREQUENCY_OPTIONS} placeholder="Select frequency" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Admin Notes">
                  <TextArea value={row.admin_notes} onChange={e => update(row.id, { admin_notes: e.target.value })} placeholder="Internal notes" className="min-h-[48px]" />
                </Field>
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
        Add Feature Request
      </button>
    </div>
  );
}
