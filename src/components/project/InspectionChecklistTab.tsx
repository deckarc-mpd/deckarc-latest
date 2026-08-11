import { useEffect, useState, useRef } from 'react';
import { supabase, Project, ProjectInspectionRequirement, Permit } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';
import {
  Plus, CheckCircle, XCircle, Calendar, Clock, AlertTriangle,
  GripVertical, Trash2, Lock, Eye, Flag, ChevronDown, ChevronUp,
  Circle,
} from 'lucide-react';

const STANDARD_TYPES = [
  'Footing','Foundation','Pre-pour','Pre-frame','Framing',
  'Electrical Rough-in','Plumbing Rough-in','HVAC Rough-in',
  'Insulation','Drywall','Mechanical','Fire','Zoning',
  'Final','Certificate of Occupancy','Custom',
];

type ReqStatus = ProjectInspectionRequirement['status'];
type ReadinessStatus = ProjectInspectionRequirement['readiness_status'];

const STATUS_CFG: Record<ReqStatus, { label: string; icon: React.FC<any>; cls: string; dotCls: string }> = {
  Pending:              { label: 'Pending',             icon: Circle,        cls: 'text-slate-400', dotCls: 'bg-slate-200' },
  Scheduled:            { label: 'Scheduled',           icon: Calendar,      cls: 'text-blue-600',  dotCls: 'bg-blue-500' },
  Passed:               { label: 'Passed',              icon: CheckCircle,   cls: 'text-emerald-600', dotCls: 'bg-emerald-500' },
  Failed:               { label: 'Failed',              icon: XCircle,       cls: 'text-red-600',   dotCls: 'bg-red-500' },
  'Correction Required':{ label: 'Correction Required', icon: AlertTriangle, cls: 'text-red-600',   dotCls: 'bg-red-400' },
  Waived:               { label: 'Waived',              icon: CheckCircle,   cls: 'text-slate-400', dotCls: 'bg-slate-300' },
  'Not Required':       { label: 'Not Required',        icon: Circle,        cls: 'text-slate-300', dotCls: 'bg-slate-100' },
};

