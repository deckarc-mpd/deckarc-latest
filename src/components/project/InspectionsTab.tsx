import { useEffect, useState, useRef } from 'react';
import { supabase, Project, Inspection, Permit } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertDot } from '../StatusBadge';
import Modal from '../Modal';
import { uploadFile, insertProjectFile, getSignedUrl } from '../../lib/fileUpload';
import {
  Plus, Edit2, AlertTriangle, Eye, EyeOff, Lock, Info, Calendar, Flag,
  Paperclip, Upload, FileText, Download, Loader,
} from 'lucide-react';

interface RelatedFile {
  id: string;
  file_name: string;
  file_type: string;
  storage_path: string | null;
  signedUrl?: string | null;
}

function RelatedFilesSection({
  projectId, recordId, canUpload, organizationId, userId, userRole,
}: {
  projectId: string; recordId: string; canUpload: boolean;
  organizationId: string | null; userId: string; userRole: string;
}) {
  const [files, setFiles] = useState<RelatedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadFiles(); }, [recordId]);

  async function loadFiles() {
    setLoading(true);
    const { data } = await supabase
      .from('project_files')
      .select('id, file_name, file_type, storage_path, uploaded_at')
      .eq('project_id', projectId)
      .eq('related_module', 'Inspection')
      .eq('related_record_id', recordId)
      .eq('is_deleted', false)
      .order('uploaded_at', { ascending: false });

    const enriched = await Promise.all(
      (data || []).map(async (f: any) => ({
        ...f,
        signedUrl: await getSignedUrl(f.storage_path),
      }))
    );
    setFiles(enriched);
    setLoading(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, projectId, organizationId);
      await insertProjectFile({
        projectId, uploadedByUserId: userId, uploadedByRole: userRole,
        organizationId, fileName: result.fileName, fileType: result.fileType,
        fileSizeKb: result.fileSizeKb, storagePath: result.storagePath,
        documentCategory: 'Inspection Report',
        relatedModule: 'Inspection', relatedRecordId: recordId, clientVisible: false,
      });
      await loadFiles();
    } catch {}
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (loading) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
          <Paperclip className="w-3 h-3" /> Related Files ({files.length})
        </span>
        {canUpload && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-[11px] flex items-center gap-1 text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-400 px-2 py-0.5 rounded-lg transition-colors"
          >
            {uploading ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {uploading ? 'Uploading...' : 'Attach File'}
          </button>
        )}
        <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleFileChange} />
      </div>
      {files.length === 0 ? (
        <p className="text-[11px] text-slate-300 italic">No files attached.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <FileText className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="flex-1 truncate">{f.file_name}</span>
              <span className="text-slate-400 text-[10px] uppercase">{f.file_type}</span>
              {f.signedUrl && (
                <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                  <Download className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const INSPECTION_TYPES = [
  'Footing','Foundation','Framing','Electrical Rough-in','Plumbing Rough-in',
  'HVAC Rough-in','Insulation','Drywall','Final','Certificate of Occupancy',
  'Pre-pour','Pre-frame','Mechanical','Fire','Zoning','Custom','Other',
];
const INSPECTION_STATUSES = [
  'Not Scheduled','Requested','Scheduled','Passed','Failed',
  'Correction Required','Reinspection Required','Reinspection Scheduled',
  'Reinspection Passed','Cancelled',
];

function calcAlert(item: Partial<Inspection>): string {
  if (item.attention_flag) return 'red';
  const r = item.result || item.inspection_status || '';
  if (r === 'Passed' || r === 'Reinspection Passed') return 'green';
  if (r === 'Failed' || r === 'Correction Required') return 'red';
  if (item.correction_required) return 'red';
  if (item.reinspection_required) return 'yellow';
  return 'yellow';
}

const blank = (project: Project): Partial<Inspection> => ({
  inspection_type: 'Other', related_task_id: null,
  permit_id: null, permit_number: '',
  jurisdiction: (project as any).jurisdiction || '',
  requested_date: null, scheduled_date: null,
  inspector_name: '', result: 'Not Scheduled', inspection_status: 'Not Scheduled',
  result_date: null, correction_required: false, correction_notes: '',
  reinspection_required: false, reinspection_requested_date: null,
  reinspection_scheduled_date: null, reinspection_date: null, passed_date: null,
  delay_reason: '', responsible_party: '', notes: '',
  internal_notes: '', client_visible: false, client_message: '',
  inspector_contact: '', schedule_impact: '',
  attention_flag: false, sequence_warning: false, override_reason: '',
  inspection_requirement_id: null,
});

type Role = string;
const isAdmin     = (r: Role) => r === 'DECKARC_ADMIN';
const isConvazant = (r: Role) => r === 'CONVAZANT_SUPER_ADMIN';
const isGC        = (r: Role) => r === 'GENERAL_CONTRACTOR';
const isSub       = (r: Role) => r === 'SUBCONTRACTOR';
const isClient    = (r: Role) => r === 'CLIENT';
const canWrite    = (r: Role) => isAdmin(r) || isGC(r);
const canSeeInternal    = (r: Role) => isAdmin(r) || isConvazant(r) || isGC(r);
const canSeeInspContact = (r: Role) => isAdmin(r) || isGC(r);

function fmt(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const getResultBadge = (result: string) => {
  if (result === 'Passed' || result === 'Reinspection Passed') return 'bg-emerald-100 text-emerald-700';
  if (['Failed','Correction Required'].includes(result)) return 'bg-red-100 text-red-700';
  if (['Scheduled','Reinspection Scheduled','Requested'].includes(result)) return 'bg-blue-100 text-blue-700';
  if (result === 'Reinspection Required') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

export default function InspectionsTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const role: Role = profile?.role || 'SUBCONTRACTOR';

  const [items, setItems]         = useState<Inspection[]>([]);
  const [permits, setPermits]     = useState<Permit[]>([]);
  const [tasks, setTasks]         = useState<{ id: string; task_name: string }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem]   = useState<Inspection | null>(null);
  const [form, setForm]           = useState<Partial<Inspection>>(blank(project));
  const [saving, setSaving]       = useState(false);

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const [{ data: ins }, { data: perms }, { data: tsk }] = await Promise.all([
      supabase.from('inspections').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('permits').select('id,permit_type,permit_number,permit_status,jurisdiction,permit_authority,permit_pulled_by_name,permit_holder_company,permit_holder_contact_phone,inspection_responsibility').eq('project_id', project.id).order('created_at'),
      supabase.from('tasks').select('id,task_name').eq('project_id', project.id),
    ]);
    setItems(ins || []);
    setPermits(perms || []);
    setTasks(tsk || []);
    setLoading(false);
  }

  function openEdit(item: Inspection) { setEditItem(item); setForm({ ...item }); setShowModal(true); }
  function openAdd() { setEditItem(null); setForm(blank(project)); setShowModal(true); }

  // When permit is selected, auto-populate permit_number, jurisdiction
  function handlePermitSelect(permitId: string) {
    const p = permits.find(p => p.id === permitId);
    setForm(prev => ({
      ...prev,
      permit_id: permitId || null,
      permit_number: p?.permit_number || prev.permit_number,
      jurisdiction: p?.jurisdiction || prev.jurisdiction,
    }));
  }

  async function save() {
    if (form.correction_required && !form.correction_notes?.trim()) {
      alert('Please provide correction notes when correction is required.');
      return;
    }
    setSaving(true);
    const alertStatus = calcAlert(form);
    const payload = {
      ...form, project_id: project.id, alert_status: alertStatus,
      requested_date:             (form.requested_date as string)             || null,
      scheduled_date:             (form.scheduled_date as string)             || null,
      result_date:                (form.result_date as string)                || null,
      reinspection_requested_date:(form.reinspection_requested_date as string)|| null,
      reinspection_scheduled_date:(form.reinspection_scheduled_date as string)|| null,
      reinspection_date:          (form.reinspection_date as string)          || null,
      passed_date:                (form.passed_date as string)                || null,
    };
    if (editItem) {
      await supabase.from('inspections').update(payload).eq('id', editItem.id);
      await logActivity('inspection_updated', editItem.id, `Updated inspection: ${form.inspection_type} — ${form.result}`);
    } else {
      const { data: inserted } = await supabase.from('inspections').insert(payload).select('id').single();
      if (inserted) await logActivity('inspection_added', inserted.id, `Added inspection: ${form.inspection_type}`);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function toggleClientVisible(item: Inspection) {
    const newVal = !(item as any).client_visible;
    await supabase.from('inspections').update({ client_visible: newVal } as any).eq('id', item.id);
    await logActivity('inspection_client_visibility', item.id, `Client visibility ${newVal ? 'enabled' : 'disabled'} for ${item.inspection_type}`);
    load();
  }

  async function toggleAttentionFlag(item: Inspection) {
    const newVal = !item.attention_flag;
    await supabase.from('inspections').update({ attention_flag: newVal, alert_status: newVal ? 'red' : calcAlert(item) }).eq('id', item.id);
    await logActivity('inspection_attention_flag', item.id, `Attention flag ${newVal ? 'raised' : 'cleared'} for ${item.inspection_type}`);
    load();
  }

  async function logActivity(actionType: string, recordId: string, notes: string) {
    if (!profile) return;
    await supabase.from('activity_log').insert({
      project_id: project.id, user_id: profile.id,
      user_full_name: profile.full_name, user_role: profile.role,
      action_type: actionType, module: 'Inspections',
      related_record_id: recordId, related_record_type: 'inspection',
      notes,
    });
  }

  const f  = (k: keyof Inspection, v: any) => setForm(p => ({ ...p, [k]: v }));
  const fc = (k: keyof Inspection) => (e: React.ChangeEvent<HTMLInputElement>) => f(k, e.target.checked);
  const needReinspection = form.result === 'Reinspection Required' || form.result === 'Failed' || form.correction_required || form.reinspection_required;
  const failedCount = items.filter(i => ['Failed','Correction Required'].includes(i.result)).length;
  const attentionCount = items.filter(i => i.attention_flag).length;

  // Derive display permit number (from linked permit if available)
  function getPermitLabel(item: Inspection) {
    if (item.permit_id) {
      const p = permits.find(p => p.id === item.permit_id);
      if (p) return `${p.permit_type}${p.permit_number ? ` #${p.permit_number}` : ''}`;
    }
    if (item.permit_number) return `#${item.permit_number}`;
    return null;
  }

  /* ── Client view ── */
  if (isClient(role)) {
    const visible = items.filter(i => (i as any).client_visible);
    return (
      <div className="p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Inspection Status</h2>
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
            <p className="text-sm text-slate-500 font-medium">No inspection updates yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              An inspection-related step is being coordinated by DECKARC. No client action is needed at this time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(i => (
              <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="text-sm text-slate-800">{i.inspection_type} Inspection</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {(i as any).client_message || 'An inspection-related step is being coordinated by DECKARC. No client action is needed at this time.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Subcontractor view ── */
  if (isSub(role)) {
    const relevant = items.filter(i =>
      ['Scheduled','Requested','Reinspection Scheduled','Correction Required','Reinspection Required','Failed'].includes(i.result) ||
      i.correction_required || i.reinspection_required
    );
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2.5 rounded-lg mb-4">
          <Info className="w-4 h-4 flex-shrink-0" />
          Showing inspection items that may affect your assigned tasks. Contact your GC or Admin for full details.
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading...</div>
        ) : relevant.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No upcoming inspections affecting your tasks.</div>
        ) : (
          <div className="space-y-3">
            {relevant.map(i => (
              <div key={i.id} className={`card p-4 ${i.correction_required ? 'border-l-4 border-l-red-500' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <AlertDot status={i.alert_status || 'yellow'} />
                  <span className="text-sm text-slate-800">{i.inspection_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getResultBadge(i.result)}`}>{i.result}</span>
                </div>
                {i.scheduled_date && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    Scheduled: {fmt(i.scheduled_date)}
                  </div>
                )}
                {i.correction_required && i.correction_notes && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-red-700 mt-2">
                    <span className="font-semibold">Correction needed: </span>{i.correction_notes}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">Contact your GC or Admin for full details.</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Admin / GC / Convazant full view ── */
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-800">
          Inspections <span className="text-sm font-normal text-slate-400">({items.length})</span>
        </h2>
        {canWrite(role) && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Inspection
          </button>
        )}
      </div>

      {/* Alert banners */}
      {attentionCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-3">
          <Flag className="w-4 h-4 flex-shrink-0" />
          <span>{attentionCount} inspection{attentionCount > 1 ? 's' : ''} flagged for attention.</span>
        </div>
      )}
      {failedCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{failedCount} inspection{failedCount > 1 ? 's' : ''} failed or require correction — schedule reinspection.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No inspections yet.</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className={`card p-4 ${item.correction_required ? 'border-l-4 border-l-red-500' : item.attention_flag ? 'border-l-4 border-l-amber-500' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertDot status={item.alert_status || 'yellow'} />
                    <span className="text-sm text-slate-900">{item.inspection_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getResultBadge(item.result)}`}>{item.result}</span>
                    {item.attention_flag && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                        <Flag className="w-3 h-3" />Needs Attention
                      </span>
                    )}
                    {item.sequence_warning && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Sequence Warning</span>
                    )}
                    {item.correction_required && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Correction Required</span>
                    )}
                    {item.reinspection_required && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Reinspection Required</span>
                    )}
                    {(item as any).client_visible && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
                        <Eye className="w-3 h-3" />Client Visible
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-slate-500">
                    {item.jurisdiction && <span>{item.jurisdiction}</span>}
                    {getPermitLabel(item) && <span>Permit: {getPermitLabel(item)}</span>}
                    {item.inspector_name && <span>Inspector: {item.inspector_name}</span>}
                    {canSeeInspContact(role) && (item as any).inspector_contact && (
                      <span>{(item as any).inspector_contact}</span>
                    )}
                    {item.responsible_party && <span>Resp: {item.responsible_party}</span>}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-500">
                    {item.requested_date && <span>Requested: {fmt(item.requested_date)}</span>}
                    {item.scheduled_date && <span>Scheduled: {fmt(item.scheduled_date)}</span>}
                    {item.result_date && <span>Result: {fmt(item.result_date)}</span>}
                    {item.passed_date && <span className="text-emerald-600">Passed: {fmt(item.passed_date)}</span>}
                    {item.reinspection_scheduled_date && (
                      <span className="text-amber-600">Reinspection: {fmt(item.reinspection_scheduled_date)}</span>
                    )}
                  </div>

                  {item.correction_notes && (
                    <p className="text-xs text-red-600 mt-1.5">Correction: {item.correction_notes}</p>
                  )}
                  {item.delay_reason && (
                    <p className="text-xs text-slate-500 mt-1">Delay: {item.delay_reason}</p>
                  )}
                  {item.override_reason && (
                    <p className="text-xs text-orange-600 mt-1">Override: {item.override_reason}</p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-slate-400 mt-1">{item.notes}</p>
                  )}

                  {canSeeInternal(role) && (item as any).schedule_impact && (
                    <div className="flex items-start gap-1.5 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">{(item as any).schedule_impact}</p>
                    </div>
                  )}

                  {canSeeInternal(role) && (item as any).internal_notes && (
                    <div className="flex items-start gap-1.5 mt-2 bg-slate-100 rounded-lg px-2.5 py-1.5">
                      <Lock className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500">{(item as any).internal_notes}</p>
                    </div>
                  )}

                  {/* Related files */}
                  {canSeeInternal(role) && profile && (
                    <RelatedFilesSection
                      projectId={project.id}
                      recordId={item.id}
                      canUpload={canWrite(role)}
                      organizationId={profile.organization_id ?? null}
                      userId={profile.id}
                      userRole={profile.role}
                    />
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {canWrite(role) && (
                    <button
                      onClick={() => toggleAttentionFlag(item)}
                      className={`p-1.5 rounded-lg transition-colors ${item.attention_flag ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
                      title={item.attention_flag ? 'Clear attention flag' : 'Flag for attention'}
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin(role) && (
                    <button
                      onClick={() => toggleClientVisible(item)}
                      className={`p-1.5 rounded-lg transition-colors ${(item as any).client_visible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
                      title={(item as any).client_visible ? 'Hide from client' : 'Approve for client'}
                    >
                      {(item as any).client_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {canWrite(role) && (
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editItem ? 'Edit Inspection' : 'Add Inspection'} onClose={() => setShowModal(false)}>
          <div className="space-y-4 max-h-[76vh] overflow-y-auto pr-1">

            <div className="grid grid-cols-2 gap-3">

              {/* Linked Permit — FIRST field */}
              <div className="col-span-2">
                <label className="label-sm">Linked Permit *</label>
                {permits.length === 0 ? (
                  <div className="input-field bg-slate-50 text-slate-400 text-xs flex items-center">
                    No permits on this project yet — add a permit first in the Permits tab.
                  </div>
                ) : (
                  <select
                    className="input-field"
                    value={form.permit_id || ''}
                    onChange={e => handlePermitSelect(e.target.value)}
                  >
                    <option value="">— Select a permit —</option>
                    {permits.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.permit_type}{p.permit_number ? ` — #${p.permit_number}` : ''} — {p.permit_status}
                      </option>
                    ))}
                  </select>
                )}
                {!form.permit_id && permits.length > 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">No permit linked — inspection will have no permit reference.</p>
                )}
              </div>

              {/* Permit holder read-only card after selection */}
              {form.permit_id && (() => {
                const p = permits.find(x => x.id === form.permit_id) as any;
                if (!p || (!p.permit_pulled_by_name && !p.permit_holder_company)) return null;
                return (
                  <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Permit Holder (from linked permit)</p>
                    <div className="flex items-center gap-2 text-slate-700">
                      {p.permit_pulled_by_name && <span className="font-medium">{p.permit_pulled_by_name}</span>}
                      {p.permit_holder_company && <span className="text-slate-400">· {p.permit_holder_company}</span>}
                    </div>
                    {p.permit_holder_contact_phone && <p className="text-slate-500 mt-0.5">{p.permit_holder_contact_phone}</p>}
                    {p.inspection_responsibility && <p className="text-slate-500 mt-0.5">Inspection responsibility: {p.inspection_responsibility}</p>}
                  </div>
                );
              })()}

              <div>
                <label className="label-sm">Inspection Type</label>
                <select className="input-field" value={form.inspection_type || 'Other'} onChange={e => f('inspection_type', e.target.value)}>
                  {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Status / Result</label>
                <select className="input-field" value={form.result || 'Not Scheduled'} onChange={e => { f('result', e.target.value); f('inspection_status', e.target.value); }}>
                  {INSPECTION_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="label-sm">
                  Jurisdiction <span className="text-slate-400 font-normal">(auto-filled)</span>
                </label>
                <input className="input-field" placeholder="From project/permit" value={form.jurisdiction || ''} onChange={e => f('jurisdiction', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Inspector / Company</label>
                <input className="input-field" value={form.inspector_name || ''} onChange={e => f('inspector_name', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Inspector Contact</label>
                <input className="input-field" placeholder="Phone or email..." value={(form as any).inspector_contact || ''} onChange={e => f('inspector_contact' as keyof Inspection, e.target.value)} />
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
                <label className="label-sm">Requested Date</label>
                <input type="date" className="input-field" value={(form.requested_date as string) || ''} onChange={e => f('requested_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Scheduled Date</label>
                <input type="date" className="input-field" value={(form.scheduled_date as string) || ''} onChange={e => f('scheduled_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Result Date</label>
                <input type="date" className="input-field" value={(form.result_date as string) || ''} onChange={e => f('result_date', e.target.value || null)} />
              </div>
              {(form.result === 'Passed' || form.result === 'Reinspection Passed') && (
                <div>
                  <label className="label-sm">Passed Date</label>
                  <input type="date" className="input-field" value={(form.passed_date as string) || ''} onChange={e => f('passed_date', e.target.value || null)} />
                </div>
              )}

              <div className="col-span-2 flex gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.correction_required} onChange={fc('correction_required')} className="w-3.5 h-3.5 rounded" /> Correction Required
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.reinspection_required} onChange={fc('reinspection_required')} className="w-3.5 h-3.5 rounded" /> Reinspection Required
                </label>
                {canWrite(role) && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={!!form.attention_flag} onChange={fc('attention_flag')} className="w-3.5 h-3.5 rounded" />
                    <Flag className="w-3 h-3 text-amber-500" /> Needs Attention
                  </label>
                )}
                {canWrite(role) && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={!!form.sequence_warning} onChange={fc('sequence_warning')} className="w-3.5 h-3.5 rounded" /> Sequence Warning
                  </label>
                )}
              </div>

              {form.correction_required && (
                <div className="col-span-2">
                  <label className="label-sm">Correction Notes *</label>
                  <textarea className="input-field" rows={2} value={form.correction_notes || ''} onChange={e => f('correction_notes', e.target.value)} placeholder="Describe what needs to be corrected before reinspection" />
                </div>
              )}
              {form.sequence_warning && (
                <div className="col-span-2">
                  <label className="label-sm">Override Reason</label>
                  <input className="input-field" value={form.override_reason || ''} onChange={e => f('override_reason', e.target.value)} placeholder="Reason for scheduling out of order..." />
                </div>
              )}

              {needReinspection && (
                <>
                  <div>
                    <label className="label-sm">Reinspection Requested</label>
                    <input type="date" className="input-field" value={(form.reinspection_requested_date as string) || ''} onChange={e => f('reinspection_requested_date', e.target.value || null)} />
                  </div>
                  <div>
                    <label className="label-sm">Reinspection Scheduled</label>
                    <input type="date" className="input-field" value={(form.reinspection_scheduled_date as string) || ''} onChange={e => f('reinspection_scheduled_date', e.target.value || null)} />
                  </div>
                </>
              )}

              <div className="col-span-2">
                <label className="label-sm">Reason for Delay</label>
                <input className="input-field" value={form.delay_reason || ''} onChange={e => f('delay_reason', e.target.value)} />
              </div>
              {canSeeInternal(role) && (
                <div className="col-span-2">
                  <label className="label-sm">Schedule Impact</label>
                  <input className="input-field" value={(form as any).schedule_impact || ''} onChange={e => f('schedule_impact' as keyof Inspection, e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <label className="label-sm">Notes</label>
                <textarea rows={2} className="input-field" value={form.notes || ''} onChange={e => f('notes', e.target.value)} />
              </div>

              {/* Admin-only fields */}
              {isAdmin(role) && (
                <>
                  <div className="col-span-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                      <Lock className="w-3 h-3" />Admin Controls
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="label-sm">Internal Notes (not shown to client)</label>
                    <textarea rows={2} className="input-field bg-slate-50" value={(form as any).internal_notes || ''} onChange={e => f('internal_notes' as keyof Inspection, e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="label-sm flex items-center gap-1"><Eye className="w-3 h-3 text-slate-400" />Client Message</label>
                    <input className="input-field" value={(form as any).client_message || ''} onChange={e => f('client_message' as keyof Inspection, e.target.value)} placeholder="An inspection step is being coordinated by DECKARC." />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={!!(form as any).client_visible} onChange={e => f('client_visible' as keyof Inspection, e.target.checked)} className="w-3.5 h-3.5 rounded" />
                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                      Approve — visible to client
                    </label>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editItem ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
