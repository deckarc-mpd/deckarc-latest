import { useEffect, useState } from 'react';
import { supabase, RFI, Task } from '../../lib/supabase';
import Modal from '../Modal';
import { Plus, Edit2, HelpCircle } from 'lucide-react';

const STATUSES = ['Open','Waiting for Answer','Answered','Closed','Overdue'];

const statusColors: Record<string, string> = {
  Open: 'text-amber-700 bg-amber-100',
  'Waiting for Answer': 'text-amber-700 bg-amber-100',
  Answered: 'text-site-700 bg-site-100',
  Closed: 'text-concrete-600 bg-concrete-100',
  Overdue: 'text-hazard-700 bg-hazard-100',
};

const blank = (): Partial<RFI> => ({
  question_title: '', question_description: '', asked_by: '', assigned_to: '',
  due_date: undefined, answer: '', status: 'Open', delay_expected: false,
  estimated_delay_days: 0, notes: '', related_task_id: null,
});

export default function RFIsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<RFI[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RFI | null>(null);
  const [form, setForm] = useState<Partial<RFI>>(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [r, t] = await Promise.all([
      supabase.from('rfis').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id,task_name').eq('project_id', projectId).order('task_name'),
    ]);
    setItems(r.data || []);
    setTasks(t.data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm(blank()); setShowModal(true); }
  function openEdit(r: RFI) { setEditing(r); setForm({ ...r }); setShowModal(true); }

  async function save() {
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = form.due_date && form.due_date < today && form.status === 'Open';
    const payload = {
      ...form,
      project_id: projectId,
      status: isOverdue ? 'Overdue' : form.status,
      alert_status: (form.status === 'Overdue' || isOverdue) ? 'red' : form.status === 'Open' ? 'yellow' : 'green',
    };
    if (editing) {
      await supabase.from('rfis').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('rfis').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const f = (k: keyof RFI, v: any) => setForm(p => ({ ...p, [k]: v }));
  const openCount = items.filter(i => ['Open','Waiting for Answer','Overdue'].includes(i.status)).length;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading RFIs...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-concrete-700">{items.length} questions / RFIs</h3>
          {openCount > 0 && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">{openCount} open</span>}
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Add RFI</button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">No questions or RFIs yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start gap-3">
                <HelpCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${r.status === 'Overdue' ? 'text-hazard-500' : r.status === 'Answered' || r.status === 'Closed' ? 'text-site-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-concrete-900">{r.question_title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status] || 'text-concrete-600 bg-concrete-100'}`}>{r.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1 text-xs text-concrete-500">
                    {r.asked_by && <span>Asked by: {r.asked_by}</span>}
                    {r.assigned_to && <span>Assigned to: <strong className="text-concrete-700">{r.assigned_to}</strong></span>}
                    {r.due_date && <span>Due: <strong className={r.due_date < new Date().toISOString().split('T')[0] ? 'text-hazard-600' : 'text-concrete-700'}>{new Date(r.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong></span>}
                    {r.delay_expected && <span className="text-hazard-600">Delay: {r.estimated_delay_days}d</span>}
                  </div>
                  {r.question_description && <p className="text-xs text-concrete-600 mt-1">{r.question_description}</p>}
                  {r.answer && (
                    <div className="mt-2 bg-site-50 border border-site-100 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-site-700 mb-0.5">Answer:</p>
                      <p className="text-xs text-site-600">{r.answer}</p>
                    </div>
                  )}
                </div>
                <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit RFI' : 'New RFI / Question'} onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="label-sm">Question Title *</label>
              <input className="input-field" value={form.question_title || ''} onChange={e => f('question_title', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Asked By</label>
                <input className="input-field" value={form.asked_by || ''} onChange={e => f('asked_by', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Assigned To</label>
                <input className="input-field" value={form.assigned_to || ''} onChange={e => f('assigned_to', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Due Date</label>
                <input type="date" className="input-field" value={(form.due_date as string) || ''} onChange={e => f('due_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Status</label>
                <select className="input-field" value={form.status || 'Open'} onChange={e => f('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Related Task</label>
                <select className="input-field" value={form.related_task_id || ''} onChange={e => f('related_task_id', e.target.value || null)}>
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="rfi_delay" checked={!!form.delay_expected} onChange={e => f('delay_expected', e.target.checked)} className="w-4 h-4 rounded" />
                <label htmlFor="rfi_delay" className="text-xs text-concrete-700">Delay Expected</label>
                {form.delay_expected && (
                  <input type="number" className="input-field w-20 ml-2" placeholder="Days" value={form.estimated_delay_days || 0} onChange={e => f('estimated_delay_days', +e.target.value)} />
                )}
              </div>
            </div>
            <div>
              <label className="label-sm">Description</label>
              <textarea className="input-field" rows={2} value={form.question_description || ''} onChange={e => f('question_description', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Answer</label>
              <textarea className="input-field" rows={2} value={form.answer || ''} onChange={e => f('answer', e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.question_title} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Submit RFI'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
