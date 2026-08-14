import { useEffect, useState } from 'react';
import { supabase, Material, Task } from '../../lib/supabase';
import Modal from '../Modal';
import { Plus, Edit2, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { getStatusBadge } from '../../lib/alertUtils';

const CATEGORIES = ['Lumber','Plywood/Subfloor','Concrete','Rebar','Roofing','Windows','Doors','Electrical','Plumbing','HVAC','Insulation','Drywall','Flooring','Tile','Fixtures','Cabinets','Paint','Hardware','Other'];
const ORDER_STATUSES = ['Not Needed','Not Ordered','Quote Requested','Ordered','Partially Delivered','Delivered','Delayed','Backordered','Damaged','Wrong Material','Cancelled'];
const READY_STATUSES = ['Ready','Not Ready','Partially Ready','Pending Delivery','Delayed','Needs Confirmation','Issue Found'];

const readyColors: Record<string, string> = {
  'Ready': 'text-site-700 bg-site-100',
  'Not Ready': 'text-hazard-700 bg-hazard-100',
  'Partially Ready': 'text-amber-700 bg-amber-100',
  'Pending Delivery': 'text-steel-700 bg-steel-100',
  'Delayed': 'text-hazard-700 bg-hazard-100',
  'Needs Confirmation': 'text-amber-700 bg-amber-100',
  'Issue Found': 'text-hazard-700 bg-hazard-100',
};

const blank = (): Partial<Material> => ({
  material_name: '', material_category: 'Lumber', quantity_required: 0, quantity_ordered: 0,
  quantity_delivered: 0, unit: '', supplier_name: '', supplier_contact: '',
  order_status: 'Not Ordered', material_ready_status: 'Not Ready', lead_time_days: 0,
  responsible_party: '', notes: '', related_task_id: null,
  expected_delivery_date: undefined, ordered_date: undefined,
});

export default function MaterialsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Material[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<Partial<Material>>(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [m, t] = await Promise.all([
      supabase.from('materials').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id,task_name').eq('project_id', projectId).order('task_name'),
    ]);
    setItems(m.data || []);
    setTasks(t.data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm(blank()); setShowModal(true); }
  function openEdit(m: Material) { setEditing(m); setForm({ ...m }); setShowModal(true); }

  async function save() {
    setSaving(true);
    const payload = { ...form, project_id: projectId };
    if (editing) {
      await supabase.from('materials').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('materials').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const f = (k: keyof Material, v: any) => setForm(p => ({ ...p, [k]: v }));

  const notReadyCount = items.filter(i => i.material_ready_status !== 'Ready').length;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading materials...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-concrete-700">{items.length} materials tracked</h3>
          {notReadyCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              <AlertTriangle className="w-3 h-3" /> {notReadyCount} not ready
            </span>
          )}
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Material
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">No materials tracked yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <div key={m.id} className="card p-4 hover:shadow-card-hover transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-concrete-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-concrete-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-concrete-900">{m.material_name}</span>
                    <span className="text-xs text-concrete-400 bg-concrete-100 px-2 py-0.5 rounded">{m.material_category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${readyColors[m.material_ready_status] || 'text-concrete-600 bg-concrete-100'}`}>
                      {m.material_ready_status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadge(m.order_status)}`}>
                      {m.order_status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-concrete-500">
                    {m.supplier_name && <span>Supplier: <strong className="text-concrete-700">{m.supplier_name}</strong></span>}
                    {m.expected_delivery_date && <span>Expected: <strong className="text-concrete-700">{new Date(m.expected_delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong></span>}
                    {m.quantity_required > 0 && <span>Qty: {m.quantity_delivered}/{m.quantity_required} {m.unit} delivered</span>}
                    {m.responsible_party && <span>Resp: {m.responsible_party}</span>}
                  </div>
                  {m.notes && <p className="text-xs text-concrete-400 mt-1 italic">{m.notes}</p>}
                </div>
                <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Material' : 'Add Material'} onClose={() => setShowModal(false)}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label-sm">Material Name *</label>
                <input className="input-field" value={form.material_name || ''} onChange={e => f('material_name', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Category</label>
                <select className="input-field" value={form.material_category || 'Other'} onChange={e => f('material_category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Related Task</label>
                <select className="input-field" value={form.related_task_id || ''} onChange={e => f('related_task_id', e.target.value || null)}>
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Qty Required</label>
                <input type="number" className="input-field" value={form.quantity_required || 0} onChange={e => f('quantity_required', +e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Unit</label>
                <input className="input-field" placeholder="ea, lbs, sq ft..." value={form.unit || ''} onChange={e => f('unit', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Qty Ordered</label>
                <input type="number" className="input-field" value={form.quantity_ordered || 0} onChange={e => f('quantity_ordered', +e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Qty Delivered</label>
                <input type="number" className="input-field" value={form.quantity_delivered || 0} onChange={e => f('quantity_delivered', +e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Supplier Name</label>
                <input className="input-field" value={form.supplier_name || ''} onChange={e => f('supplier_name', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Supplier Contact</label>
                <input className="input-field" value={form.supplier_contact || ''} onChange={e => f('supplier_contact', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Order Status</label>
                <select className="input-field" value={form.order_status || 'Not Ordered'} onChange={e => f('order_status', e.target.value)}>
                  {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Ready Status</label>
                <select className="input-field" value={form.material_ready_status || 'Not Ready'} onChange={e => f('material_ready_status', e.target.value)}>
                  {READY_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Expected Delivery</label>
                <input type="date" className="input-field" value={(form.expected_delivery_date as string) || ''} onChange={e => f('expected_delivery_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Lead Time (days)</label>
                <input type="number" className="input-field" value={form.lead_time_days || 0} onChange={e => f('lead_time_days', +e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Responsible Party</label>
                <input className="input-field" value={form.responsible_party || ''} onChange={e => f('responsible_party', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Actual Delivery Date</label>
                <input type="date" className="input-field" value={(form.actual_delivery_date as string) || ''} onChange={e => f('actual_delivery_date', e.target.value || null)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Notes</label>
                <textarea className="input-field" rows={2} value={form.notes || ''} onChange={e => f('notes', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.material_name} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add Material'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
