import { useEffect, useState } from 'react';
import { supabase, Permit, Inspection, Project } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertDot } from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  ShieldCheck, ClipboardList, Plus, Edit2, AlertTriangle,
  Eye, EyeOff, Lock, ChevronDown, ChevronRight, Info,
  CheckCircle, Calendar, FileText, Building, Search, X,
} from 'lucide-react';

const PERMIT_STATUSES = [
  'Not Required','Not Started','Preparing','Submitted','Under Review',
  'Correction Requested','Revision Needed','Resubmitted','Approved',
  'Rejected','Expired','Delayed','Closed',
];

const INSPECTION_TYPES = [
  'Footing','Foundation','Framing','Electrical Rough-in','Plumbing Rough-in',
  'HVAC Rough-in','Insulation','Drywall','Final','Other',
];

const INSPECTION_STATUSES = [
  'Not Scheduled','Requested','Scheduled','Passed','Failed',
  'Correction Required','Reinspection Required','Reinspection Scheduled',
  'Reinspection Passed','Cancelled',
];

type PermitWithProject  = Permit  & { project?: Project };
type InspectionWithProject = Inspection & { project?: Project };

function calcPermitAlert(p: Partial<Permit>): string {
  if (!p.permit_required) return 'green';
  if (p.permit_status === 'Approved') return 'green';
  if (['Rejected','Correction Requested','Revision Needed','Expired'].includes(p.permit_status || '')) return 'red';
  if (p.revision_requested || p.permit_delay_expected) return 'red';
  if (p.expected_approval_date) {
    const today = new Date().toISOString().split('T')[0];
    if ((p.expected_approval_date as string) < today && p.permit_status !== 'Approved') return 'red';
  }
  return 'yellow';
}

function calcInspectionAlert(i: Partial<Inspection>): string {
  const r = i.result || i.inspection_status || '';
  if (r === 'Passed' || r === 'Reinspection Passed') return 'green';
  if (r === 'Failed' || r === 'Correction Required') return 'red';
  if (i.correction_required) return 'red';
  return 'yellow';
}

const permitBadge = (s: string) => {
  if (s === 'Approved') return 'bg-emerald-50 text-emerald-700';
  if (['Rejected','Correction Requested','Revision Needed','Expired'].includes(s)) return 'bg-red-50 text-red-600';
  if (['Submitted','Resubmitted','Under Review'].includes(s)) return 'bg-blue-50 text-blue-700';
  return 'bg-amber-50 text-amber-700';
};

const inspectionBadge = (r: string) => {
  if (r === 'Passed' || r === 'Reinspection Passed') return 'bg-emerald-50 text-emerald-700';
  if (['Failed','Correction Required'].includes(r)) return 'bg-red-50 text-red-600';
  if (['Scheduled','Reinspection Scheduled','Requested'].includes(r)) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
};

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const blankPermit = (): Partial<Permit> => ({
  permit_required: true, permit_type: '', submitted_date: null,
  permit_number: '', permit_status: 'Not Started', approval_date: null,
  expected_approval_date: null, actual_approval_date: null, revision_requested: false,
  revision_notes: '', permit_delay_expected: false, delay_reason: '',
  responsible_user_id: null, notes: '', internal_notes: '',
  client_visible: false, client_message: '', jurisdiction: '',
  permit_pulled_by_name: '', permit_holder_company: '',
  permit_holder_contact_phone: '', permit_holder_contact_email: '',
  license_number: '', license_valid_until: null,
  permit_pull_date: null, inspection_responsibility: '',
  county: '', city: '', permit_authority: '',
});

const blankInspection = (): Partial<Inspection> => ({
  inspection_type: 'Other', related_task_id: null, permit_number: '',
  jurisdiction: '', requested_date: null, scheduled_date: null,
  inspector_name: '', inspector_contact: '', result: 'Not Scheduled',
  inspection_status: 'Not Scheduled', result_date: null,
  correction_required: false, correction_notes: '', reinspection_required: false,
  reinspection_requested_date: null, reinspection_scheduled_date: null,
  reinspection_date: null, passed_date: null, delay_reason: '',
  responsible_party: '', notes: '', internal_notes: '',
  client_visible: false, client_message: '', schedule_impact: '',
});

/* ── Role-permission helpers ─────────────────────────────────────── */
type Role = string;

const isAdmin    = (r: Role) => r === 'DECKARC_ADMIN';
const isConvazant= (r: Role) => r === 'CONVAZANT_SUPER_ADMIN';
const isGC       = (r: Role) => r === 'GENERAL_CONTRACTOR';
const isSub      = (r: Role) => r === 'SUBCONTRACTOR';
const isClient   = (r: Role) => r === 'CLIENT';

const canWrite   = (r: Role) => isAdmin(r) || isGC(r);
const canApproveClientVisible = (r: Role) => isAdmin(r);
const canSeeInternalNotes     = (r: Role) => isAdmin(r) || isConvazant(r) || isGC(r);
const canSeeInspectorContact  = (r: Role) => isAdmin(r) || isGC(r);

/* ── Section component ───────────────────────────────────────────── */
function RoleBanner({ role }: { role: Role }) {
  if (isConvazant(role)) {
    return (
      <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2.5 rounded-xl mb-5">
        <Building className="w-4 h-4 flex-shrink-0" />
        <span>You are viewing DECKARC LLC workspace as CONVAZANT Super Admin for support/admin purposes.</span>
      </div>
    );
  }
  if (isSub(role)) {
    return (
      <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs px-4 py-2.5 rounded-xl mb-5">
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>Showing inspection items that may affect your assigned tasks. Contact your GC or Admin for full details.</span>
      </div>
    );
  }
  return null;
}

/* ── Summary cards ───────────────────────────────────────────────── */
type SummaryCardKey = 'permits-approved' | 'permits-pending' | 'permit-issues' | 'insp-upcoming' | 'insp-passed' | 'need-attention';

