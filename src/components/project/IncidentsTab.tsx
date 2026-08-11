import { useEffect, useState } from 'react';
import { supabase, Incident, Task } from '../../lib/supabase';
import Modal from '../Modal';
import { Plus, Edit2, AlertOctagon } from 'lucide-react';

const INCIDENT_TYPES = ['Broken Material','Damaged Material','Wrong Material Delivered','Missing Material','Material Theft','Jobsite Accident','Safety Issue','Water Damage','Weather Damage','Equipment Failure','Subcontractor No-Show','Supplier Delay','Inspection Correction','Client Change Impact','Design/Plan Issue','Permit Issue','Other'];
const SEVERITIES = ['Low','Medium','High','Critical'];
const STATUSES = ['Reported','Under Review','Action Needed','Waiting for Replacement','Waiting for Repair','Waiting for Supplier','Waiting for Subcontractor','Waiting for Client Decision','Resolved','Closed'];

const severityColors: Record<string, string> = {
  Low: 'text-site-700 bg-site-100',
  Medium: 'text-amber-700 bg-amber-100',
  High: 'text-hazard-700 bg-hazard-100',
  Critical: 'text-white bg-hazard-600',
};

const statusColors: Record<string, string> = {
  Reported: 'text-hazard-700 bg-hazard-100',
  'Under Review': 'text-amber-700 bg-amber-100',
  'Action Needed': 'text-hazard-700 bg-hazard-100',
  Resolved: 'text-site-700 bg-site-100',
  Closed: 'text-concrete-600 bg-concrete-100',
};

const blank = (): Partial<Incident> => ({
  incident_title: '', incident_type: 'Other', incident_date: new Date().toISOString().split('T')[0],
  reported_by: '', responsible_party: '', affected_party: '', incident_description: '',
  location_on_site: '', severity_level: 'Medium', delay_expected: false, estimated_delay_days: 0,
  actual_delay_days: 0, cost_impact_expected: false, estimated_cost_impact: 0,
  replacement_required: false, reorder_required: false, repair_required: false,
  insurance_claim_needed: false, client_notification_needed: false, admin_approval_required: true,
  incident_status: 'Reported', resolution_plan: '', notes: '', related_task_id: null,
});