const READINESS_CFG: Record<ReadinessStatus, { cls: string; badge: string }> = {
  'Not Ready':     { cls: 'text-slate-400', badge: 'bg-slate-100 text-slate-500 border-slate-200' },
  'Ready':         { cls: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Needs Attention': { cls: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Blocked':       { cls: 'text-red-600', badge: 'bg-red-50 text-red-700 border-red-200' },
};

const blankReq = (projectId: string, orgId: string | null, order: number): Partial<ProjectInspectionRequirement> => ({
  project_id: projectId, organization_id: orgId,
  inspection_type: 'Footing', custom_inspection_name: '', custom_inspection_reason: '',
  is_custom: false, inspection_order: order, required: true, optional: false,
  permit_id: null, prerequisite_inspection_id: null,
  related_phase: '', related_task_id: null,
  status: 'Pending', readiness_status: 'Not Ready',
  attention_flag: false, attention_reasons: [],
  client_visible: true, client_message: '', notes: '',
});

type Role = string;
const isAdmin     = (r: Role) => r === 'DECKARC_ADMIN';
const isConvazant = (r: Role) => r === 'CONVAZANT_SUPER_ADMIN';
const isGC        = (r: Role) => r === 'GENERAL_CONTRACTOR';
const isClient    = (r: Role) => r === 'CLIENT';
const canWrite    = (r: Role) => isAdmin(r) || isGC(r);

export default function InspectionChecklistTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const role: Role = profile?.role || 'SUBCONTRACTOR';

  const [reqs, setReqs]           = useState<ProjectInspectionRequirement[]>([]);
  const [permits, setPermits]     = useState<Permit[]>([]);
  const [tasks, setTasks]         = useState<{ id: string; task_name: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editReq, setEditReq]     = useState<ProjectInspectionRequirement | null>(null);
  const [form, setForm]           = useState<Partial<ProjectInspectionRequirement>>(
    blankReq(project.id, profile?.organization_id ?? null, 0)
  );
  const [saving, setSaving]       = useState(false);

  // Drag-and-drop state
  const dragIdx   = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: p }, { data: t }] = await Promise.all([
      supabase
        .from('project_inspection_requirements')
        .select('*')
        .eq('project_id', project.id)
        .order('inspection_order'),
      supabase
        .from('permits')
        .select('id,permit_type,permit_number,permit_status')
        .eq('project_id', project.id),
      supabase
        .from('tasks')
        .select('id,task_name')
        .eq('project_id', project.id),
    ]);
    setReqs(r || []);
    setPermits(p || []);
    setTasks(t || []);
    setLoading(false);
  }

  function openAdd() {
    setEditReq(null);
    setForm(blankReq(project.id, profile?.organization_id ?? null, reqs.length));
    setShowModal(true);
  }
  function openEdit(req: ProjectInspectionRequirement) {
    setEditReq(req);
    setForm({ ...req });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      updated_at: new Date().toISOString(),
      inspection_type: form.is_custom ? 'Custom' : form.inspection_type,
    };
    if (editReq) {
      await supabase.from('project_inspection_requirements').update(payload).eq('id', editReq.id);
      await logActivity('checklist_updated', editReq.id, `Updated inspection requirement: ${displayName(form as any)}`);
    } else {
      const { data: inserted } = await supabase.from('project_inspection_requirements').insert(payload).select('id').single();
      if (inserted) await logActivity('checklist_added', inserted.id, `Added inspection requirement: ${displayName(form as any)}`);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function deleteReq(req: ProjectInspectionRequirement) {
    if (!confirm(`Remove "${displayName(req)}" from the checklist?`)) return;
    await supabase.from('project_inspection_requirements').delete().eq('id', req.id);
    await logActivity('checklist_removed', req.id, `Removed inspection requirement: ${displayName(req)}`);
    load();
  }

  async function toggleAttention(req: ProjectInspectionRequirement) {
    const newVal = !req.attention_flag;
    await supabase.from('project_inspection_requirements').update({
      attention_flag: newVal,
      readiness_status: newVal ? 'Needs Attention' : 'Not Ready',
      updated_at: new Date().toISOString(),
    }).eq('id', req.id);
    await logActivity('checklist_attention', req.id, `Attention flag ${newVal ? 'raised' : 'cleared'} for ${displayName(req)}`);
    load();
  }

  // Drag-and-drop reorder
  async function handleDrop(dropIdx: number) {
    if (dragIdx.current === null || dragIdx.current === dropIdx) {
      dragIdx.current = null;
      setDragOver(null);
      return;
    }
    const sorted = [...reqs];
    const [moved] = sorted.splice(dragIdx.current, 1);
    sorted.splice(dropIdx, 0, moved);
    // Warn if prerequisite conflict
    const newOrder = sorted.map((r, i) => ({ ...r, inspection_order: i }));
    setReqs(newOrder);
    dragIdx.current = null;
    setDragOver(null);
    // Persist new order
    await Promise.all(
      newOrder.map(r =>
        supabase.from('project_inspection_requirements')
          .update({ inspection_order: r.inspection_order, updated_at: new Date().toISOString() })
          .eq('id', r.id)
      )
    );
    await logActivity('checklist_reordered', project.id, 'Inspection checklist order updated');
    load();
  }

  async function logActivity(actionType: string, recordId: string, notes: string) {
    if (!profile) return;
    await supabase.from('activity_log').insert({
      project_id: project.id, user_id: profile.id,
      user_full_name: profile.full_name, user_role: profile.role,
      action_type: actionType, module: 'Inspection Checklist',
      related_record_id: recordId, related_record_type: 'inspection_requirement',
      notes,
    });
  }

  function displayName(r: ProjectInspectionRequirement) {
    if (r.is_custom && r.custom_inspection_name) return r.custom_inspection_name;
    return r.inspection_type;
  }

  const f = (k: keyof ProjectInspectionRequirement, v: any) => setForm(p => ({ ...p, [k]: v }));

  // Summary counts
  const total     = reqs.filter(r => r.required).length;
  const passed    = reqs.filter(r => r.status === 'Passed').length;
  const scheduled = reqs.filter(r => r.status === 'Scheduled').length;
  const pending   = reqs.filter(r => r.status === 'Pending').length;
  const attention = reqs.filter(r => r.attention_flag || r.readiness_status === 'Needs Attention').length;
  const failed    = reqs.filter(r => ['Failed','Correction Required'].includes(r.status)).length;

  // ── Client view ──
  if (isClient(role)) {
    const visible = reqs.filter(r => r.client_visible);
    const passedVis = visible.filter(r => r.status === 'Passed').length;
    return (
      <div className="p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Inspection Progress</h2>
        <p className="text-xs text-slate-400 mb-4">Required inspections for your project.</p>
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
            <p className="text-sm text-slate-500 font-medium">No inspection updates yet</p>
            <p className="text-xs text-slate-400 mt-1">Your project coordinator will update this section as inspections progress.</p>
          </div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 mb-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">Inspection progress</p>
              <p className="text-2xl font-bold text-slate-900 mb-1">{passedVis} <span className="text-base font-normal text-slate-400">of {visible.length} passed</span></p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${visible.length ? Math.round((passedVis / visible.length) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {visible.map(r => {
                const cfg = STATUS_CFG[r.status];
                const Icon = cfg.icon;
                return (
                  <div key={r.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.cls}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{displayName(r)}</p>
                      {r.client_message && <p className="text-xs text-slate-500 mt-0.5">{r.client_message}</p>}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${READINESS_CFG[r.readiness_status].badge}`}>
                      {r.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Admin / GC / Convazant full view ──
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Inspection Checklist</h2>
          <p className="text-xs text-slate-400 mt-0.5">Required & optional inspections for this project.</p>
        </div>
        {canWrite(role) && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Requirement
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Required',  value: total,     cls: 'text-slate-700' },
          { label: 'Passed',    value: passed,    cls: 'text-emerald-600' },
          { label: 'Scheduled', value: scheduled, cls: 'text-blue-600' },
          { label: 'Pending',   value: pending,   cls: 'text-slate-500' },
          { label: 'Attention', value: attention, cls: 'text-amber-600' },
          { label: 'Failed',    value: failed,    cls: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-3 py-3 text-center shadow-sm">
            <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {attention > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2.5 rounded-lg mb-4">
          <Flag className="w-4 h-4 flex-shrink-0" />
          {attention} inspection requirement{attention > 1 ? 's' : ''} need{attention === 1 ? 's' : ''} attention.
        </div>
      )}
      {failed > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {failed} inspection{failed > 1 ? 's' : ''} failed or require correction.
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : reqs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-slate-400 mb-1">No inspection requirements yet.</p>
          {canWrite(role) && (
            <button onClick={openAdd} className="text-xs text-steel-700 underline">Add the first one</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {reqs.map((req, idx) => {
            const cfg = STATUS_CFG[req.status];
            const Icon = cfg.icon;
            const rdCfg = READINESS_CFG[req.readiness_status];
            const isDragTarget = dragOver === idx;
            return (
              <div
                key={req.id}
                draggable={canWrite(role)}
                onDragStart={() => { dragIdx.current = idx; }}
                onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(idx)}
                className={`bg-white border rounded-xl px-4 py-3 transition-all ${
                  isDragTarget ? 'border-steel-400 shadow-md' : 'border-slate-200 shadow-sm'
                } ${req.attention_flag ? 'border-l-4 border-l-amber-400' : req.status === 'Failed' || req.status === 'Correction Required' ? 'border-l-4 border-l-red-400' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {canWrite(role) && (
                    <GripVertical className="w-4 h-4 text-slate-300 cursor-grab flex-shrink-0" />
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.dotCls}`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{displayName(req)}</span>
                      {req.is_custom && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Custom</span>
                      )}
                      {req.required && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Required</span>
                      )}
                      {req.optional && !req.required && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-50 text-slate-400">Optional</span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rdCfg.badge}`}>
                        {req.readiness_status}
                      </span>
                      {req.attention_flag && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 flex items-center gap-0.5">
                          <Flag className="w-2.5 h-2.5" /> Attention
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
                      <span className={`font-medium ${cfg.cls}`}>{cfg.label}</span>
                      {req.related_phase && <span>Phase: {req.related_phase}</span>}
                      {req.permit_id && permits.find(p => p.id === req.permit_id) && (
                        <span>Permit: {permits.find(p => p.id === req.permit_id)?.permit_type}</span>
                      )}
                      {req.notes && <span className="text-slate-300">· {req.notes}</span>}
                    </div>
                    {req.is_custom && req.custom_inspection_reason && (
                      <p className="text-xs text-slate-400 mt-0.5">Reason: {req.custom_inspection_reason}</p>
                    )}
                    {req.attention_reasons?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {req.attention_reasons.map(reason => (
                          <span key={reason} className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{reason}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canWrite(role) && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleAttention(req)}
                        className={`p-1.5 rounded-lg transition-colors ${req.attention_flag ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
                        title={req.attention_flag ? 'Clear attention flag' : 'Flag for attention'}
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(req)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      {isAdmin(role) && (
                        <button
                          onClick={() => deleteReq(req)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <Modal title={editReq ? 'Edit Inspection Requirement' : 'Add Inspection Requirement'} onClose={() => setShowModal(false)}>
          <div className="space-y-4 max-h-[76vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">

              {/* Custom toggle */}
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.is_custom} onChange={e => f('is_custom', e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  This is a custom/non-standard inspection
                </label>
              </div>

              {form.is_custom ? (
                <>
                  <div className="col-span-2">
                    <label className="label-sm">Custom Inspection Name *</label>
                    <input className="input-field" value={form.custom_inspection_name || ''} onChange={e => f('custom_inspection_name', e.target.value)} placeholder="e.g., Deck Ledger Connection" />
                  </div>
                  <div className="col-span-2">
                    <label className="label-sm">Reason / Justification *</label>
                    <textarea rows={2} className="input-field" value={form.custom_inspection_reason || ''} onChange={e => f('custom_inspection_reason', e.target.value)} placeholder="Why is this custom inspection required?" />
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <label className="label-sm">Inspection Type *</label>
                  <select className="input-field" value={form.inspection_type || 'Footing'} onChange={e => f('inspection_type', e.target.value)}>
                    {STANDARD_TYPES.filter(t => t !== 'Custom').map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="label-sm">Status</label>
                <select className="input-field" value={form.status || 'Pending'} onChange={e => f('status', e.target.value as ReqStatus)}>
                  {(Object.keys(STATUS_CFG) as ReqStatus[]).map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Readiness</label>
                <select className="input-field" value={form.readiness_status || 'Not Ready'} onChange={e => f('readiness_status', e.target.value as ReadinessStatus)}>
                  {(Object.keys(READINESS_CFG) as ReadinessStatus[]).map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Required / Optional */}
              <div className="col-span-2 flex gap-6">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.required} onChange={e => f('required', e.target.checked)} className="w-3.5 h-3.5 rounded" /> Required
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.optional} onChange={e => f('optional', e.target.checked)} className="w-3.5 h-3.5 rounded" /> Optional
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.attention_flag} onChange={e => f('attention_flag', e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  <Flag className="w-3 h-3 text-amber-500" /> Needs Attention
                </label>
              </div>

              {/* Linked permit */}
              <div className="col-span-2">
                <label className="label-sm">Linked Permit</label>
                <select className="input-field" value={form.permit_id || ''} onChange={e => f('permit_id', e.target.value || null)}>
                  <option value="">None</option>
                  {permits.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.permit_type}{p.permit_number ? ` — #${p.permit_number}` : ''} ({p.permit_status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Prerequisite */}
              <div className="col-span-2">
                <label className="label-sm">Prerequisite Inspection</label>
                <select className="input-field" value={form.prerequisite_inspection_id || ''} onChange={e => f('prerequisite_inspection_id', e.target.value || null)}>
                  <option value="">None</option>
                  {reqs
                    .filter(r => r.id !== editReq?.id)
                    .map(r => <option key={r.id} value={r.id}>{displayName(r)}</option>)
                  }
                </select>
              </div>

              <div>
                <label className="label-sm">Related Phase</label>
                <input className="input-field" value={form.related_phase || ''} onChange={e => f('related_phase', e.target.value)} placeholder="e.g., Foundation, Framing..." />
              </div>
              <div>
                <label className="label-sm">Related Task</label>
                <select className="input-field" value={form.related_task_id || ''} onChange={e => f('related_task_id', e.target.value || null)}>
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="label-sm">Notes</label>
                <textarea rows={2} className="input-field" value={form.notes || ''} onChange={e => f('notes', e.target.value)} />
              </div>

              {/* Client visibility */}
              {(isAdmin(role) || isGC(role)) && (
                <>
                  <div className="col-span-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Client Visibility
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={!!form.client_visible} onChange={e => f('client_visible', e.target.checked)} className="w-3.5 h-3.5 rounded" />
                      Show this inspection to the client
                    </label>
                  </div>
                  {form.client_visible && (
                    <div className="col-span-2">
                      <label className="label-sm">Client Message</label>
                      <input className="input-field" value={form.client_message || ''} onChange={e => f('client_message', e.target.value)} placeholder="e.g., Framing inspection is scheduled and on track." />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editReq ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
