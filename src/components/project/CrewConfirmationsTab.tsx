import { useEffect, useState } from 'react';
import { supabase, CrewConfirmation, Task, UserProfile } from '../../lib/supabase';
import Modal from '../Modal';
import { Plus, Edit2, Users, CheckCircle, XCircle, Clock } from 'lucide-react';

const CONF_STATUSES = ['Pending','Confirmed','Need Reschedule','Cannot Attend','Need More Info'];

const statusColors: Record<string, string> = {
  Pending: 'text-amber-700 bg-amber-100',
  Confirmed: 'text-site-700 bg-site-100',
  'Need Reschedule': 'text-hazard-700 bg-hazard-100',
  'Cannot Attend': 'text-hazard-700 bg-hazard-100',
  'Need More Info': 'text-amber-700 bg-amber-100',
};

const blank = (): Partial<CrewConfirmation> => ({
  scheduled_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  confirmation_status: 'Pending', crew_available: true, start_time_confirmed: false,
  scope_understood: false, material_reviewed: false, site_access_confirmed: false,
  questions_before_arrival: '', confirmation_notes: '',
  task_id: null, subcontractor_user_id: null,
});

export default function CrewConfirmationsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<CrewConfirmation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CrewConfirmation | null>(null);
  const [form, setForm] = useState<Partial<CrewConfirmation>>(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    const [c, t, s] = await Promise.all([
      supabase.from('crew_confirmations').select('*').eq('project_id', projectId).order('scheduled_date'),
      supabase.from('tasks').select('id,task_name').eq('project_id', projectId).order('task_name'),
      supabase.from('user_profiles').select('*').eq('role', 'SUBCONTRACTOR'),
    ]);
    setItems(c.data || []);
    setTasks(t.data || []);
    setSubs(s.data || []);
    setLoading(false);
  }

  function openCreate() { setEditing(null); setForm(blank()); setShowModal(true); }
  function openEdit(c: CrewConfirmation) { setEditing(c); setForm({ ...c }); setShowModal(true); }

  async function save() {
    setSaving(true);
    const alertStatus = (form.confirmation_status === 'Cannot Attend' || form.confirmation_status === 'Need Reschedule') ? 'red' : form.confirmation_status === 'Confirmed' ? 'green' : 'yellow';
    const payload = { ...form, project_id: projectId, alert_status: alertStatus, confirmed_at: form.confirmation_status === 'Confirmed' ? new Date().toISOString() : null };
    if (editing) {
      await supabase.from('crew_confirmations').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('crew_confirmations').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const f = (k: keyof CrewConfirmation, v: any) => setForm(p => ({ ...p, [k]: v }));
  const fc = (k: keyof CrewConfirmation) => (e: React.ChangeEvent<HTMLInputElement>) => f(k, e.target.checked);
  const pendingCount = items.filter(i => i.confirmation_status === 'Pending').length;
  const issueCount = items.filter(i => ['Cannot Attend','Need Reschedule'].includes(i.confirmation_status)).length;

  if (loading) return <div className="text-center py-12 text-concrete-400 text-sm">Loading confirmations...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-concrete-700">{items.length} confirmations</h3>
          {pendingCount > 0 && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">{pendingCount} pending</span>}
          {issueCount > 0 && <span className="text-xs text-hazard-700 bg-hazard-50 border border-hazard-200 px-2 py-1 rounded-lg">{issueCount} issue{issueCount > 1 ? 's' : ''}</span>}
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Add Confirmation</button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-concrete-400 text-sm">No crew confirmations yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map(c => {
            const task = tasks.find(t => t.id === c.task_id);
            const sub = subs.find(s => s.id === c.subcontractor_user_id);
            const StatusIcon = c.confirmation_status === 'Confirmed' ? CheckCircle : c.confirmation_status === 'Cannot Attend' || c.confirmation_status === 'Need Reschedule' ? XCircle : Clock;
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <StatusIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${c.confirmation_status === 'Confirmed' ? 'text-site-500' : c.confirmation_status === 'Cannot Attend' || c.confirmation_status === 'Need Reschedule' ? 'text-hazard-500' : 'text-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-concrete-900">
                        {new Date(c.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[c.confirmation_status] || ''}`}>{c.confirmation_status}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1 text-xs text-concrete-500">
                      {task && <span>Task: <strong className="text-concrete-700">{task.task_name}</strong></span>}
                      {sub && <span>Sub: <strong className="text-concrete-700">{sub.full_name}</strong></span>}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {[['crew_available','Crew Available'],['start_time_confirmed','Time Confirmed'],['scope_understood','Scope Reviewed'],['material_reviewed','Materials Reviewed'],['site_access_confirmed','Site Access OK']].map(([k, label]) => (
                        <span key={k} className={`text-xs flex items-center gap-1 ${(c as any)[k] ? 'text-site-600' : 'text-concrete-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${(c as any)[k] ? 'bg-site-500' : 'bg-concrete-300'}`} />
                          {label}
                        </span>
                      ))}
                    </div>
                    {c.confirmation_notes && <p className="text-xs text-concrete-500 mt-1 italic">{c.confirmation_notes}</p>}
                  </div>
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Confirmation' : 'Add Crew Confirmation'} onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Scheduled Date *</label>
                <input type="date" className="input-field" value={(form.scheduled_date as string) || ''} onChange={e => f('scheduled_date', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Status</label>
                <select className="input-field" value={form.confirmation_status || 'Pending'} onChange={e => f('confirmation_status', e.target.value)}>
                  {CONF_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Task</label>
                <select className="input-field" value={form.task_id || ''} onChange={e => f('task_id', e.target.value || null)}>
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Subcontractor</label>
                <select className="input-field" value={form.subcontractor_user_id || ''} onChange={e => f('subcontractor_user_id', e.target.value || null)}>
                  <option value="">None</option>
                  {subs.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([['crew_available','Crew Available'],['start_time_confirmed','Start Time Confirmed'],['scope_understood','Scope Understood'],['material_reviewed','Materials Reviewed'],['site_access_confirmed','Site Access Confirmed']] as [keyof CrewConfirmation, string][]).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-xs text-concrete-700 cursor-pointer">
                  <input type="checkbox" checked={!!(form as any)[k]} onChange={fc(k)} className="w-3.5 h-3.5 rounded" /> {l}
                </label>
              ))}
            </div>
            <div>
              <label className="label-sm">Questions Before Arrival</label>
              <textarea className="input-field" rows={2} value={form.questions_before_arrival || ''} onChange={e => f('questions_before_arrival', e.target.value)} />
            </div>
            <div>
              <label className="label-sm">Notes</label>
              <textarea className="input-field" rows={2} value={form.confirmation_notes || ''} onChange={e => f('confirmation_notes', e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
