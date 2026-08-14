import { useEffect, useState } from 'react';
import { supabase, Project, ClientDecision } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertDot } from '../StatusBadge';
import Modal from '../Modal';
import { Plus, Edit2 } from 'lucide-react';
import { calculateDecisionAlert } from '../../lib/alertUtils';

const DECISION_STATUSES = ['Needed', 'Waiting on Client', 'Received', 'Overdue'];

export default function ClientDecisionsTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ClientDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ClientDecision | null>(null);
  const [form, setForm] = useState({
    decision_title: '', description: '', needed_by_date: '',
    status: 'Needed', time_impact_days: 0, cost_impact: 0, client_visible_note: '',
  });
  const [saving, setSaving] = useState(false);

  const canEdit = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'].includes(profile?.role || '');

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('client_decisions').select('*').eq('project_id', project.id).order('created_at');
    setItems(data || []);
    setLoading(false);
  }

  function openEdit(item: ClientDecision) {
    setEditItem(item);
    setForm({
      decision_title: item.decision_title, description: item.description,
      needed_by_date: item.needed_by_date || '', status: item.status,
      time_impact_days: item.time_impact_days, cost_impact: item.cost_impact,
      client_visible_note: item.client_visible_note,
    });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const alertStatus = calculateDecisionAlert({ needed_by_date: form.needed_by_date || null, status: form.status });
    const payload = {
      project_id: project.id, ...form,
      needed_by_date: form.needed_by_date || null,
      alert_status: alertStatus,
    };
    if (editItem) {
      await supabase.from('client_decisions').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('client_decisions').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const getStatusBadge = (status: string) => {
    if (status === 'Received') return 'bg-site-100 text-site-700';
    if (status === 'Overdue') return 'bg-hazard-100 text-hazard-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-concrete-800">
          Client Decisions <span className="text-sm font-normal text-concrete-400">({items.length})</span>
        </h2>
        {canEdit && (
          <button onClick={() => { setEditItem(null); setForm({ decision_title: '', description: '', needed_by_date: '', status: 'Needed', time_impact_days: 0, cost_impact: 0, client_visible_note: '' }); setShowModal(true); }}
            className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Decision
          </button>
        )}
      </div>

      {loading ? <div className="text-center py-12 text-concrete-400 text-sm">Loading...</div> :
        items.length === 0 ? <div className="text-center py-12 text-concrete-400 text-sm">No decisions yet.</div> :
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertDot status={item.alert_status || 'yellow'} />
                    <span className="text-sm text-concrete-900">{item.decision_title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(item.status)}`}>{item.status}</span>
                  </div>
                  {item.description && <p className="text-xs text-concrete-500 mt-1 ml-5">{item.description}</p>}
                  <div className="flex flex-wrap gap-4 mt-2 ml-5 text-xs text-concrete-500">
                    {item.needed_by_date && <span>Needed by: {new Date(item.needed_by_date + 'T00:00:00').toLocaleDateString()}</span>}
                    {item.time_impact_days > 0 && <span className="text-amber-600">Time impact: {item.time_impact_days} days</span>}
                    {item.cost_impact > 0 && <span>Cost impact: ${item.cost_impact.toLocaleString()}</span>}
                  </div>
                  {item.client_visible_note && <p className="text-xs text-steel-600 mt-2 ml-5">{item.client_visible_note}</p>}
                </div>
                {canEdit && (
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      }

      {showModal && (
        <Modal title={editItem ? 'Edit Decision' : 'Add Client Decision'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-concrete-600 mb-1">Decision Title *</label>
              <input value={form.decision_title} onChange={e => setForm(f => ({ ...f, decision_title: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-concrete-600 mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="input-field resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-concrete-600 mb-1">Needed By Date</label>
              <input type="date" value={form.needed_by_date} onChange={e => setForm(f => ({ ...f, needed_by_date: e.target.value }))}
                className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-concrete-600 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="input-field">
                {DECISION_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Time Impact (days)</label>
                <input type="number" min="0" value={form.time_impact_days}
                  onChange={e => setForm(f => ({ ...f, time_impact_days: parseInt(e.target.value) || 0 }))}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-concrete-600 mb-1">Cost Impact ($)</label>
                <input type="number" min="0" value={form.cost_impact}
                  onChange={e => setForm(f => ({ ...f, cost_impact: parseFloat(e.target.value) || 0 }))}
                  className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-concrete-600 mb-1">Client Note</label>
              <textarea rows={2} value={form.client_visible_note} onChange={e => setForm(f => ({ ...f, client_visible_note: e.target.value }))}
                className="input-field resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.decision_title} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editItem ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
