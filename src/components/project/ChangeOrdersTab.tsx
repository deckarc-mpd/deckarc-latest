import { useEffect, useState } from 'react';
import { supabase, Project, ChangeOrder } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';
import { Plus, Edit2, GitBranch, AlertTriangle } from 'lucide-react';
import { cascadeDelayFromTask } from '../../lib/scheduleEngine';
import { logActivity } from './ActivityLogTab';

const CO_STATUSES = ['Draft', 'Sent', 'Approved', 'Rejected', 'On Hold'];

export default function ChangeOrdersTab({ project, onProjectUpdate }: { project: Project; onProjectUpdate: () => void }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ChangeOrder[]>([]);
  const [tasks, setTasks] = useState<{ id: string; task_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ChangeOrder | null>(null);
  const [form, setForm] = useState<Partial<ChangeOrder>>({
    change_order_number: '', title: '', requested_by: '', description: '',
    cost_impact: 0, time_impact_days: 0, approval_status: 'Draft',
    affected_task_id: null, schedule_update_required: false,
    approved_date: null, internal_notes: '', client_visible_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [cascading, setCascading] = useState(false);

  const canEdit = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'].includes(profile?.role || '');
  const isAdmin = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN'].includes(profile?.role || '');

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const [{ data: cos }, { data: tsk }] = await Promise.all([
      supabase.from('change_orders').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('tasks').select('id,task_name').eq('project_id', project.id),
    ]);
    setItems(cos || []);
    setTasks(tsk || []);
    setLoading(false);
  }

  function openEdit(item: ChangeOrder) { setEditItem(item); setForm({ ...item }); setShowModal(true); }

  function openAdd() {
    setEditItem(null);
    setForm({
      change_order_number: '', title: '', requested_by: '', description: '',
      cost_impact: 0, time_impact_days: 0, approval_status: 'Draft',
      affected_task_id: null, schedule_update_required: false,
      approved_date: null, internal_notes: '', client_visible_notes: '',
    });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const payload = { ...form, project_id: project.id, approved_date: (form.approved_date as string) || null };
    const isNewlyApproved = form.approval_status === 'Approved' && editItem?.approval_status !== 'Approved';

    if (editItem) {
      await supabase.from('change_orders').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('change_orders').insert(payload);
    }

    // Cascade schedule when approved with time impact
    if (isNewlyApproved && (form.time_impact_days || 0) > 0) {
      if (form.affected_task_id) {
        setCascading(true);
        await cascadeDelayFromTask(
          project.id,
          form.affected_task_id,
          form.time_impact_days || 0,
          'Change Order Impact',
          `Change Order: ${form.title}`,
          form.requested_by || 'Change Order',
          profile?.full_name || 'Admin',
          profile?.role || 'DECKARC_ADMIN'
        );
        setCascading(false);
        onProjectUpdate();
      } else {
        // No specific task — push project finish date directly
        const base = new Date(project.projected_finish_date || project.expected_finish_date || new Date().toISOString());
        base.setDate(base.getDate() + (form.time_impact_days || 0));
        await supabase.from('projects').update({
          projected_finish_date: base.toISOString().split('T')[0],
        }).eq('id', project.id);
        onProjectUpdate();
      }
    }

    if (isNewlyApproved) {
      await logActivity({
        projectId: project.id,
        userId: profile?.id || null,
        userFullName: profile?.full_name || 'Admin',
        userRole: profile?.role || '',
        actionType: 'Change Order Approved',
        module: 'Change Order',
        relatedRecordId: editItem?.id || null,
        relatedRecordType: 'change_order',
        oldValue: editItem?.approval_status || 'Draft',
        newValue: 'Approved',
        notes: `CO: ${form.title}${(form.time_impact_days || 0) > 0 ? ` — +${form.time_impact_days}d schedule impact` : ''}`,
      });
    }

    setSaving(false);
    setShowModal(false);
    load();
  }

  const f = (k: keyof ChangeOrder, v: any) => setForm(p => ({ ...p, [k]: v }));
  const fc = (k: keyof ChangeOrder) => (e: React.ChangeEvent<HTMLInputElement>) => f(k, e.target.checked);

  const getStatusBadge = (status: string) => {
    if (status === 'Approved') return 'bg-site-100 text-site-700';
    if (status === 'Rejected') return 'bg-hazard-100 text-hazard-700';
    if (status === 'Sent') return 'bg-steel-100 text-steel-700';
    if (status === 'On Hold') return 'bg-amber-100 text-amber-700';
    return 'bg-concrete-100 text-concrete-600';
  };

  const totalCostImpact = items.filter(i => i.approval_status === 'Approved').reduce((s, i) => s + i.cost_impact, 0);
  const totalTimeImpact = items.filter(i => i.approval_status === 'Approved').reduce((s, i) => s + i.time_impact_days, 0);
  const pendingCount = items.filter(i => ['Draft', 'Sent'].includes(i.approval_status)).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-concrete-800">Change Orders <span className="text-sm font-normal text-concrete-400">({items.length})</span></h2>
        {canEdit && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Change Order
          </button>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4" />
          <span>{pendingCount} change order{pendingCount > 1 ? 's' : ''} pending approval.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="card p-4">
            <p className="text-xs text-concrete-500">Approved Cost Impact</p>
            <p className="text-xl font-bold text-concrete-900">+${totalCostImpact.toLocaleString()}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-concrete-500">Approved Schedule Impact</p>
            <p className="text-xl font-bold text-amber-600">+{totalTimeImpact} days</p>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-concrete-400 text-sm">Loading...</div> :
        items.length === 0 ? <div className="text-center py-12 text-concrete-400 text-sm">No change orders yet.</div> :
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.change_order_number && <span className="text-xs text-concrete-400 font-mono">#{item.change_order_number}</span>}
                    <span className="text-sm text-concrete-900">{item.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(item.approval_status)}`}>{item.approval_status}</span>
                    {item.schedule_update_required && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-steel-100 text-steel-700 font-medium flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />Schedule Update
                      </span>
                    )}
                  </div>
                  {item.requested_by && <p className="text-xs text-concrete-500 mt-0.5">Requested by: {item.requested_by}</p>}
                  {item.description && <p className="text-xs text-concrete-500 mt-1">{item.description}</p>}
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-concrete-500">
                    {item.cost_impact > 0 && <span className="font-medium text-concrete-700">Cost: +${item.cost_impact.toLocaleString()}</span>}
                    {item.time_impact_days > 0 && <span className="text-amber-600 font-medium">Time: +{item.time_impact_days} days</span>}
                    {item.approved_date && <span>Approved: {new Date(item.approved_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                  </div>
                  {isAdmin && item.internal_notes && <p className="text-xs text-concrete-400 mt-1 italic">{item.internal_notes}</p>}
                </div>
                {canEdit && (
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0 ml-2">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      }

      {showModal && (
        <Modal title={editItem ? 'Edit Change Order' : 'Add Change Order'} onClose={() => setShowModal(false)} size="lg">
          <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">CO Number</label>
                <input className="input-field" placeholder="CO-001" value={form.change_order_number || ''} onChange={e => f('change_order_number', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Approval Status</label>
                <select className="input-field" value={form.approval_status || 'Draft'} onChange={e => f('approval_status', e.target.value)}>
                  {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label-sm">Title *</label>
                <input className="input-field" value={form.title || ''} onChange={e => f('title', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Requested By</label>
                <input className="input-field" value={form.requested_by || ''} onChange={e => f('requested_by', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Description</label>
                <textarea rows={2} className="input-field" value={form.description || ''} onChange={e => f('description', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Cost Impact ($)</label>
                <input type="number" min="0" className="input-field" value={form.cost_impact || 0} onChange={e => f('cost_impact', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label-sm">Time Impact (days)</label>
                <input type="number" min="0" className="input-field" value={form.time_impact_days || 0} onChange={e => f('time_impact_days', parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label-sm">Affected Task</label>
                <select className="input-field" value={form.affected_task_id || ''} onChange={e => f('affected_task_id', e.target.value || null)}>
                  <option value="">None (project-level)</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Approved Date</label>
                <input type="date" className="input-field" value={(form.approved_date as string) || ''} onChange={e => f('approved_date', e.target.value || null)} />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-xs text-concrete-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.schedule_update_required} onChange={fc('schedule_update_required')} className="w-3.5 h-3.5 rounded" /> Schedule update required
                </label>
              </div>
              {isAdmin && (
                <div className="col-span-2">
                  <label className="label-sm">Internal Notes</label>
                  <textarea rows={2} className="input-field" value={form.internal_notes || ''} onChange={e => f('internal_notes', e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <label className="label-sm">Client-Visible Notes</label>
                <textarea rows={2} className="input-field" value={form.client_visible_notes || ''} onChange={e => f('client_visible_notes', e.target.value)} />
              </div>
            </div>
            {form.approval_status === 'Approved' && (form.time_impact_days || 0) > 0 && editItem?.approval_status !== 'Approved' && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Approving will cascade a {form.time_impact_days}-day delay to {form.affected_task_id ? 'the selected task and its dependents' : 'the project finish date'}.</span>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || cascading || !form.title} className="btn-primary disabled:opacity-50">
                {cascading ? 'Updating schedule...' : saving ? 'Saving...' : editItem ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