export default function IncidentsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Incident[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [form, setForm] = useState<Partial<Incident>>(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [inc, t] = await Promise.all([
      supabase.from('incidents').select('*').eq('project_id', projectId).order('incident_date', { ascending: false }),
      supabase.from('tasks').select('id,task_name').eq('project_id', projectId).order('task_name'),
    ]);
    setItems(inc.data || []);
    setTasks(t.data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm(blank()); setShowModal(true); }
  function openEdit(i: Incident) { setEditing(i); setForm({ ...i }); setShowModal(true); }

  async function save() {
    setSaving(true);
    const payload = { ...form, project_id: projectId, alert_status: ['High','Critical'].includes(form.severity_level || '') ? 'red' : 'yellow' };
    if (editing) {
      await supabase.from('incidents').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('incidents').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const f = (k: keyof Incident, v: any) => setForm(p => ({ ...p, [k]: v }));
  const fc = (k: keyof Incident) => (e: React.ChangeEvent<HTMLInputElement>) => f(k, e.target.checked);
  const openCount = items.filter(i => !['Resolved','Closed'].includes(i.incident_status)).length;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading incidents...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-concrete-700">{items.length} total incidents</h3>
          {openCount > 0 && (
            <span className="text-xs text-hazard-700 bg-hazard-50 border border-hazard-200 px-2 py-1 rounded-lg flex items-center gap-1">
              <AlertOctagon className="w-3 h-3" /> {openCount} open
            </span>
          )}
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Report Incident
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">No incidents reported.</div>
      ) : (
        <div className="space-y-2">
          {items.map(inc => (
            <div key={inc.id} className={`card p-4 border-l-4 ${inc.severity_level === 'Critical' || inc.severity_level === 'High' ? 'border-l-hazard-500' : inc.severity_level === 'Medium' ? 'border-l-amber-400' : 'border-l-site-400'}`}>
              <div className="flex items-start gap-3">
                <AlertOctagon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${inc.severity_level === 'Critical' || inc.severity_level === 'High' ? 'text-hazard-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-concrete-900">{inc.incident_title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColors[inc.severity_level] || ''}`}>{inc.severity_level}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[inc.incident_status] || 'text-concrete-600 bg-concrete-100'}`}>{inc.incident_status}</span>
                    <span className="text-xs text-concrete-400 bg-concrete-100 px-2 py-0.5 rounded">{inc.incident_type}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-concrete-500">
                    <span>Date: <strong className="text-concrete-700">{new Date(inc.incident_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></span>
                    {inc.reported_by && <span>Reported by: {inc.reported_by}</span>}
                    {inc.delay_expected && <span className="text-hazard-600">Delay: {inc.estimated_delay_days}d expected</span>}
                    {inc.cost_impact_expected && inc.estimated_cost_impact > 0 && <span className="text-hazard-600">Cost impact: ${inc.estimated_cost_impact.toLocaleString()}</span>}
                  </div>
                  {inc.incident_description && <p className="text-xs text-concrete-600 mt-1">{inc.incident_description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {inc.replacement_required && <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Replacement Required</span>}
                    {inc.repair_required && <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Repair Required</span>}
                    {inc.client_notification_needed && <span className="text-xs text-steel-700 bg-steel-50 px-2 py-0.5 rounded-full">Client Notification Needed</span>}
                  </div>
                </div>
                <button onClick={() => openEdit(inc)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Incident' : 'Report Incident'} onClose={() => setShowModal(false)}>
          <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label-sm">Incident Title *</label>
                <input className="input-field" value={form.incident_title || ''} onChange={e => f('incident_title', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Type</label>
                <select className="input-field" value={form.incident_type || 'Other'} onChange={e => f('incident_type', e.target.value)}>
                  {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Severity</label>
                <select className="input-field" value={form.severity_level || 'Medium'} onChange={e => f('severity_level', e.target.value)}>
                  {SEVERITIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Incident Date</label>
                <input type="date" className="input-field" value={(form.incident_date as string) || ''} onChange={e => f('incident_date', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Status</label>
                <select className="input-field" value={form.incident_status || 'Reported'} onChange={e => f('incident_status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Reported By</label>
                <input className="input-field" value={form.reported_by || ''} onChange={e => f('reported_by', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Responsible Party</label>
                <input className="input-field" value={form.responsible_party || ''} onChange={e => f('responsible_party', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Related Task</label>
                <select className="input-field" value={form.related_task_id || ''} onChange={e => f('related_task_id', e.target.value || null)}>
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Location on Site</label>
                <input className="input-field" value={form.location_on_site || ''} onChange={e => f('location_on_site', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Description</label>
                <textarea className="input-field" rows={2} value={form.incident_description || ''} onChange={e => f('incident_description', e.target.value)} />
              </div>
              <div className="col-span-2 grid grid-cols-3 gap-2">
                {([['delay_expected','Delay Expected'],['replacement_required','Replacement Req.'],['repair_required','Repair Req.'],['reorder_required','Reorder Req.'],['client_notification_needed','Client Notification'],['insurance_claim_needed','Insurance Claim']] as [keyof Incident, string][]).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-xs text-concrete-700 cursor-pointer">
                    <input type="checkbox" checked={!!(form as any)[k]} onChange={fc(k)} className="w-3.5 h-3.5 rounded" />
                    {l}
                  </label>
                ))}
              </div>
              {form.delay_expected && (
                <div>
                  <label className="label-sm">Est. Delay Days</label>
                  <input type="number" className="input-field" value={form.estimated_delay_days || 0} onChange={e => f('estimated_delay_days', +e.target.value)} />
                </div>
              )}
              <div>
                <label className="label-sm">Resolution Due</label>
                <input type="date" className="input-field" value={(form.resolution_due_date as string) || ''} onChange={e => f('resolution_due_date', e.target.value || null)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Resolution Plan</label>
                <textarea className="input-field" rows={2} value={form.resolution_plan || ''} onChange={e => f('resolution_plan', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm">Notes</label>
                <textarea className="input-field" rows={2} value={form.notes || ''} onChange={e => f('notes', e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !form.incident_title} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Report'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
