import { useEffect, useState, useRef } from 'react';
import { supabase, Project, Permit } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertDot } from '../StatusBadge';
import Modal from '../Modal';
import { uploadFile, insertProjectFile, getSignedUrl } from '../../lib/fileUpload';
import {
  Plus, Edit2, AlertTriangle, Eye, EyeOff, Lock, Info,
  User, Building2, Phone, Mail, BadgeCheck, ChevronDown, ChevronUp,
  Paperclip, Upload, FileText, Download, Loader, X, ShieldOff, ShieldCheck, ShieldAlert, Check,
} from 'lucide-react';

type PermitsApplicability = 'Applicable' | 'Not Applicable' | 'To Be Confirmed';
const APPLICABILITY_OPTIONS: PermitsApplicability[] = ['Applicable', 'Not Applicable', 'To Be Confirmed'];

interface RelatedFile {
  id: string;
  file_name: string;
  file_type: string;
  document_category: string;
  storage_path: string | null;
  uploaded_at: string;
  signedUrl?: string | null;
}

function RelatedFilesSection({
  projectId, recordId, module: relModule, canUpload, organizationId, userId, userRole,
}: {
  projectId: string; recordId: string; module: string; canUpload: boolean;
  organizationId: string | null; userId: string; userRole: string;
}) {
  const [files, setFiles] = useState<RelatedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadFiles(); }, [recordId]);

  async function loadFiles() {
    setLoading(true);
    const { data } = await supabase
      .from('project_files')
      .select('id, file_name, file_type, document_category, storage_path, uploaded_at')
      .eq('project_id', projectId)
      .eq('related_module', relModule)
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
    setShowPicker(false);
    try {
      const result = await uploadFile(file, projectId, organizationId);
      await insertProjectFile({
        projectId, uploadedByUserId: userId, uploadedByRole: userRole,
        organizationId, fileName: result.fileName, fileType: result.fileType,
        fileSizeKb: result.fileSizeKb, storagePath: result.storagePath,
        documentCategory: relModule === 'Permit' ? 'Permit' : 'Inspection Report',
        relatedModule: relModule, relatedRecordId: recordId, clientVisible: false,
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

const PERMIT_STATUSES = [
  'Not Required','Not Started','Preparing','Submitted','Under Review',
  'Correction Requested','Revision Needed','Resubmitted','Approved',
  'Rejected','Expired','Delayed','Closed',
];

function calcAlert(permit: Partial<Permit>): string {
  if (!permit.permit_required) return 'green';
  if (permit.permit_status === 'Approved') return 'green';
  if (['Rejected','Correction Requested','Revision Needed','Expired'].includes(permit.permit_status || '')) return 'red';
  if (permit.revision_requested || permit.permit_delay_expected) return 'red';
  if (permit.permit_status === 'Not Started') return 'yellow';
  if (permit.expected_approval_date) {
    const today = new Date().toISOString().split('T')[0];
    if ((permit.expected_approval_date as string) < today && permit.permit_status !== 'Approved') return 'red';
  }
  return 'yellow';
}

const blank = (project: Project): Partial<Permit> => ({
  permit_required: true, permit_type: '', submitted_date: null,
  permit_number: '', permit_status: 'Not Started', approval_date: null,
  expected_approval_date: null, actual_approval_date: null,
  revision_requested: false, revision_notes: '', permit_delay_expected: false,
  delay_reason: '', responsible_user_id: null, notes: '',
  internal_notes: '', client_visible: false, client_message: '',
  // Holder
  permit_pulled_by_name: '', permit_holder_company: '',
  permit_holder_contact_phone: '', permit_holder_contact_email: '',
  license_number: '', license_valid_until: null,
  permit_pull_date: null, inspection_responsibility: '',
  // Location — auto-fill from project
  county: (project as any).county || '',
  city: project.city || '',
  jurisdiction: (project as any).jurisdiction || '',
  permit_authority: (project as any).permit_authority || '',
});

type Role = string;
const isAdmin     = (r: Role) => r === 'DECKARC_ADMIN';
const isConvazant = (r: Role) => r === 'CONVAZANT_SUPER_ADMIN';
const isGC        = (r: Role) => r === 'GENERAL_CONTRACTOR';
const isSub       = (r: Role) => r === 'SUBCONTRACTOR';
const isClient    = (r: Role) => r === 'CLIENT';
const canWrite    = (r: Role) => isAdmin(r) || isGC(r);
const canSeeInternal = (r: Role) => isAdmin(r) || isConvazant(r) || isGC(r);

function fmt(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const getPermitBadge = (status: string) => {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700';
  if (['Rejected','Correction Requested','Revision Needed','Expired'].includes(status)) return 'bg-red-100 text-red-700';
  if (['Submitted','Resubmitted','Under Review'].includes(status)) return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
};

function HolderCard({ permit }: { permit: Permit }) {
  const [open, setOpen] = useState(false);
  const hasHolder = permit.permit_pulled_by_name || permit.permit_holder_company || permit.permit_holder_contact_phone || permit.permit_holder_contact_email || permit.license_number;
  if (!hasHolder) return null;
  return (
    <div className="mt-2 border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
          <User className="w-3 h-3" /> Permit Holder
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && (
        <div className="px-3 py-2.5 bg-white grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600">
          {permit.permit_pulled_by_name && (
            <div className="col-span-2 flex items-center gap-1.5">
              <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="font-medium text-slate-700">{permit.permit_pulled_by_name}</span>
            </div>
          )}
          {permit.permit_holder_company && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span>{permit.permit_holder_company}</span>
            </div>
          )}
          {permit.inspection_responsibility && (
            <div className="flex items-center gap-1.5">
              <BadgeCheck className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span>Insp. resp.: {permit.inspection_responsibility}</span>
            </div>
          )}
          {permit.permit_holder_contact_phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span>{permit.permit_holder_contact_phone}</span>
            </div>
          )}
          {permit.permit_holder_contact_email && (
            <div className="flex items-center gap-1.5 col-span-2">
              <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span>{permit.permit_holder_contact_email}</span>
            </div>
          )}
          {permit.license_number && (
            <div className="flex items-center gap-1.5">
              <BadgeCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />
              <span>Lic #{permit.license_number}</span>
              {permit.license_valid_until && (
                <span className="text-slate-400">· exp {fmt(permit.license_valid_until)}</span>
              )}
            </div>
          )}
          {permit.permit_pull_date && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Pulled: {fmt(permit.permit_pull_date)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PermitsTab({ project, onProjectUpdate }: { project: Project; onProjectUpdate?: () => void }) {
  const { profile } = useAuth();
  const role: Role = profile?.role || 'SUBCONTRACTOR';

  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPermit, setEditPermit] = useState<Permit | null>(null);
  const [form, setForm] = useState<Partial<Permit>>(blank(project));
  const [saving, setSaving] = useState(false);

  const applicability: PermitsApplicability = ((project as any).permits_applicability as PermitsApplicability) || 'To Be Confirmed';
  const [savingApplicability, setSavingApplicability] = useState(false);
  const [applicabilitySaved, setApplicabilitySaved] = useState(false);

  async function saveApplicability(val: PermitsApplicability) {
    setSavingApplicability(true);
    await supabase.from('projects').update({ permits_applicability: val } as any).eq('id', project.id);
    setSavingApplicability(false);
    setApplicabilitySaved(true);
    setTimeout(() => setApplicabilitySaved(false), 2000);
    onProjectUpdate?.();
  }

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('permits').select('*').eq('project_id', project.id).order('created_at');
    setPermits(data || []);
    setLoading(false);
  }

  function openEdit(p: Permit) { setEditPermit(p); setForm({ ...p }); setShowModal(true); }
  function openAdd() { setEditPermit(null); setForm(blank(project)); setShowModal(true); }

  async function save() {
    setSaving(true);
    const alertStatus = calcAlert(form);
    const payload = { ...form, project_id: project.id, alert_status: alertStatus };
    if (editPermit) {
      await supabase.from('permits').update(payload).eq('id', editPermit.id);
      await logActivity('permit_updated', editPermit.id, `Updated permit: ${form.permit_type || 'Permit'} — ${form.permit_status}`);
    } else {
      const { data: inserted } = await supabase.from('permits').insert(payload).select('id').single();
      if (inserted) await logActivity('permit_added', inserted.id, `Added permit: ${form.permit_type || 'Permit'}`);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function toggleClientVisible(p: Permit) {
    const newVal = !(p as any).client_visible;
    await supabase.from('permits').update({ client_visible: newVal } as any).eq('id', p.id);
    await logActivity('permit_client_visibility', p.id, `Client visibility ${newVal ? 'enabled' : 'disabled'} for permit: ${p.permit_type}`);
    load();
  }

  async function logActivity(actionType: string, recordId: string, notes: string) {
    if (!profile) return;
    await supabase.from('activity_log').insert({
      project_id: project.id, user_id: profile.id,
      user_full_name: profile.full_name, user_role: profile.role,
      action_type: actionType, module: 'Permits',
      related_record_id: recordId, related_record_type: 'permit',
      notes,
    });
  }

  const f  = (k: keyof Permit, v: any) => setForm(p => ({ ...p, [k]: v }));
  const fc = (k: keyof Permit) => (e: React.ChangeEvent<HTMLInputElement>) => f(k, e.target.checked);

  /* ── Client view ── */
  if (isClient(role)) {
    const visible = permits.filter(p => (p as any).client_visible);
    const applicabilityBadge =
      applicability === 'Not Applicable'
        ? { label: 'Not Applicable', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: ShieldOff }
        : applicability === 'Applicable'
        ? { label: 'Applicable', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ShieldCheck }
        : { label: 'To Be Confirmed', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: ShieldAlert };

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Permit Status</h2>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${applicabilityBadge.cls}`}>
            <applicabilityBadge.icon className="w-3.5 h-3.5" />
            {applicabilityBadge.label}
          </span>
        </div>
        {applicability === 'Not Applicable' ? (
          <div className="bg-slate-50 rounded-xl p-8 text-center border border-dashed border-slate-200">
            <ShieldOff className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Permits & Inspections are not applicable for this project</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Your project team has confirmed that permits and inspections are not required for this scope of work.
            </p>
          </div>
        ) : loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
            <p className="text-sm text-slate-500 font-medium">No permit updates yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Permit review is currently in progress. DECKARC will share the next confirmed update once available.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(p => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-sm text-slate-800">{p.permit_type || 'Permit Update'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPermitBadge(p.permit_status)}`}>{p.permit_status}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {(p as any).client_message || 'Permit review is currently in progress. DECKARC will share the next confirmed update once available.'}
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
    if (applicability === 'Not Applicable') {
      return (
        <div className="p-6">
          <div className="bg-slate-50 rounded-xl p-8 text-center border border-dashed border-slate-200">
            <ShieldOff className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Permits & Inspections are not applicable for this project</p>
            <p className="text-xs text-slate-400 mt-1">No permit blockers will affect your work on this project.</p>
          </div>
        </div>
      );
    }
    const relevant = permits.filter(p =>
      ['Correction Requested','Revision Needed','Rejected','Expired','Delayed'].includes(p.permit_status)
    );
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2.5 rounded-lg mb-4">
          <Info className="w-4 h-4 flex-shrink-0" />
          Showing permit items that may affect your work. Contact your GC or Admin for full details.
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading...</div>
        ) : relevant.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No permit blockers affecting your tasks.</div>
        ) : (
          <div className="space-y-3">
            {relevant.map(p => (
              <div key={p.id} className="card p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertDot status={p.alert_status || 'yellow'} />
                  <span className="text-sm text-slate-800">{p.permit_type || 'Permit'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPermitBadge(p.permit_status)}`}>{p.permit_status}</span>
                </div>
                {p.delay_reason && <p className="text-xs text-slate-500 mt-1.5">Note: {p.delay_reason}</p>}
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
      {/* Permits & Inspections Applicability control */}
      <div className="mb-5 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-600 mb-0.5">Permits &amp; Inspections Applicability</p>
          {canWrite(role) ? (
            <div className="flex items-center gap-2 flex-wrap">
              {APPLICABILITY_OPTIONS.map(opt => {
                const active = applicability === opt;
                const cls = active
                  ? opt === 'Not Applicable'
                    ? 'bg-slate-700 text-white border-slate-700'
                    : opt === 'Applicable'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700';
                return (
                  <button
                    key={opt}
                    disabled={savingApplicability}
                    onClick={() => saveApplicability(opt)}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border transition-all ${cls} disabled:opacity-50`}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {opt}
                  </button>
                );
              })}
              {savingApplicability && <Loader className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
              {applicabilitySaved && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>}
            </div>
          ) : (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full border ${
              applicability === 'Not Applicable' ? 'bg-slate-100 text-slate-500 border-slate-200' :
              applicability === 'Applicable' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {applicability}
            </span>
          )}
        </div>
      </div>

      {/* Not Applicable empty state — hides all permit content but data is preserved */}
      {applicability === 'Not Applicable' ? (
        <div className="bg-slate-50 rounded-xl p-10 text-center border border-dashed border-slate-200">
          <ShieldOff className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Permits &amp; Inspections are marked Not Applicable for this project</p>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            No permits or inspections will be tracked or surfaced in operational dashboards. Any previously recorded data is preserved and will reappear if applicability is changed.
          </p>
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-slate-800">
          Permits <span className="text-sm font-normal text-slate-400">({permits.length})</span>
        </h2>
        {canWrite(role) && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Permit
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading...</div>
      ) : permits.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No permits yet.</div>
      ) : (
        <div className="space-y-3">
          {permits.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertDot status={p.alert_status || 'yellow'} />
                    <span className="text-sm text-slate-900">{p.permit_type || 'Permit'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPermitBadge(p.permit_status)}`}>{p.permit_status}</span>
                    {p.revision_requested && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Revision Requested</span>
                    )}
                    {p.permit_delay_expected && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />Delay Expected
                      </span>
                    )}
                    {(p as any).client_visible && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
                        <Eye className="w-3 h-3" />Client Visible
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                    {p.permit_number && <span>#{p.permit_number}</span>}
                    {p.county && <span>{p.county} County</span>}
                    {p.city && !p.county && <span>{p.city}</span>}
                    {p.jurisdiction && <span>· {p.jurisdiction}</span>}
                    {p.permit_authority && <span>· AHJ: {p.permit_authority}</span>}
                    {p.submitted_date && <span>Submitted: {fmt(p.submitted_date)}</span>}
                    {p.expected_approval_date && <span>Expected: {fmt(p.expected_approval_date)}</span>}
                    {p.actual_approval_date && <span className="text-emerald-600">Approved: {fmt(p.actual_approval_date)}</span>}
                    {p.approval_date && !p.actual_approval_date && <span className="text-emerald-600">Approved: {fmt(p.approval_date)}</span>}
                  </div>

                  {p.revision_notes && (
                    <p className="text-xs text-red-600 mt-1.5">Revision: {p.revision_notes}</p>
                  )}
                  {p.delay_reason && (
                    <p className="text-xs text-slate-500 mt-1">Delay: {p.delay_reason}</p>
                  )}
                  {p.notes && (
                    <p className="text-xs text-slate-400 mt-1">{p.notes}</p>
                  )}

                  {/* Permit holder collapsible */}
                  <HolderCard permit={p} />

                  {/* Internal notes */}
                  {canSeeInternal(role) && (p as any).internal_notes && (
                    <div className="flex items-start gap-1.5 mt-2 bg-slate-100 rounded-lg px-2.5 py-1.5">
                      <Lock className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500">{(p as any).internal_notes}</p>
                    </div>
                  )}

                  {/* Related files */}
                  {canSeeInternal(role) && profile && (
                    <RelatedFilesSection
                      projectId={project.id}
                      recordId={p.id}
                      module="Permit"
                      canUpload={canWrite(role)}
                      organizationId={profile.organization_id ?? null}
                      userId={profile.id}
                      userRole={profile.role}
                    />
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {isAdmin(role) && (
                    <button
                      onClick={() => toggleClientVisible(p)}
                      className={`p-1.5 rounded-lg transition-colors ${(p as any).client_visible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
                      title={(p as any).client_visible ? 'Hide from client' : 'Approve for client'}
                    >
                      {(p as any).client_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {canWrite(role) && (
                    <button
                      onClick={() => openEdit(p)}
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
        <Modal title={editPermit ? 'Edit Permit' : 'Add Permit'} onClose={() => setShowModal(false)}>
          <div className="space-y-4 max-h-[76vh] overflow-y-auto pr-1">

            {/* Basic permit info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label-sm">Permit Type *</label>
                <input className="input-field" value={form.permit_type || ''} onChange={e => f('permit_type', e.target.value)} placeholder="Building, Electrical, Plumbing..." />
              </div>
              <div>
                <label className="label-sm">Permit Number</label>
                <input className="input-field" value={form.permit_number || ''} onChange={e => f('permit_number', e.target.value)} />
              </div>
              <div>
                <label className="label-sm">Status</label>
                <select className="input-field" value={form.permit_status || 'Not Started'} onChange={e => f('permit_status', e.target.value)}>
                  {PERMIT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Submitted Date</label>
                <input type="date" className="input-field" value={(form.submitted_date as string) || ''} onChange={e => f('submitted_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Permit Pull Date</label>
                <input type="date" className="input-field" value={(form.permit_pull_date as string) || ''} onChange={e => f('permit_pull_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Expected Approval</label>
                <input type="date" className="input-field" value={(form.expected_approval_date as string) || ''} onChange={e => f('expected_approval_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Actual Approval</label>
                <input type="date" className="input-field" value={(form.actual_approval_date as string) || ''} onChange={e => f('actual_approval_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Resubmitted Date</label>
                <input type="date" className="input-field" value={(form.resubmitted_date as string) || ''} onChange={e => f('resubmitted_date', e.target.value || null)} />
              </div>
              <div className="col-span-2 flex gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.permit_required} onChange={fc('permit_required')} className="w-3.5 h-3.5 rounded" /> Required
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.revision_requested} onChange={fc('revision_requested')} className="w-3.5 h-3.5 rounded" /> Revision Requested
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!form.permit_delay_expected} onChange={fc('permit_delay_expected')} className="w-3.5 h-3.5 rounded" /> Delay Expected
                </label>
              </div>
              {form.revision_requested && (
                <div className="col-span-2">
                  <label className="label-sm">Revision Notes</label>
                  <textarea className="input-field" rows={2} value={form.revision_notes || ''} onChange={e => f('revision_notes', e.target.value)} />
                </div>
              )}
              {form.permit_delay_expected && (
                <div className="col-span-2">
                  <label className="label-sm">Reason for Delay</label>
                  <input className="input-field" value={form.delay_reason || ''} onChange={e => f('delay_reason', e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <label className="label-sm">Notes</label>
                <textarea rows={2} className="input-field" value={form.notes || ''} onChange={e => f('notes', e.target.value)} />
              </div>
            </div>

            {/* Location / Jurisdiction */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Location / Jurisdiction</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">County</label>
                  <input className="input-field" value={form.county || ''} onChange={e => f('county', e.target.value)} placeholder="Auto-filled from project" />
                </div>
                <div>
                  <label className="label-sm">City</label>
                  <input className="input-field" value={form.city || ''} onChange={e => f('city', e.target.value)} />
                </div>
                <div>
                  <label className="label-sm">Jurisdiction</label>
                  <input className="input-field" value={form.jurisdiction || ''} onChange={e => f('jurisdiction', e.target.value)} placeholder="Governing AHJ" />
                </div>
                <div>
                  <label className="label-sm">Permit Authority (AHJ)</label>
                  <input className="input-field" value={form.permit_authority || ''} onChange={e => f('permit_authority', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Permit Holder */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Permit Holder / Contractor
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Permit Holder Name</label>
                  <input className="input-field" value={form.permit_pulled_by_name || ''} onChange={e => f('permit_pulled_by_name', e.target.value)} placeholder="Name on permit" />
                </div>
                <div>
                  <label className="label-sm">Company</label>
                  <input className="input-field" value={form.permit_holder_company || ''} onChange={e => f('permit_holder_company', e.target.value)} />
                </div>
                <div>
                  <label className="label-sm">Phone</label>
                  <input className="input-field" value={form.permit_holder_contact_phone || ''} onChange={e => f('permit_holder_contact_phone', e.target.value)} />
                </div>
                <div>
                  <label className="label-sm">Email</label>
                  <input type="email" className="input-field" value={form.permit_holder_contact_email || ''} onChange={e => f('permit_holder_contact_email', e.target.value)} />
                </div>
                <div>
                  <label className="label-sm">License Number</label>
                  <input className="input-field" value={form.license_number || ''} onChange={e => f('license_number', e.target.value)} />
                </div>
                <div>
                  <label className="label-sm">License Expiry</label>
                  <input type="date" className="input-field" value={(form.license_valid_until as string) || ''} onChange={e => f('license_valid_until', e.target.value || null)} />
                </div>
                <div className="col-span-2">
                  <label className="label-sm">Inspection Responsibility</label>
                  <input className="input-field" value={form.inspection_responsibility || ''} onChange={e => f('inspection_responsibility', e.target.value)} placeholder="Who schedules inspections for this permit?" />
                </div>
              </div>
            </div>

            {/* Admin-only fields */}
            {isAdmin(role) && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Admin Controls
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label-sm">Internal Notes (not shown to client)</label>
                    <textarea rows={2} className="input-field bg-slate-50" value={(form as any).internal_notes || ''} onChange={e => f('internal_notes' as keyof Permit, e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="label-sm flex items-center gap-1"><Eye className="w-3 h-3 text-slate-400" />Client Message</label>
                    <input className="input-field" value={(form as any).client_message || ''} onChange={e => f('client_message' as keyof Permit, e.target.value)} placeholder="Permit review is currently in progress." />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={!!(form as any).client_visible} onChange={e => f('client_visible' as keyof Permit, e.target.checked)} className="w-3.5 h-3.5 rounded" />
                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                      Approve — visible to client
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : editPermit ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}
        </>
      )}
    </div>
  );
}