function SummaryCards({ permits, inspections, role, onCardClick }: {
  permits: PermitWithProject[];
  inspections: InspectionWithProject[];
  role: Role;
  onCardClick?: (key: SummaryCardKey) => void;
}) {
  if (isClient(role)) return null;

  const today = new Date().toISOString().split('T')[0];
  const approvedPermits  = permits.filter(p => p.permit_status === 'Approved').length;
  const pendingPermits   = permits.filter(p => !['Approved','Closed','Not Required'].includes(p.permit_status)).length;
  const issuePermits     = permits.filter(p => ['Rejected','Correction Requested','Revision Needed','Expired'].includes(p.permit_status)).length;
  const upcomingInsp     = inspections.filter(i => i.scheduled_date && i.scheduled_date >= today).length;
  const passedInsp       = inspections.filter(i => i.result === 'Passed' || i.result === 'Reinspection Passed').length;
  const failedInsp       = inspections.filter(i => ['Failed','Correction Required'].includes(i.result)).length;

  const cards: { label: string; value: number; color: string; icon: React.ElementType; key: SummaryCardKey }[] = [
    { label: 'Permits Approved',     value: approvedPermits, color: 'emerald', icon: CheckCircle,    key: 'permits-approved' },
    { label: 'Permits Pending',      value: pendingPermits,  color: pendingPermits > 0 ? 'amber' : 'slate', icon: ShieldCheck, key: 'permits-pending' },
    { label: 'Permit Issues',        value: issuePermits,    color: issuePermits > 0 ? 'red' : 'slate', icon: AlertTriangle, key: 'permit-issues' },
    { label: 'Inspections Upcoming', value: upcomingInsp,    color: 'blue', icon: Calendar,           key: 'insp-upcoming' },
    { label: 'Inspections Passed',   value: passedInsp,      color: 'emerald', icon: CheckCircle,     key: 'insp-passed' },
    { label: 'Need Attention',       value: failedInsp,      color: failedInsp > 0 ? 'red' : 'slate', icon: AlertTriangle, key: 'need-attention' },
  ];

  const colorMap: Record<string, { bg: string; iconBg: string; iconColor: string; val: string }> = {
    emerald: { bg: 'border-emerald-100', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', val: 'text-emerald-700' },
    amber:   { bg: 'border-amber-100',   iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   val: 'text-amber-700' },
    red:     { bg: 'border-red-200',     iconBg: 'bg-red-50',     iconColor: 'text-red-600',     val: 'text-red-700' },
    blue:    { bg: 'border-blue-100',    iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    val: 'text-blue-700' },
    slate:   { bg: 'border-slate-200',   iconBg: 'bg-slate-100',  iconColor: 'text-slate-500',   val: 'text-slate-700' },
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {cards.map(({ label, value, color, icon: Icon, key }) => {
        const c = colorMap[color] || colorMap.slate;
        return (
          <button
            key={key}
            onClick={() => onCardClick?.(key)}
            className={`bg-white rounded-xl border ${c.bg} p-3.5 shadow-sm text-left transition-all hover:shadow-md hover:scale-[1.02] ${onCardClick ? 'cursor-pointer' : ''}`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${c.iconBg}`}>
              <Icon className={`w-3.5 h-3.5 ${c.iconColor}`} />
            </div>
            <p className={`text-xl font-bold leading-none ${c.val}`}>{value}</p>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1 leading-snug">{label}</p>
          </button>
        );
      })}
    </div>
  );
}

/* ── Permit detail drawer ────────────────────────────────────────── */
function PermitDetailDrawer({
  permit, role, onClose, onEdit, onToggleClientVisible,
}: {
  permit: PermitWithProject;
  role: Role;
  onClose: () => void;
  onEdit?: () => void;
  onToggleClientVisible?: () => void;
}) {
  return (
    <Modal title="Permit Details" onClose={onClose} size="md">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <AlertDot status={permit.alert_status || 'yellow'} />
          <span className="font-semibold text-slate-900">{permit.permit_type || 'Permit'}</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${permitBadge(permit.permit_status)}`}>
            {permit.permit_status}
          </span>
          {permit.project && (
            <span className="text-xs text-slate-400 ml-auto">{permit.project.project_name}</span>
          )}
        </div>

        {/* Core fields */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            ['Permit Number',     permit.permit_number || '—'],
            ['County',            permit.county || '—'],
            ['City',              permit.city || '—'],
            ['Jurisdiction',      permit.jurisdiction || (permit as any).jurisdiction || '—'],
            ['Permit Authority',  permit.permit_authority || '—'],
            ['Submitted',         fmt(permit.submitted_date)],
            ['Pull Date',         fmt(permit.permit_pull_date)],
            ['Expected Approval', fmt(permit.expected_approval_date)],
            ['Actual Approval',   fmt(permit.actual_approval_date)],
            ['Resubmitted',       fmt(permit.resubmitted_date)],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">{label}</p>
              <p className="font-medium text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Permit holder section */}
        {(permit.permit_pulled_by_name || permit.permit_holder_company || permit.license_number) && (
          <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Permit Holder</p>
            {permit.permit_pulled_by_name && (
              <div className="flex items-center gap-1.5 text-slate-700">
                <span className="font-medium">{permit.permit_pulled_by_name}</span>
                {permit.permit_holder_company && <span className="text-slate-400">· {permit.permit_holder_company}</span>}
              </div>
            )}
            {permit.permit_holder_contact_phone && (
              <p className="text-slate-600">{permit.permit_holder_contact_phone}</p>
            )}
            {permit.permit_holder_contact_email && (
              <p className="text-slate-600">{permit.permit_holder_contact_email}</p>
            )}
            {permit.license_number && (
              <p className="text-slate-600">
                License #{permit.license_number}
                {permit.license_valid_until ? ` · exp ${fmt(permit.license_valid_until)}` : ''}
              </p>
            )}
            {permit.inspection_responsibility && (
              <p className="text-slate-600">Inspection resp.: {permit.inspection_responsibility}</p>
            )}
          </div>
        )}

        {/* Flags */}
        {(permit.revision_requested || permit.permit_delay_expected) && (
          <div className="space-y-1.5">
            {permit.revision_requested && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-red-700">Revision Requested</p>
                  {permit.revision_notes && <p className="text-red-600 mt-0.5">{permit.revision_notes}</p>}
                </div>
              </div>
            )}
            {permit.permit_delay_expected && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-amber-700">Delay Expected</p>
                  {permit.delay_reason && <p className="text-amber-600 mt-0.5">{permit.delay_reason}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {permit.notes && (
          <div className="bg-slate-50 rounded-lg p-3 text-xs">
            <p className="font-semibold text-slate-600 mb-1">Notes</p>
            <p className="text-slate-700 leading-relaxed">{permit.notes}</p>
          </div>
        )}

        {/* Internal notes — admin/gc/convazant only */}
        {canSeeInternalNotes(role) && (permit as any).internal_notes && (
          <div className="bg-slate-900 rounded-lg p-3 text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="w-3 h-3 text-slate-400" />
              <p className="font-semibold text-slate-300">Internal Notes</p>
            </div>
            <p className="text-slate-300 leading-relaxed">{(permit as any).internal_notes}</p>
          </div>
        )}

        {/* Client visibility toggle — admin only */}
        {canApproveClientVisible(role) && (
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-xs">
              {(permit as any).client_visible
                ? <Eye className="w-3.5 h-3.5 text-emerald-600" />
                : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              <span className="font-semibold text-slate-700">Client Visibility</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(permit as any).client_visible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {(permit as any).client_visible ? 'Visible to Client' : 'Hidden from Client'}
              </span>
            </div>
            {onToggleClientVisible && (
              <button
                onClick={onToggleClientVisible}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                {(permit as any).client_visible ? 'Hide' : 'Approve & Show'}
              </button>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-ghost text-xs">Close</button>
          {canWrite(role) && onEdit && (
            <button onClick={onEdit} className="btn-primary text-xs">
              <Edit2 className="w-3.5 h-3.5" /> Edit Permit
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Inspection detail drawer ────────────────────────────────────── */
function InspectionDetailDrawer({
  inspection, role, onClose, onEdit, onToggleClientVisible,
}: {
  inspection: InspectionWithProject;
  role: Role;
  onClose: () => void;
  onEdit?: () => void;
  onToggleClientVisible?: () => void;
}) {
  return (
    <Modal title="Inspection Details" onClose={onClose} size="md">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <AlertDot status={inspection.alert_status || 'yellow'} />
          <span className="font-semibold text-slate-900">{inspection.inspection_type}</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${inspectionBadge(inspection.result)}`}>
            {inspection.result}
          </span>
          {inspection.correction_required && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Correction Required</span>
          )}
          {inspection.attention_flag && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Needs Attention</span>
          )}
          {inspection.sequence_warning && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">Sequence Warning</span>
          )}
          {inspection.project && (
            <span className="text-xs text-slate-400 ml-auto">{inspection.project.project_name}</span>
          )}
        </div>

        {/* Core fields */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            ['Jurisdiction',  inspection.jurisdiction || '—'],
            ['Permit Number', inspection.permit_number || '—'],
            ['Inspector',     inspection.inspector_name || '—'],
            ...(canSeeInspectorContact(role) ? [['Inspector Contact', (inspection as any).inspector_contact || '—']] : []),
            ['Responsible Party', inspection.responsible_party || '—'],
            ['Requested',     fmt(inspection.requested_date)],
            ['Scheduled',     fmt(inspection.scheduled_date)],
            ['Result Date',   fmt(inspection.result_date)],
            ['Passed Date',   fmt(inspection.passed_date)],
            ...(inspection.reinspection_scheduled_date ? [['Reinspection', fmt(inspection.reinspection_scheduled_date)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">{label}</p>
              <p className="font-medium text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Correction notes */}
        {inspection.correction_notes && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs">
            <p className="font-semibold text-red-700 mb-1">Correction Notes</p>
            <p className="text-red-600 leading-relaxed">{inspection.correction_notes}</p>
          </div>
        )}

        {/* Schedule impact */}
        {canSeeInternalNotes(role) && (inspection as any).schedule_impact && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs">
            <p className="font-semibold text-amber-700 mb-1">Schedule Impact</p>
            <p className="text-amber-700 leading-relaxed">{(inspection as any).schedule_impact}</p>
          </div>
        )}

        {/* Notes */}
        {inspection.notes && (
          <div className="bg-slate-50 rounded-lg p-3 text-xs">
            <p className="font-semibold text-slate-600 mb-1">Notes</p>
            <p className="text-slate-700 leading-relaxed">{inspection.notes}</p>
          </div>
        )}

        {/* Internal notes */}
        {canSeeInternalNotes(role) && (inspection as any).internal_notes && (
          <div className="bg-slate-900 rounded-lg p-3 text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="w-3 h-3 text-slate-400" />
              <p className="font-semibold text-slate-300">Internal Notes</p>
            </div>
            <p className="text-slate-300 leading-relaxed">{(inspection as any).internal_notes}</p>
          </div>
        )}

        {/* Client visibility toggle */}
        {canApproveClientVisible(role) && (
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-xs">
              {(inspection as any).client_visible
                ? <Eye className="w-3.5 h-3.5 text-emerald-600" />
                : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              <span className="font-semibold text-slate-700">Client Visibility</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(inspection as any).client_visible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {(inspection as any).client_visible ? 'Visible to Client' : 'Hidden from Client'}
              </span>
            </div>
            {onToggleClientVisible && (
              <button
                onClick={onToggleClientVisible}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                {(inspection as any).client_visible ? 'Hide' : 'Approve & Show'}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-ghost text-xs">Close</button>
          {canWrite(role) && onEdit && (
            <button onClick={onEdit} className="btn-primary text-xs">
              <Edit2 className="w-3.5 h-3.5" /> Edit Inspection
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Permit form modal ───────────────────────────────────────────── */
function PermitFormModal({
  title, form, projects, role, saving,
  onChange, onCheckbox, onClose, onSave,
}: {
  title: string;
  form: Partial<Permit>;
  projects: Project[];
  role: Role;
  saving: boolean;
  onChange: (k: keyof Permit, v: any) => void;
  onCheckbox: (k: keyof Permit) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} size="md">
      <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label-sm">Permit Type *</label>
            <input className="input-field" value={form.permit_type || ''} onChange={e => onChange('permit_type', e.target.value)} placeholder="Building, Electrical, Plumbing..." />
          </div>
          <div>
            <label className="label-sm">Permit Number</label>
            <input className="input-field" value={form.permit_number || ''} onChange={e => onChange('permit_number', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Jurisdiction / County</label>
            <input className="input-field" value={(form as any).jurisdiction || ''} onChange={e => onChange('jurisdiction' as keyof Permit, e.target.value)} placeholder="County, City..." />
          </div>
          <div>
            <label className="label-sm">Status</label>
            <select className="input-field" value={form.permit_status || 'Not Started'} onChange={e => onChange('permit_status', e.target.value)}>
              {PERMIT_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Project</label>
            <select className="input-field" value={(form as any).project_id || ''} onChange={e => onChange('project_id' as keyof Permit, e.target.value)}>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Submitted Date</label>
            <input type="date" className="input-field" value={(form.submitted_date as string) || ''} onChange={e => onChange('submitted_date', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">Expected Approval</label>
            <input type="date" className="input-field" value={(form.expected_approval_date as string) || ''} onChange={e => onChange('expected_approval_date', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">Actual Approval</label>
            <input type="date" className="input-field" value={(form.actual_approval_date as string) || ''} onChange={e => onChange('actual_approval_date', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">Resubmitted Date</label>
            <input type="date" className="input-field" value={(form.resubmitted_date as string) || ''} onChange={e => onChange('resubmitted_date', e.target.value || null)} />
          </div>
          <div className="col-span-2 flex gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!form.permit_required} onChange={onCheckbox('permit_required')} className="w-3.5 h-3.5 rounded" /> Required
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!form.revision_requested} onChange={onCheckbox('revision_requested')} className="w-3.5 h-3.5 rounded" /> Revision Requested
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!form.permit_delay_expected} onChange={onCheckbox('permit_delay_expected')} className="w-3.5 h-3.5 rounded" /> Delay Expected
            </label>
          </div>
          {form.revision_requested && (
            <div className="col-span-2">
              <label className="label-sm">Revision Notes</label>
              <textarea className="input-field" rows={2} value={form.revision_notes || ''} onChange={e => onChange('revision_notes', e.target.value)} />
            </div>
          )}
          {form.permit_delay_expected && (
            <div className="col-span-2">
              <label className="label-sm">Reason for Delay</label>
              <input className="input-field" value={form.delay_reason || ''} onChange={e => onChange('delay_reason', e.target.value)} />
            </div>
          )}
          <div className="col-span-2">
            <label className="label-sm">Notes</label>
            <textarea rows={2} className="input-field" value={form.notes || ''} onChange={e => onChange('notes', e.target.value)} />
          </div>

          {/* Permit Holder fields */}
          <div className="col-span-2 pt-2 border-t border-slate-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Permit Holder / Contractor</p>
          </div>
          <div>
            <label className="label-sm">Holder Name</label>
            <input className="input-field" value={form.permit_pulled_by_name || ''} onChange={e => onChange('permit_pulled_by_name', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Company</label>
            <input className="input-field" value={form.permit_holder_company || ''} onChange={e => onChange('permit_holder_company', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Phone</label>
            <input className="input-field" value={form.permit_holder_contact_phone || ''} onChange={e => onChange('permit_holder_contact_phone', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Email</label>
            <input type="email" className="input-field" value={form.permit_holder_contact_email || ''} onChange={e => onChange('permit_holder_contact_email', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">License #</label>
            <input className="input-field" value={form.license_number || ''} onChange={e => onChange('license_number', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">License Expiry</label>
            <input type="date" className="input-field" value={(form.license_valid_until as string) || ''} onChange={e => onChange('license_valid_until', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">Permit Pull Date</label>
            <input type="date" className="input-field" value={(form.permit_pull_date as string) || ''} onChange={e => onChange('permit_pull_date', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">County</label>
            <input className="input-field" value={form.county || ''} onChange={e => onChange('county', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label-sm">Inspection Responsibility</label>
            <input className="input-field" value={form.inspection_responsibility || ''} onChange={e => onChange('inspection_responsibility', e.target.value)} placeholder="Who schedules inspections?" />
          </div>

          {isAdmin(role) && (
            <>
              <div className="col-span-2">
                <label className="label-sm flex items-center gap-1"><Lock className="w-3 h-3 text-slate-400" />Internal Notes (Admin Only)</label>
                <textarea rows={2} className="input-field bg-slate-50" value={(form as any).internal_notes || ''} onChange={e => onChange('internal_notes' as keyof Permit, e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm flex items-center gap-1"><Eye className="w-3 h-3 text-slate-400" />Client Message (shown when visible)</label>
                <input className="input-field" value={(form as any).client_message || ''} onChange={e => onChange('client_message' as keyof Permit, e.target.value)} placeholder="Permit review is currently in progress." />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!(form as any).client_visible} onChange={e => onChange('client_visible' as keyof Permit, e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  Approve — visible to client
                </label>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Inspection form modal ───────────────────────────────────────── */
function InspectionFormModal({
  title, form, projects, permits: allPermits, role, saving,
  onChange, onCheckbox, onClose, onSave,
}: {
  title: string;
  form: Partial<Inspection>;
  projects: Project[];
  permits: PermitWithProject[];
  role: Role;
  saving: boolean;
  onChange: (k: keyof Inspection, v: any) => void;
  onCheckbox: (k: keyof Inspection) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const needReinspection = form.result === 'Reinspection Required' || form.result === 'Failed' || form.correction_required || form.reinspection_required;

  const selectedPermit = allPermits.find(p => p.id === (form as any).permit_id) || null;

  function handlePermitSelect(permitId: string) {
    onChange('permit_id' as keyof Inspection, permitId || null);
    if (!permitId) return;
    const p = allPermits.find(x => x.id === permitId);
    if (!p) return;
    onChange('permit_number' as keyof Inspection, p.permit_number || '');
    onChange('project_id' as keyof Inspection, p.project_id);
    const jurisdiction = p.jurisdiction || p.permit_authority || p.project?.jurisdiction || p.project?.city || '';
    onChange('jurisdiction' as keyof Inspection, jurisdiction);
  }

  return (
    <Modal title={title} onClose={onClose} size="md">
      <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">

          {/* LINKED PERMIT — first field */}
          <div className="col-span-2">
            <label className="label-sm">Linked Permit *</label>
            <select
              className="input-field"
              value={(form as any).permit_id || ''}
              onChange={e => handlePermitSelect(e.target.value)}
            >
              <option value="">— Select a permit —</option>
              {allPermits.length === 0 && <option disabled>No permits available in workspace</option>}
              {allPermits.map(p => {
                const proj = p.project?.project_name || projects.find(x => x.id === p.project_id)?.project_name || '';
                const num  = p.permit_number ? ` — #${p.permit_number}` : '';
                return (
                  <option key={p.id} value={p.id}>
                    {proj ? `${proj} — ` : ''}{p.permit_type || 'Permit'}{num} — {p.permit_status}
                  </option>
                );
              })}
            </select>
            {!(form as any).permit_id && (
              <p className="text-[10px] text-amber-600 mt-1">No permit linked — inspection will have no permit reference.</p>
            )}
          </div>

          {/* Permit holder read-only display after selection */}
          {selectedPermit && (selectedPermit.permit_pulled_by_name || selectedPermit.permit_holder_company) && (
            <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Permit Holder (from linked permit)</p>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="font-medium">{selectedPermit.permit_pulled_by_name}</span>
                {selectedPermit.permit_holder_company && <span className="text-slate-400">· {selectedPermit.permit_holder_company}</span>}
              </div>
              {selectedPermit.permit_holder_contact_phone && (
                <p className="text-slate-500 mt-0.5">{selectedPermit.permit_holder_contact_phone}</p>
              )}
              {selectedPermit.inspection_responsibility && (
                <p className="text-slate-500 mt-0.5">Inspection responsibility: {selectedPermit.inspection_responsibility}</p>
              )}
            </div>
          )}

          <div>
            <label className="label-sm">Inspection Type</label>
            <select className="input-field" value={form.inspection_type || 'Other'} onChange={e => onChange('inspection_type', e.target.value)}>
              {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Status / Result</label>
            <select className="input-field" value={form.result || 'Not Scheduled'} onChange={e => { onChange('result', e.target.value); onChange('inspection_status', e.target.value); }}>
              {INSPECTION_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Project</label>
            <select className="input-field" value={(form as any).project_id || ''} onChange={e => onChange('project_id' as keyof Inspection, e.target.value)}>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Jurisdiction</label>
            <input className="input-field" placeholder="Auto-filled from permit..." value={form.jurisdiction || ''} onChange={e => onChange('jurisdiction', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Inspector / Company</label>
            <input className="input-field" value={form.inspector_name || ''} onChange={e => onChange('inspector_name', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Inspector Contact</label>
            <input className="input-field" placeholder="Phone or email..." value={(form as any).inspector_contact || ''} onChange={e => onChange('inspector_contact' as keyof Inspection, e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Responsible Party</label>
            <input className="input-field" value={form.responsible_party || ''} onChange={e => onChange('responsible_party', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Requested Date</label>
            <input type="date" className="input-field" value={(form.requested_date as string) || ''} onChange={e => onChange('requested_date', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">Scheduled Date</label>
            <input type="date" className="input-field" value={(form.scheduled_date as string) || ''} onChange={e => onChange('scheduled_date', e.target.value || null)} />
          </div>
          <div>
            <label className="label-sm">Result Date</label>
            <input type="date" className="input-field" value={(form.result_date as string) || ''} onChange={e => onChange('result_date', e.target.value || null)} />
          </div>
          {(form.result === 'Passed' || form.result === 'Reinspection Passed') && (
            <div>
              <label className="label-sm">Passed Date</label>
              <input type="date" className="input-field" value={(form.passed_date as string) || ''} onChange={e => onChange('passed_date', e.target.value || null)} />
            </div>
          )}
          <div className="col-span-2 flex gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!form.correction_required} onChange={onCheckbox('correction_required')} className="w-3.5 h-3.5 rounded" /> Correction Required
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!!form.reinspection_required} onChange={onCheckbox('reinspection_required')} className="w-3.5 h-3.5 rounded" /> Reinspection Required
            </label>
          </div>
          {form.correction_required && (
            <div className="col-span-2">
              <label className="label-sm">Correction Notes *</label>
              <textarea className="input-field" rows={2} value={form.correction_notes || ''} onChange={e => onChange('correction_notes', e.target.value)} placeholder="Describe what needs to be corrected..." />
            </div>
          )}
          {needReinspection && (
            <>
              <div>
                <label className="label-sm">Reinspection Requested</label>
                <input type="date" className="input-field" value={(form.reinspection_requested_date as string) || ''} onChange={e => onChange('reinspection_requested_date', e.target.value || null)} />
              </div>
              <div>
                <label className="label-sm">Reinspection Scheduled</label>
                <input type="date" className="input-field" value={(form.reinspection_scheduled_date as string) || ''} onChange={e => onChange('reinspection_scheduled_date', e.target.value || null)} />
              </div>
            </>
          )}
          <div className="col-span-2">
            <label className="label-sm">Reason for Delay</label>
            <input className="input-field" value={form.delay_reason || ''} onChange={e => onChange('delay_reason', e.target.value)} />
          </div>
{canSeeInternalNotes(role) && (
            <div className="col-span-2">
              <label className="label-sm">Schedule Impact</label>
              <input className="input-field" value={(form as any).schedule_impact || ''} onChange={e => onChange('schedule_impact' as keyof Inspection, e.target.value)} placeholder="Describe any schedule impact..." />
            </div>
          )}
          <div className="col-span-2">
            <label className="label-sm">Notes</label>
            <textarea rows={2} className="input-field" value={form.notes || ''} onChange={e => onChange('notes', e.target.value)} />
          </div>
          {isAdmin(role) && (
            <>
              <div className="col-span-2">
                <label className="label-sm flex items-center gap-1"><Lock className="w-3 h-3 text-slate-400" />Internal Notes (Admin Only)</label>
                <textarea rows={2} className="input-field bg-slate-50" value={(form as any).internal_notes || ''} onChange={e => onChange('internal_notes' as keyof Inspection, e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label-sm flex items-center gap-1"><Eye className="w-3 h-3 text-slate-400" />Client Message (shown when visible)</label>
                <input className="input-field" value={(form as any).client_message || ''} onChange={e => onChange('client_message' as keyof Inspection, e.target.value)} placeholder="An inspection step is being coordinated by DECKARC." />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={!!(form as any).client_visible} onChange={e => onChange('client_visible' as keyof Inspection, e.target.checked)} className="w-3.5 h-3.5 rounded" />
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  Approve — visible to client
                </label>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Main page component ─────────────────────────────────────────── */
export default function PermitsInspectionsPage({ initialTab, initialPermitFilter, initialInspFilter }: {
  initialTab?: 'permits' | 'inspections';
  initialPermitFilter?: string;
  initialInspFilter?: string;
} = {}) {
  const { profile } = useAuth();
  const role: Role = profile?.role || 'SUBCONTRACTOR';

  const [permits, setPermits]           = useState<PermitWithProject[]>([]);
  const [inspections, setInspections]   = useState<InspectionWithProject[]>([]);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState<'permits' | 'inspections'>(initialTab ?? 'permits');

  // Permit modal state
  const [permitModal, setPermitModal]   = useState<'add' | 'edit' | null>(null);
  const [permitDetail, setPermitDetail] = useState<PermitWithProject | null>(null);
  const [editPermit, setEditPermit]     = useState<PermitWithProject | null>(null);
  const [permitForm, setPermitForm]     = useState<Partial<Permit>>(blankPermit());

  // Inspection modal state
  const [inspModal, setInspModal]       = useState<'add' | 'edit' | null>(null);
  const [inspDetail, setInspDetail]     = useState<InspectionWithProject | null>(null);
  const [editInsp, setEditInsp]         = useState<InspectionWithProject | null>(null);
  const [inspForm, setInspForm]         = useState<Partial<Inspection>>(blankInspection());

  const [saving, setSaving]             = useState(false);

  // Search + filter
  const [permitSearch, setPermitSearch]         = useState('');
  const [permitStatusFilter, setPermitStatusFilter] = useState<string>(initialPermitFilter ?? 'all');
  const [inspSearch, setInspSearch]             = useState('');
  const [inspResultFilter, setInspResultFilter] = useState<string>('all');
  const [inspComplianceFilter, setInspComplianceFilter] = useState<string>(initialInspFilter ?? 'all');
  const [activeFilterLabel, setActiveFilterLabel] = useState<string | null>(() => {
    if (initialPermitFilter && initialPermitFilter !== 'all') {
      const labels: Record<string, string> = {
        pending: 'Permits Pending', approved: 'Permits Approved', issues: 'Permit Issues',
      };
      return labels[initialPermitFilter] ?? null;
    }
    if (initialInspFilter && initialInspFilter !== 'all') {
      const labels: Record<string, string> = {
        upcoming: 'Inspections Upcoming', passed: 'Inspections Passed', failed: 'Need Attention',
      };
      return labels[initialInspFilter] ?? null;
    }
    return null;
  });

  function handleCardClick(key: SummaryCardKey) {
    setActiveFilterLabel(null);
    switch (key) {
      case 'permits-approved':
        setTab('permits');
        setPermitStatusFilter('Approved');
        setActiveFilterLabel('Permits Approved');
        break;
      case 'permits-pending':
        setTab('permits');
        setPermitStatusFilter('pending');
        setActiveFilterLabel('Permits Pending');
        break;
      case 'permit-issues':
        setTab('permits');
        setPermitStatusFilter('issues');
        setActiveFilterLabel('Permit Issues');
        break;
      case 'insp-upcoming':
        setTab('inspections');
        setInspComplianceFilter('upcoming');
        setActiveFilterLabel('Inspections Upcoming');
        break;
      case 'insp-passed':
        setTab('inspections');
        setInspComplianceFilter('passed');
        setActiveFilterLabel('Inspections Passed');
        break;
      case 'need-attention':
        setTab('inspections');
        setInspComplianceFilter('failed');
        setActiveFilterLabel('Need Attention');
        break;
    }
  }

  function clearFilter() {
    setPermitStatusFilter('all');
    setInspComplianceFilter('all');
    setActiveFilterLabel(null);
  }

  // Expand/collapse rows
  const [expandedPermit, setExpandedPermit]   = useState<string | null>(null);
  const [expandedInspection, setExpandedInspection] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [permitsRes, inspectionsRes, projectsRes] = await Promise.all([
      supabase.from('permits').select('*').order('created_at', { ascending: false }),
      supabase.from('inspections').select('*').order('scheduled_date', { ascending: true, nullsFirst: false }),
      supabase.from('projects').select('id, project_name, client_name, status, is_archived, is_deleted, permits_applicability'),
    ]);

    // Only include records from active operational projects with permits applicable
    const allProjects = (projectsRes.data || []) as (Project & { is_archived: boolean; is_deleted: boolean; permits_applicability?: string })[];
    const activeProjects = allProjects.filter(p =>
      p.is_deleted !== true && p.is_archived !== true &&
      p.status !== 'Completed' && p.status !== 'Archived' && p.status !== 'Deleted'
    );
    // For Permits & Inspections page: also exclude projects marked Not Applicable
    const permitProjects = activeProjects.filter(p => p.permits_applicability !== 'Not Applicable');
    const activeProjectIds = new Set(permitProjects.map(p => p.id));
    const projectMap = new Map(permitProjects.map(p => [p.id, p]));

    setProjects(activeProjects);
    setPermits(
      (permitsRes.data || [])
        .filter((p: Permit) => activeProjectIds.has(p.project_id))
        .map((p: Permit) => ({ ...p, project: projectMap.get(p.project_id) }))
    );
    setInspections(
      (inspectionsRes.data || [])
        .filter((i: Inspection) => activeProjectIds.has(i.project_id))
        .map((i: Inspection) => ({ ...i, project: projectMap.get(i.project_id) }))
    );
    setLoading(false);
  }

  // Permit CRUD
  const pf = (k: keyof Permit, v: any) => setPermitForm(prev => ({ ...prev, [k]: v }));
  const pc = (k: keyof Permit) => (e: React.ChangeEvent<HTMLInputElement>) => pf(k, e.target.checked);

  async function savePermit() {
    if (!permitForm.permit_type?.trim()) return;
    setSaving(true);
    const alertStatus = calcPermitAlert(permitForm);
    const payload = { ...permitForm, alert_status: alertStatus };
    if (editPermit) {
      await supabase.from('permits').update(payload).eq('id', editPermit.id);
    } else {
      await supabase.from('permits').insert(payload);
    }
    setSaving(false);
    setPermitModal(null);
    load();
  }

  async function togglePermitClientVisible(permit: PermitWithProject) {
    const newVal = !(permit as any).client_visible;
    await supabase.from('permits').update({ client_visible: newVal } as any).eq('id', permit.id);
    load();
    setPermitDetail(prev => prev ? { ...prev, client_visible: newVal } as any : null);
  }

  // Inspection CRUD
  const inf = (k: keyof Inspection, v: any) => setInspForm(prev => ({ ...prev, [k]: v }));
  const inc = (k: keyof Inspection) => (e: React.ChangeEvent<HTMLInputElement>) => inf(k, e.target.checked);

  async function saveInspection() {
    if (inspForm.correction_required && !inspForm.correction_notes?.trim()) {
      alert('Please provide correction notes.');
      return;
    }
    setSaving(true);
    const alertStatus = calcInspectionAlert(inspForm);
    const payload = {
      ...inspForm, alert_status: alertStatus,
      requested_date: (inspForm.requested_date as string) || null,
      scheduled_date: (inspForm.scheduled_date as string) || null,
      result_date:    (inspForm.result_date as string)    || null,
      reinspection_requested_date:  (inspForm.reinspection_requested_date as string) || null,
      reinspection_scheduled_date:  (inspForm.reinspection_scheduled_date as string) || null,
      reinspection_date:            (inspForm.reinspection_date as string) || null,
      passed_date:    (inspForm.passed_date as string)    || null,
    };
    if (editInsp) {
      await supabase.from('inspections').update(payload).eq('id', editInsp.id);
    } else {
      await supabase.from('inspections').insert(payload);
    }
    setSaving(false);
    setInspModal(null);
    load();
  }

  async function toggleInspClientVisible(insp: InspectionWithProject) {
    const newVal = !(insp as any).client_visible;
    await supabase.from('inspections').update({ client_visible: newVal } as any).eq('id', insp.id);
    load();
    setInspDetail(prev => prev ? { ...prev, client_visible: newVal } as any : null);
  }

  /* ── Subcontractor view: only show inspection blockers ── */
  if (isSub(role)) {
    const relevantInspections = inspections.filter(i =>
      ['Scheduled','Requested','Correction Required','Reinspection Required','Failed'].includes(i.result) ||
      i.correction_required || i.reinspection_required
    );

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <RoleBanner role={role} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Inspection Notices</p>
              <p className="text-xs text-slate-400">Items that may affect your assigned tasks</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            </div>
          ) : relevantInspections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No inspection blockers</p>
              <p className="text-xs text-slate-400 mt-1">No upcoming inspections are affecting your tasks.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {relevantInspections.map(i => (
                <div key={i.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <AlertDot status={i.alert_status || 'yellow'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-slate-800">{i.inspection_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inspectionBadge(i.result)}`}>{i.result}</span>
                        {i.project && <span className="text-xs text-slate-400">{i.project.project_name}</span>}
                      </div>
                      {i.scheduled_date && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Client view: only client-visible, soft language ── */
  if (isClient(role)) {
    const visiblePermits     = permits.filter(p => (p as any).client_visible);
    const visibleInspections = inspections.filter(i => (i as any).client_visible);

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Permit & Inspection Updates</p>
              <p className="text-xs text-slate-400">Updates reviewed and approved by your DECKARC coordinator</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            </div>
          ) : visiblePermits.length === 0 && visibleInspections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-5 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No updates shared yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Permit and inspection updates will appear here once reviewed by your DECKARC coordinator.
                DECKARC will share the next confirmed update once available.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visiblePermits.map(p => (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">{p.permit_type || 'Permit Update'}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Permit</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {(p as any).client_message || 'Permit review is currently in progress. DECKARC will share the next confirmed update once available.'}
                  </p>
                  {p.project && <p className="text-xs text-slate-400 mt-1">{p.project.project_name}</p>}
                </div>
              ))}
              {visibleInspections.map(i => (
                <div key={i.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">{i.inspection_type} Inspection</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Inspection</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {(i as any).client_message || 'An inspection-related step is being coordinated by DECKARC. No client action is needed at this time.'}
                  </p>
                  {i.project && <p className="text-xs text-slate-400 mt-1">{i.project.project_name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Admin / GC / Convazant full view ── */
  const pq = permitSearch.trim().toLowerCase();
  const iq = inspSearch.trim().toLowerCase();
  const visiblePermits = permits.filter(p => {
    if (permitStatusFilter === 'pending') {
      if (['Approved','Closed','Not Required'].includes(p.permit_status)) return false;
    } else if (permitStatusFilter === 'issues') {
      if (!['Rejected','Correction Requested','Revision Needed','Expired'].includes(p.permit_status)) return false;
    } else if (permitStatusFilter !== 'all') {
      if (p.permit_status !== permitStatusFilter) return false;
    }
    if (pq && !(p.permit_type || '').toLowerCase().includes(pq) && !(p.project?.project_name || '').toLowerCase().includes(pq) && !(p.permit_number || '').toLowerCase().includes(pq)) return false;
    return true;
  });
  const today = new Date().toISOString().split('T')[0];
  const visibleInspections = inspections.filter(i => {
    if (inspResultFilter !== 'all' && i.result !== inspResultFilter && i.inspection_status !== inspResultFilter) return false;
    if (iq && !i.inspection_type.toLowerCase().includes(iq) && !(i.project?.project_name || '').toLowerCase().includes(iq) && !(i.inspector_name || '').toLowerCase().includes(iq)) return false;
    if (inspComplianceFilter === 'missing-permit') return !(i as any).permit_id;
    if (inspComplianceFilter === 'missing-jurisdiction') return !i.jurisdiction;
    if (inspComplianceFilter === 'needs-attention') return !!(i as any).attention_flag;
    if (inspComplianceFilter === 'correction-required') return !!i.correction_required;
    if (inspComplianceFilter === 'reinspection-required') return !!i.reinspection_required;
    if (inspComplianceFilter === 'upcoming') return !!i.scheduled_date && i.scheduled_date >= today && !['Passed','Reinspection Passed'].includes(i.result);
    if (inspComplianceFilter === 'overdue') return !!i.scheduled_date && i.scheduled_date < today && !['Passed','Reinspection Passed'].includes(i.result);
    if (inspComplianceFilter === 'passed') return i.result === 'Passed' || i.result === 'Reinspection Passed';
    if (inspComplianceFilter === 'failed') return ['Failed','Correction Required'].includes(i.result);
    return true;
  });

  const issuePermits    = permits.filter(p => ['Rejected','Correction Requested','Revision Needed','Expired'].includes(p.permit_status)).length;
  const failedInspections = inspections.filter(i => ['Failed','Correction Required'].includes(i.result)).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <RoleBanner role={role} />

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Permits &amp; Inspections</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards permits={permits} inspections={inspections} role={role} onCardClick={handleCardClick} />

      {/* Filter context banner */}
      {activeFilterLabel && (
        <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs text-amber-700 font-medium flex-1">
            Showing <span className="font-bold">{activeFilterLabel}</span>
            {(initialPermitFilter || initialInspFilter) && activeFilterLabel && ' — from Company Dashboard'}
          </span>
          <button
            onClick={clearFilter}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Show all
          </button>
        </div>
      )}

      {/* Alert banners */}
      {(issuePermits > 0 || failedInspections > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {issuePermits > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-xl">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{issuePermits} permit{issuePermits !== 1 ? 's' : ''} need{issuePermits === 1 ? 's' : ''} attention — review and take action.</span>
            </div>
          )}
          {failedInspections > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-xl">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{failedInspections} inspection{failedInspections > 1 ? 's' : ''} failed or need correction — schedule reinspection.</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs + content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['permits', 'inspections'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 capitalize ${
                  tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'permits'
                  ? `Permits (${visiblePermits.length})`
                  : `Inspections (${visibleInspections.length})`}
              </button>
            ))}
          </div>

          {canWrite(role) && (
            <button
              onClick={() => {
                if (tab === 'permits') {
                  setEditPermit(null);
                  setPermitForm(blankPermit());
                  setPermitModal('add');
                } else {
                  setEditInsp(null);
                  setInspForm(blankInspection());
                  setInspModal('add');
                }
              }}
              className="btn-primary text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add {tab === 'permits' ? 'Permit' : 'Inspection'}
            </button>
          )}
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={tab === 'permits' ? permitSearch : inspSearch}
              onChange={e => tab === 'permits' ? setPermitSearch(e.target.value) : setInspSearch(e.target.value)}
              placeholder={tab === 'permits' ? 'Search permits or projects...' : 'Search inspections or projects...'}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder-slate-400"
            />
          </div>
          {tab === 'permits' ? (
            <select
              value={['all','Approved','pending','issues'].includes(permitStatusFilter) ? permitStatusFilter : 'all'}
              onChange={e => { setPermitStatusFilter(e.target.value); setActiveFilterLabel(null); }}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Permits Pending</option>
              <option value="issues">Permit Issues</option>
              <option value="Approved">Approved</option>
              {PERMIT_STATUSES.filter(s => !['Approved'].includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <>
              <select
                value={inspResultFilter}
                onChange={e => setInspResultFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
              >
                <option value="all">All Results</option>
                {INSPECTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={inspComplianceFilter}
                onChange={e => setInspComplianceFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 text-slate-600"
              >
                <option value="all">All Compliance</option>
                <option value="missing-permit">Missing Permit Link</option>
                <option value="missing-jurisdiction">Missing Jurisdiction</option>
                <option value="needs-attention">Needs Attention</option>
                <option value="correction-required">Correction Required</option>
                <option value="reinspection-required">Reinspection Required</option>
                <option value="upcoming">Upcoming</option>
                <option value="overdue">Overdue</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
              </select>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          </div>
        ) : tab === 'permits' ? (
          visiblePermits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-5">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                <ShieldCheck className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">No permits tracked yet</p>
              {canWrite(role) && <p className="text-xs text-slate-400 mt-1">Click "Add Permit" to get started.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-6"></th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Permit Type</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitted</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expected Approval</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Alert</th>
                    {canApproveClientVisible(role) && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                    )}
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visiblePermits.map(p => (
                    <>
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedPermit(expandedPermit === p.id ? null : p.id)}
                      >
                        <td className="px-5 py-3.5">
                          {expandedPermit === p.id
                            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">{p.permit_type || 'Permit'}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{p.project?.project_name || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${permitBadge(p.permit_status)}`}>{p.permit_status}</span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{fmt(p.submitted_date)}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{fmt(p.expected_approval_date)}</td>
                        <td className="px-5 py-3.5"><AlertDot status={p.alert_status || 'yellow'} /></td>
                        {canApproveClientVisible(role) && (
                          <td className="px-5 py-3.5">
                            {(p as any).client_visible
                              ? <Eye className="w-3.5 h-3.5 text-emerald-500" />
                              : <EyeOff className="w-3.5 h-3.5 text-slate-300" />}
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setPermitDetail(p)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canWrite(role) && (
                              <button
                                onClick={() => { setEditPermit(p); setPermitForm({ ...p }); setPermitModal('edit'); }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedPermit === p.id && (
                        <tr key={p.id + '-expanded'} className="bg-slate-50">
                          <td colSpan={canApproveClientVisible(role) ? 9 : 8} className="px-8 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {[
                                ['Permit Number',     p.permit_number || '—'],
                                ['Jurisdiction',      (p as any).jurisdiction || '—'],
                                ['Actual Approval',   fmt(p.actual_approval_date)],
                                ['Resubmitted',       fmt(p.resubmitted_date)],
                              ].map(([label, value]) => (
                                <div key={label}>
                                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
                                  <p className="font-medium text-slate-700 mt-0.5">{value}</p>
                                </div>
                              ))}
                            </div>
                            {p.notes && (
                              <p className="text-xs text-slate-500 mt-2 leading-relaxed">{p.notes}</p>
                            )}
                            {canSeeInternalNotes(role) && (p as any).internal_notes && (
                              <div className="mt-2 flex items-start gap-1.5">
                                <Lock className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-500 leading-relaxed"><span className="font-semibold">Internal: </span>{(p as any).internal_notes}</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          visibleInspections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-5">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                <ClipboardList className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">No inspections tracked yet</p>
              {canWrite(role) && <p className="text-xs text-slate-400 mt-1">Click "Add Inspection" to get started.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-6"></th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Inspection Type</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Result</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Inspector</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Alert</th>
                    {canApproveClientVisible(role) && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                    )}
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleInspections.map(i => (
                    <>
                      <tr
                        key={i.id}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${i.correction_required ? 'border-l-4 border-l-red-500' : ''}`}
                        onClick={() => setExpandedInspection(expandedInspection === i.id ? null : i.id)}
                      >
                        <td className="px-5 py-3.5">
                          {expandedInspection === i.id
                            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {i.inspection_type}
                            {!(i as any).permit_id && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold border border-amber-200">No Permit</span>
                            )}
                            {(i as any).attention_flag && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold border border-red-200">Attention</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{i.project?.project_name || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${inspectionBadge(i.result)}`}>{i.result}</span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{fmt(i.scheduled_date)}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{i.inspector_name || '—'}</td>
                        <td className="px-5 py-3.5"><AlertDot status={i.alert_status || 'yellow'} /></td>
                        {canApproveClientVisible(role) && (
                          <td className="px-5 py-3.5">
                            {(i as any).client_visible
                              ? <Eye className="w-3.5 h-3.5 text-emerald-500" />
                              : <EyeOff className="w-3.5 h-3.5 text-slate-300" />}
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setInspDetail(i)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canWrite(role) && (
                              <button
                                onClick={() => { setEditInsp(i); setInspForm({ ...i }); setInspModal('edit'); }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedInspection === i.id && (
                        <tr key={i.id + '-expanded'} className="bg-slate-50">
                          <td colSpan={canApproveClientVisible(role) ? 9 : 8} className="px-8 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {[
                                ['Jurisdiction',      i.jurisdiction || '—'],
                                ['Permit Number',     i.permit_number || '—'],
                                ['Responsible Party', i.responsible_party || '—'],
                                ['Result Date',       fmt(i.result_date)],
                                ['Passed Date',       fmt(i.passed_date)],
                                ...(i.reinspection_scheduled_date ? [['Reinspection', fmt(i.reinspection_scheduled_date)]] : []),
                                ...(canSeeInspectorContact(role) && (i as any).inspector_contact ? [['Inspector Contact', (i as any).inspector_contact]] : []),
                              ].map(([label, value]) => (
                                <div key={label}>
                                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
                                  <p className="font-medium text-slate-700 mt-0.5">{value}</p>
                                </div>
                              ))}
                            </div>
                            {i.correction_notes && (
                              <div className="mt-2 text-xs bg-red-50 border border-red-100 rounded-lg p-2">
                                <span className="font-semibold text-red-700">Correction: </span>
                                <span className="text-red-600">{i.correction_notes}</span>
                              </div>
                            )}
                            {i.notes && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{i.notes}</p>}
                            {canSeeInternalNotes(role) && (i as any).schedule_impact && (
                              <div className="mt-2 flex items-start gap-1.5">
                                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-500 leading-relaxed"><span className="font-semibold text-amber-700">Schedule Impact: </span>{(i as any).schedule_impact}</p>
                              </div>
                            )}
                            {canSeeInternalNotes(role) && (i as any).internal_notes && (
                              <div className="mt-2 flex items-start gap-1.5">
                                <Lock className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-500 leading-relaxed"><span className="font-semibold">Internal: </span>{(i as any).internal_notes}</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Permit detail drawer */}
      {permitDetail && (
        <PermitDetailDrawer
          permit={permitDetail}
          role={role}
          onClose={() => setPermitDetail(null)}
          onEdit={() => { setEditPermit(permitDetail); setPermitForm({ ...permitDetail }); setPermitDetail(null); setPermitModal('edit'); }}
          onToggleClientVisible={() => togglePermitClientVisible(permitDetail)}
        />
      )}

      {/* Inspection detail drawer */}
      {inspDetail && (
        <InspectionDetailDrawer
          inspection={inspDetail}
          role={role}
          onClose={() => setInspDetail(null)}
          onEdit={() => { setEditInsp(inspDetail); setInspForm({ ...inspDetail }); setInspDetail(null); setInspModal('edit'); }}
          onToggleClientVisible={() => toggleInspClientVisible(inspDetail)}
        />
      )}

      {/* Permit form modal */}
      {permitModal && (
        <PermitFormModal
          title={permitModal === 'edit' ? 'Edit Permit' : 'Add Permit'}
          form={permitForm}
          projects={projects}
          role={role}
          saving={saving}
          onChange={pf}
          onCheckbox={pc}
          onClose={() => setPermitModal(null)}
          onSave={savePermit}
        />
      )}

      {/* Inspection form modal */}
      {inspModal && (
        <InspectionFormModal
          title={inspModal === 'edit' ? 'Edit Inspection' : 'Add Inspection'}
          form={inspForm}
          projects={projects}
          permits={permits}
          role={role}
          saving={saving}
          onChange={inf}
          onCheckbox={inc}
          onClose={() => setInspModal(null)}
          onSave={saveInspection}
        />
      )}
    </div>
  );
}
