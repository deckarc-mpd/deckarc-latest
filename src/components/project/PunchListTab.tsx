import { useEffect, useState } from 'react';
import { supabase, PunchListItem } from '../../lib/supabase';
import Modal from '../Modal';
import { Plus, Edit2, ClipboardCheck, CheckCircle, Clock } from 'lucide-react';

const STATUSES = ['Open','Assigned','In Progress','Completed','Client Approved','Closed'];
const SIGNOFF_STATUSES = ['Not Required','Pending','Approved','Rejected'];

const statusColors: Record<string, string> = {
  Open: 'text-hazard-700 bg-hazard-100',
  Assigned: 'text-amber-700 bg-amber-100',
  'In Progress': 'text-steel-700 bg-steel-100',
  Completed: 'text-site-700 bg-site-100',
  'Client Approved': 'text-site-700 bg-site-100',
  Closed: 'text-concrete-600 bg-concrete-100',
};

const blank = (): Partial<PunchListItem> => ({
  item_type: 'Punch List', item_title: '', description: '', reported_by: '',
  responsible_party: '', status: 'Open', client_signoff_required: false,
  client_signoff_status: 'Not Required', notes: '', due_date: undefined,
});

export default function PunchListTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<PunchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PunchListItem | null>(null);
  const [form, setForm] = useState<Partial<PunchListItem>>(blank());
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'All' | 'Punch List' | 'Warranty'>('All');

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('punch_list_items').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm(blank()); setShowModal(true); }
  function openEdit(i: PunchListItem) { setEditing(i); setForm({ ...i }); setShowModal(true); }

  async function save() {
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = form.due_date && form.due_date < today && !['Completed','Client Approved','Closed'].includes(form.status || '');
    const payload = {
      ...form, project_id: projectId,
      alert_status: isOverdue ? 'red' : ['Completed','Client Approved','Closed'].includes(form.status || '') ? 'green' : 'yellow',
    };
    if (editing) {
      await supabase.from('punch_list_items').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('punch_list_items').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const f = (k: keyof PunchListItem, v: any) => setForm(p => ({ ...p, [k]: v }));
  const filtered = typeFilter === 'All' ? items : items.filter(i => i.item_type === typeFilter);
  const openCount = items.filter(i => !['Completed','Client Approved','Closed'].includes(i.status)).length;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading punch list...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-concrete-700">{items.length} items</h3>
          {openCount > 0 && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">{openCount} open</span>}
          <div className="flex gap-1">
            {(['All','Punch List','Warranty'] as const).map(f => (
              <button key={f} onClick={() => setTypeFilter(f)} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${typeFilter === f ? 'bg-steel-500 text-white' : 'text-concrete-500 hover:bg-concrete-100'}`}>{f}</button>
            ))}
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Add Item</button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-2 text-concrete-300" />
          No items yet.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="card p-4">
              <div className="flex items-start gap-3">
                {['Completed','Client Approved','Closed'].includes(item.status) ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-site-500" />
                ) : (
                  <Clock className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-concrete-900">{item.item_title}</span>
                    <span className="text-xs text-concrete-400 bg-concrete-100 px-2 py-0.5 rounded">{item.item_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[item.status] || 'text-concrete-600 bg-concrete-100'}`}>{item.status}</span>
                    {item.client_signoff_required && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.client_signoff_status === 'Approved' ? 'text-site-700 bg-site-100' : item.client_signoff_status === 'Pending' ? 'text-amber-700 bg-amber-100' : 'text-concrete-600 bg-concrete-100'}`}>
                        Client Signoff: {item.client_signoff_status}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1 text-xs text-concrete-500">
                    {item.responsible_party && <span>Resp: {item.responsible_party}</span>}
                    {item.due_date && <span>Due: <strong className={item.due_date < new Date().toISOString().split('T')[0] && !['Completed','Client Approved','Closed'].includes(item.status) ? 'text-hazard-600' : 'text-concrete-700'}>{new Date(item.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong></span>}
                    {item.reported_by && <span>Reported: {item.reported_by}</span>}
                  </div>
                  {item.description && <p className="text-xs text-concrete-600 mt-1">{item.description}</p>}
                </div>
                <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Item' : 'Add Punch List / Warranty Item'} onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Item Type</label>
                <select className="input-field" value={form.item_type || 'Punch List'} onChange={e => f('item_type', e.target.value)}>
                  <option>Punch List</option>
                  <option>Warranty</option>
                </select>
              </div>
              <div>
                <label className="label-sm">Status</label>
                <select className="input-field" value={form.status || 'Open'} onChange={e => f('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label-sm">Title *</label>
                <input className="input-field" value={form.item_title || ''} onChange={e => f('item_title', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Responsible Party</label>
                <input className="input-field" value={form.responsible_party || ''} onChange={e => f('responsible_party', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Due Date</label>
                <input type="date" className="input-field" value={(form.due_date as string) || ''} onChange={e => f('due_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Reported By</label>
                <input className="input-field" value={form.reported_by || ''} onChange={e => f('reported_by', e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="signoff_req" checked={!!form.client_signoff_required} onChange={e => f('client_signoff_required', e.target.checked)} className="w-4 h-4 rounded" />
                <label htmlFor="signoff_req" className="text-xs text-concrete-700">Client Signoff Required</label>
              </div>
              {form.client_signoff_required && (
                <div>
                  <label className="label-sm">Signoff Status</label>
                  <select className="input-field" value={form.client_signoff_status || 'Not Required'} onChange={e => f('client_signoff_status', e.target.value)}>
                    {SIGNOFF_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="label-sm">Description</label>
                <textarea className="input-field" rows={2} value={form.description || ''} onChange={e => f('description', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Notes</label>
                <textarea className="input-field" rows={2} value={form.notes || ''} onChange={e => f('notes', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.item_title} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add Item'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
