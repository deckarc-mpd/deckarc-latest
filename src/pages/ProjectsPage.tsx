import { useEffect, useState } from 'react';
import { supabase, Project } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertDot } from '../components/StatusBadge';
import Modal from '../components/Modal';
import ArchiveRequestsPanel from '../components/project/ArchiveRequestsPanel';
import {
  Plus, Search, MapPin, Calendar, ChevronRight, Edit2, FolderOpen,
  AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle, Clock,
  Hammer, PauseCircle, X, Archive, Trash2, ArchiveRestore,
  SendHorizonal, Eye,
} from 'lucide-react';

const PROJECT_STATUSES = ['Planning', 'Permit', 'In Progress', 'Delayed', 'Completed', 'On Hold'];
const PROJECT_TYPES = [
  'Single-story room addition', 'Two-story extension', 'Bathroom remodel',
  'Kitchen remodel', 'Deck/Patio', 'New construction', 'Renovation', 'Other',
];
const COUNTIES = [
  'Mecklenburg County', 'Cabarrus County', 'Union County', 'Iredell County',
  'Gaston County', 'York County, SC', 'Other / Manually Entered',
];

type ViewFilter = 'active' | 'archived' | 'deleted';
type SortField = 'project_name' | 'client_name' | 'status' | 'progress_percentage' | 'expected_finish_date' | 'start_date';
type SortDir = 'asc' | 'desc';

type ProjectRow = Project & { is_archived: boolean; is_deleted: boolean };

const PERMITS_APPLICABILITY_OPTIONS = ['To Be Confirmed', 'Applicable', 'Not Applicable'] as const;
type PermitsApplicability = typeof PERMITS_APPLICABILITY_OPTIONS[number];

interface ProjectFormData {
  project_name: string; client_name: string; client_email: string;
  address: string; city: string; state: string; zip: string;
  county: string; county_status: string;
  project_type: string; description: string;
  start_date: string; expected_finish_date: string; projected_finish_date: string;
  status: string; progress_percentage: number;
  internal_notes: string; client_visible_notes: string;
  permits_applicability: PermitsApplicability;
}

const emptyForm: ProjectFormData = {
  project_name: '', client_name: '', client_email: '',
  address: '', city: '', state: 'NC', zip: '',
  county: '', county_status: 'Needs Confirmation',
  project_type: '', description: '',
  start_date: '', expected_finish_date: '', projected_finish_date: '',
  status: 'Planning', progress_percentage: 0,
  internal_notes: '', client_visible_notes: '',
  permits_applicability: 'To Be Confirmed',
};

const statusStyle = (s: string) => {
  if (s === 'Delayed')     return { badge: 'bg-hazard-100 text-hazard-700',     dot: 'bg-hazard-500', bar: 'bg-hazard-400' };
  if (s === 'In Progress') return { badge: 'bg-steel-100 text-steel-700',       dot: 'bg-steel-500',  bar: 'bg-steel-500'  };
  if (s === 'Completed')   return { badge: 'bg-site-100 text-site-700',         dot: 'bg-site-500',   bar: 'bg-site-500'   };
  if (s === 'Planning')    return { badge: 'bg-amber-100 text-amber-700',       dot: 'bg-amber-500',  bar: 'bg-amber-400'  };
  return                          { badge: 'bg-concrete-100 text-concrete-600', dot: 'bg-concrete-400', bar: 'bg-concrete-300' };
};

export default function ProjectsPage({ onViewProject, initialStatusFilter }: { onViewProject: (id: string) => void; initialStatusFilter?: string }) {
  const { profile } = useAuth();

  const [projects, setProjects]         = useState<ProjectRow[]>([]);
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(true);
  const [viewFilter, setViewFilter]     = useState<ViewFilter>('active');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter ?? '');
  const [sortField, setSortField]       = useState<SortField>('project_name');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');

  // Create / edit
  const [showModal, setShowModal]       = useState(false);
  const [editProject, setEditProject]   = useState<Project | null>(null);
  const [form, setForm]                 = useState<ProjectFormData>(emptyForm);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

  // Archive confirm
  const [archiveTarget, setArchiveTarget] = useState<ProjectRow | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving]         = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget]         = useState<ProjectRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason]           = useState('');
  const [deleting, setDeleting]                   = useState(false);

  // GC request archive
  const [requestTarget, setRequestTarget]   = useState<ProjectRow | null>(null);
  const [requestReason, setRequestReason]   = useState('');
  const [requesting, setRequesting]         = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Role flags — carefully scoped
  // isAdmin: can see admin tabs, archive requests panel, and deleted/archived views
  // isDeckarc: ONLY DECKARC_ADMIN can archive/delete/restore projects (RLS enforces this too)
  // isConvazant: platform super-admin — read/audit access inside workspace; cannot mutate DECKARC projects
  const isAdmin      = profile?.role === 'CONVAZANT_SUPER_ADMIN' || profile?.role === 'DECKARC_ADMIN';
  const isDeckarc    = profile?.role === 'DECKARC_ADMIN';
  const isConvazant  = profile?.role === 'CONVAZANT_SUPER_ADMIN';
  const isGC         = profile?.role === 'GENERAL_CONTRACTOR';
  const canEdit      = isDeckarc; // only DECKARC can create/edit/archive/delete projects

  useEffect(() => { loadProjects(); }, [viewFilter]);

  async function loadProjects() {
    setLoading(true);
    let q = supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (viewFilter === 'active')   q = q.eq('is_deleted', false).eq('is_archived', false);
    if (viewFilter === 'archived') q = q.eq('is_deleted', false).eq('is_archived', true);
    if (viewFilter === 'deleted')  q = q.eq('is_deleted', true);
    const { data } = await q;
    setProjects((data || []) as ProjectRow[]);
    setLoading(false);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  // ─── Create / Edit ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditProject(null); setForm(emptyForm); setSaveError(''); setShowModal(true);
  }

  function openEdit(p: ProjectRow, e: React.MouseEvent) {
    e.stopPropagation(); setSaveError(''); setEditProject(p);
    const rawApplicability = (p as any).permits_applicability as string | undefined;
    const permits_applicability: PermitsApplicability =
      rawApplicability === 'Applicable' || rawApplicability === 'Not Applicable'
        ? rawApplicability
        : 'To Be Confirmed';
    setForm({
      project_name: p.project_name, client_name: p.client_name, client_email: p.client_email || '',
      address: p.address || '', city: p.city || '', state: p.state || 'NC', zip: p.zip || '',
      county: (p as any).county || '', county_status: (p as any).county_status || 'Needs Confirmation',
      project_type: p.project_type || '', description: p.description || '',
      start_date: p.start_date || '', expected_finish_date: p.expected_finish_date || '',
      projected_finish_date: p.projected_finish_date || '',
      status: p.status, progress_percentage: p.progress_percentage,
      internal_notes: p.internal_notes || '', client_visible_notes: p.client_visible_notes || '',
      permits_applicability,
    });
    setShowModal(true);
  }

  async function saveProject() {
    if (!form.project_name.trim() || !form.client_name.trim()) return;
    setSaving(true); setSaveError('');
    const payload = {
      ...form,
      organization_id: profile?.organization_id ?? null,
      start_date: form.start_date || null,
      expected_finish_date: form.expected_finish_date || null,
      projected_finish_date: form.projected_finish_date || null,
      county: form.county || null,
    };
    if (editProject) {
      const { error } = await supabase.from('projects').update(payload).eq('id', editProject.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    } else {
      const { data: newProject, error } = await supabase
        .from('projects').insert(payload).select('id').maybeSingle();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (newProject?.id && profile?.id) {
        await supabase.from('project_users').insert({
          project_id: newProject.id, user_id: profile.id, role_on_project: profile.role,
        });
      }
    }
    setSaving(false); setShowModal(false); loadProjects();
  }

  // ─── Archive ───────────────────────────────────────────────────────────────
  function openArchive(p: ProjectRow, e: React.MouseEvent) {
    e.stopPropagation(); setArchiveTarget(p); setArchiveReason('');
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    const nowArchived = !archiveTarget.is_archived;
    const { error } = await supabase.from('projects').update({
      is_archived: nowArchived,
      archived_at: nowArchived ? new Date().toISOString() : null,
      archived_by_user_id: nowArchived ? profile?.id : null,
      archive_reason: nowArchived ? (archiveReason || null) : null,
    }).eq('id', archiveTarget.id);

    if (!error && profile?.id) {
      await supabase.from('activity_log').insert({
        project_id: archiveTarget.id,
        user_id: profile.id,
        user_full_name: profile.full_name,
        user_role: profile.role,
        action_type: nowArchived ? 'project_archived' : 'project_unarchived',
        module: 'Projects',
        related_record_id: archiveTarget.id,
        related_record_type: 'project',
        notes: archiveReason || '',
      });
      if (nowArchived) {
        const { data: members } = await supabase
          .from('project_users').select('user_id')
          .eq('project_id', archiveTarget.id).eq('role_on_project', 'GENERAL_CONTRACTOR');
        for (const m of (members || [])) {
          await supabase.from('notifications').insert({
            project_id: archiveTarget.id, user_id: m.user_id,
            notification_type: 'project_archived',
            title: `Project Archived: ${archiveTarget.project_name}`,
            message: `"${archiveTarget.project_name}" has been archived.${archiveReason ? ' Reason: ' + archiveReason : ''}`,
            status: 'unread',
          });
        }
      }
    }
    setArchiving(false); setArchiveTarget(null); loadProjects();
  }

  // ─── Delete ───────────────────────────────────────────────────────────────
  function openDelete(p: ProjectRow, e: React.MouseEvent) {
    e.stopPropagation(); setDeleteTarget(p); setDeleteConfirmText(''); setDeleteReason('');
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    const { error } = await supabase.from('projects').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: profile?.id,
      delete_reason: deleteReason || null,
    }).eq('id', deleteTarget.id);
    if (!error && profile?.id) {
      await supabase.from('activity_log').insert({
        project_id: deleteTarget.id, user_id: profile.id,
        user_full_name: profile.full_name, user_role: profile.role,
        action_type: 'project_soft_deleted', module: 'Projects',
        related_record_id: deleteTarget.id, related_record_type: 'project',
        notes: deleteReason || '',
      });
    }
    setDeleting(false); setDeleteTarget(null); loadProjects();
  }

  // Restore deleted — CONVAZANT Super Admin only. Removes soft-delete flag; does not change archived state.
  async function restoreDeleted(p: ProjectRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (profile?.role !== 'CONVAZANT_SUPER_ADMIN') return;
    const { error } = await supabase.from('projects').update({
      is_deleted: false, deleted_at: null, deleted_by_user_id: null, delete_reason: null,
    }).eq('id', p.id);
    if (!error && profile?.id) {
      await supabase.from('activity_log').insert({
        project_id: p.id, user_id: profile.id, user_full_name: profile.full_name,
        user_role: profile.role, action_type: 'project_restore_from_deleted',
        module: 'Projects', related_record_id: p.id, related_record_type: 'project',
        notes: 'Restored from deleted state by CONVAZANT Super Admin',
      });
    }
    loadProjects();
  }

  // ─── GC Archive Request ───────────────────────────────────────────────────
  function openRequestArchive(p: ProjectRow, e: React.MouseEvent) {
    e.stopPropagation(); setRequestTarget(p); setRequestReason(''); setRequestSuccess(false);
  }

  async function submitArchiveRequest() {
    if (!requestTarget || !profile?.id) return;
    setRequesting(true);
    const { error } = await supabase.from('archive_requests').insert({
      project_id: requestTarget.id,
      project_name: requestTarget.project_name,
      requester_name: profile.full_name,
      requested_by_user_id: profile.id,
      requested_by_role: profile.role,
      reason: requestReason,
      status: 'pending',
    });
    if (!error) {
      await supabase.from('activity_log').insert({
        project_id: requestTarget.id, user_id: profile.id,
        user_full_name: profile.full_name, user_role: profile.role,
        action_type: 'archive_request_submitted', module: 'Projects',
        related_record_id: requestTarget.id, related_record_type: 'project',
        notes: requestReason,
      });
      const { data: admins } = await supabase.from('user_profiles').select('id').eq('role', 'DECKARC_ADMIN');
      for (const a of (admins || [])) {
        await supabase.from('notifications').insert({
          project_id: requestTarget.id, user_id: a.id,
          notification_type: 'archive_request',
          title: `Archive Request: ${requestTarget.project_name}`,
          message: `${profile.full_name} (GC) requested to archive "${requestTarget.project_name}".${requestReason ? ' Reason: ' + requestReason : ''}`,
          status: 'unread',
        });
      }
      setRequestSuccess(true);
    }
    setRequesting(false);
  }

  // ─── Filtering / sorting ──────────────────────────────────────────────────
  const filtered = projects
    .filter(p =>
      (p.project_name.toLowerCase().includes(search.toLowerCase()) ||
       p.client_name.toLowerCase().includes(search.toLowerCase()) ||
       p.city?.toLowerCase().includes(search.toLowerCase()) ||
       p.project_type?.toLowerCase().includes(search.toLowerCase())) &&
      (statusFilter === '' || p.status === statusFilter)
    )
    .sort((a, b) => {
      let av: string | number = (a as any)[sortField] ?? '';
      let bv: string | number = (b as any)[sortField] ?? '';
      if (sortField === 'progress_percentage') { av = Number(av); bv = Number(bv); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-steel-500/20 focus:border-steel-500 transition-colors';
  const labelCls = 'block text-sm font-medium text-slate-600 mb-1.5';

  const statusCards = [
    { label: 'In Progress', icon: Hammer,       cls: 'bg-steel-50 border-steel-200',     iconBg: 'bg-steel-100',  iconColor: 'text-steel-600',   val: 'text-steel-700'   },
    { label: 'Delayed',     icon: AlertTriangle, cls: 'bg-red-50 border-red-200',         iconBg: 'bg-red-50',     iconColor: 'text-red-500',     val: 'text-red-700'     },
    { label: 'Planning',    icon: Clock,         cls: 'bg-amber-50 border-amber-200',     iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',   val: 'text-amber-700'   },
    { label: 'Permit',      icon: FolderOpen,    cls: 'bg-blue-50 border-blue-200',       iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    val: 'text-blue-700'    },
    { label: 'Completed',   icon: CheckCircle,   cls: 'bg-emerald-50 border-emerald-200', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', val: 'text-emerald-700' },
    { label: 'On Hold',     icon: PauseCircle,   cls: 'bg-slate-100 border-slate-200',    iconBg: 'bg-slate-100',  iconColor: 'text-slate-500',   val: 'text-slate-600'   },
  ];

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300 flex-shrink-0" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-steel-500 flex-shrink-0" />
      : <ArrowDown className="w-3 h-3 text-steel-500 flex-shrink-0" />;
  }

  function fmtDate(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const viewTabCls = (v: ViewFilter) =>
    `px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
      viewFilter === v ? 'bg-steel-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
    }`;

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-400 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
        </div>
        {isConvazant && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-500">
            <Eye className="w-3.5 h-3.5" /> View Only
          </span>
        )}
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> New Project
          </button>
        )}
      </div>

      {/* Admin view tabs */}
      {isAdmin && (
        <div className="flex items-center gap-1 mb-5 bg-slate-50 border border-slate-200 rounded-xl p-1 w-fit">
          <button className={viewTabCls('active')}   onClick={() => setViewFilter('active')}>Active Projects</button>
          <button className={viewTabCls('archived')} onClick={() => setViewFilter('archived')}>
            <span className="inline-flex items-center gap-1"><Archive className="w-3 h-3" />Archived</span>
          </button>
          <button className={viewTabCls('deleted')}  onClick={() => setViewFilter('deleted')}>
            <span className="inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Deleted</span>
          </button>
        </div>
      )}

      {/* Archive requests panel — DECKARC_ADMIN only (CONVAZANT is view-only) */}
      {isDeckarc && viewFilter === 'active' && (
        <ArchiveRequestsPanel onProjectArchived={loadProjects} />
      )}

      {/* CONVAZANT view-only notice inside workspace */}
      {isConvazant && viewFilter === 'active' && (
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-slate-600">
          <Eye className="w-4 h-4 flex-shrink-0 text-slate-400" />
          You are viewing this workspace in audit/support mode. Archive and delete controls are restricted to workspace admins.
        </div>
      )}

      {/* Contextual banners */}
      {viewFilter === 'archived' && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-amber-700">
          <Archive className="w-4 h-4 flex-shrink-0" />
          Archived projects are hidden from active views. All data is preserved. Admins can unarchive at any time.
        </div>
      )}
      {viewFilter === 'deleted' && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-red-700">
          <Trash2 className="w-4 h-4 flex-shrink-0" />
          Deleted projects are hidden from all non-admin views. All records are preserved for audit.
        </div>
      )}

      {/* Status cards (active view only) */}
      {viewFilter === 'active' && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
          {statusCards.map(({ label, icon: Icon, cls, iconBg, iconColor, val }) => {
            const count = projects.filter(p => p.status === label).length;
            const active = statusFilter === label;
            return (
              <button
                key={label}
                onClick={() => setStatusFilter(active ? '' : label)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${cls} ${active ? 'ring-2 ring-offset-1 ring-steel-400 shadow-md' : ''}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${iconBg}`}>
                  <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                </div>
                <p className={`text-xl font-bold leading-none ${val}`}>{count}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{label}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, client, city, or type..."
            className="w-full pl-10 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-steel-500/20 focus:border-steel-500 transition-colors text-slate-900 placeholder-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-400 whitespace-nowrap hidden sm:inline">Sort by</span>
          <select
            value={sortField} onChange={e => { setSortField(e.target.value as SortField); setSortDir('asc'); }}
            className="border border-slate-200 rounded-lg px-2.5 py-2.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-steel-500/20 focus:border-steel-500 transition-colors"
          >
            <option value="project_name">Name</option>
            <option value="client_name">Client</option>
            <option value="status">Status</option>
            <option value="progress_percentage">Progress</option>
            <option value="start_date">Start Date</option>
            <option value="expected_finish_date">Est. Finish</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="border border-slate-200 rounded-lg p-2.5 bg-white hover:bg-slate-50 transition-colors"
          >
            {sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-slate-500" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-500" />}
          </button>
          {(search || statusFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); }}
              className="text-xs text-slate-400 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-2.5 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {(search || statusFilter) && !loading && (
        <p className="text-xs text-slate-400 mb-3">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {statusFilter ? <span className="ml-1 font-medium text-steel-600">· {statusFilter}</span> : null}
          {search ? <span className="ml-1">· "{search}"</span> : null}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm">Loading projects...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
            {viewFilter === 'archived' ? <Archive className="w-7 h-7 text-slate-300" />
            : viewFilter === 'deleted' ? <Trash2 className="w-7 h-7 text-slate-300" />
            : <FolderOpen className="w-7 h-7 text-slate-300" />}
          </div>
          <p className="text-base font-semibold text-slate-600">
            {viewFilter === 'archived' ? 'No archived projects' :
             viewFilter === 'deleted'  ? 'No deleted projects' :
             (search || statusFilter)  ? 'No projects match your filters' : 'No projects yet'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {viewFilter === 'active' && !search && !statusFilter ? 'Create your first project to get started.' : ''}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {([
                    { label: 'Project',      field: 'project_name'         as SortField, px: 'px-5', show: '' },
                    { label: 'Client',       field: 'client_name'          as SortField, px: 'px-4', show: 'hidden sm:table-cell' },
                    { label: 'Status',       field: 'status'               as SortField, px: 'px-4', show: '' },
                    { label: 'Progress',     field: 'progress_percentage'  as SortField, px: 'px-4', show: 'hidden lg:table-cell' },
                    { label: 'Est. Finish',  field: 'expected_finish_date' as SortField, px: 'px-4', show: 'hidden xl:table-cell' },
                  ] as const).map(({ label, field, px, show }) => (
                    <th key={field} className={`text-left ${px} py-3 ${show}`}>
                      <button
                        onClick={() => toggleSort(field)}
                        className="flex items-center gap-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-slate-700 transition-colors whitespace-nowrap"
                      >
                        {label}<SortIcon field={field} />
                      </button>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 hidden md:table-cell">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Location</span>
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Alert</span>
                  </th>
                  <th className="px-4 py-3 w-auto" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => {
                  const s      = statusStyle(p.status);
                  const county = (p as any).county as string | undefined;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => !p.is_deleted && onViewProject(p.id)}
                      className={`hover:bg-slate-50/60 transition-colors group ${p.is_deleted ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                    >
                      {/* Project name + badges */}
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div>
                            <p className="text-sm text-slate-900 leading-snug group-hover:text-steel-700 transition-colors">{p.project_name}</p>
                            {p.project_type && <p className="text-[11px] text-slate-400 mt-0.5">{p.project_type}</p>}
                          </div>
                          {p.is_archived && !p.is_deleted && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700 flex-shrink-0">
                              <Archive className="w-2.5 h-2.5" />Archived
                            </span>
                          )}
                          {p.is_deleted && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200 text-[10px] font-semibold text-red-700 flex-shrink-0">
                              <Trash2 className="w-2.5 h-2.5" />Deleted
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Client */}
                      <td className="px-4 py-3.5 align-middle hidden sm:table-cell">
                        <p className="text-sm text-slate-700">{p.client_name}</p>
                        {p.client_email && <p className="text-[11px] text-slate-400 mt-0.5">{p.client_email}</p>}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5 align-middle">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />{p.status}
                        </span>
                      </td>
                      {/* Progress */}
                      <td className="px-4 py-3.5 align-middle hidden lg:table-cell" style={{ minWidth: 150 }}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${p.progress_percentage}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8 text-right tabular-nums">{p.progress_percentage}%</span>
                        </div>
                      </td>
                      {/* Est. finish */}
                      <td className="px-4 py-3.5 align-middle hidden xl:table-cell">
                        {p.projected_finish_date && p.projected_finish_date !== p.expected_finish_date ? (
                          <div>
                            <span className="text-[11px] line-through text-slate-300 block">{fmtDate(p.expected_finish_date)}</span>
                            <span className="text-xs text-amber-600 font-semibold">{fmtDate(p.projected_finish_date)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {p.expected_finish_date && <Calendar className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                            <span className="text-xs text-slate-500">{fmtDate(p.expected_finish_date)}</span>
                          </div>
                        )}
                      </td>
                      {/* Location */}
                      <td className="px-4 py-3.5 align-middle hidden md:table-cell">
                        {(p.city || county) ? (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-300" />
                            <span className="text-xs text-slate-500 leading-snug">
                              {p.city ? `${p.city}${p.state ? `, ${p.state}` : ''}` : ''}
                              {county ? <><br /><span className="text-slate-400">{county}</span></> : null}
                            </span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      {/* Alert */}
                      <td className="px-4 py-3.5 align-middle">
                        <AlertDot status={p.alert_status || 'green'} />
                      </td>
                      {/* Row actions */}
                      <td className="px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">

                          {/* DECKARC_ADMIN: edit / archive / delete (not CONVAZANT — different org) */}
                          {isDeckarc && !p.is_deleted && (
                            <>
                              <button onClick={e => openEdit(p, e)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                title="Edit project">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={e => openArchive(p, e)}
                                className={`p-1.5 rounded-lg transition-colors ${p.is_archived ? 'hover:bg-amber-50 text-amber-400 hover:text-amber-600' : 'hover:bg-amber-50 text-slate-400 hover:text-amber-600'}`}
                                title={p.is_archived ? 'Unarchive project' : 'Archive project'}>
                                {p.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={e => openDelete(p, e)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                title="Delete project">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* CONVAZANT Super Admin only: restore from soft-deleted */}
                          {isConvazant && p.is_deleted && (
                            <button onClick={e => restoreDeleted(p, e)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Restore deleted project (CONVAZANT Super Admin only)">
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* CONVAZANT: view-only indicator, no mutate controls */}
                          {isConvazant && !p.is_deleted && (
                            <span className="p-1.5 text-slate-300" title="View only — archive/delete restricted to workspace admin">
                              <Eye className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {/* GC: request archive */}
                          {isGC && !p.is_archived && !p.is_deleted && (
                            <button onClick={e => openRequestArchive(p, e)}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                              title="Request archive">
                              <SendHorizonal className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!p.is_deleted && <ChevronRight className="w-4 h-4 text-steel-400" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing <span className="font-semibold text-slate-600">{filtered.length}</span> of{' '}
              <span className="font-semibold text-slate-600">{projects.length}</span> project{projects.length !== 1 ? 's' : ''}
              {viewFilter !== 'active' && <span className="ml-1 text-slate-500">· {viewFilter === 'archived' ? 'Archived' : 'Deleted'}</span>}
            </p>
            {(search || statusFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); }} className="text-xs text-steel-600 hover:text-steel-800 font-medium transition-colors">
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Create / Edit Modal ─────────────────────────────────────────── */}
      {showModal && (
        <Modal title={editProject ? 'Edit Project' : 'New Project'} onClose={() => setShowModal(false)} size="xl">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Project Name *</label>
                <input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Client Name *</label>
                <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Client Email</label>
                <input type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>State</label>
                  <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>County</label>
                <select value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value, county_status: 'Manually Confirmed' }))} className={inputCls}>
                  <option value="">Select county...</option>
                  {COUNTIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>County Status</label>
                <select value={form.county_status} onChange={e => setForm(f => ({ ...f, county_status: e.target.value }))} className={inputCls}>
                  {['Needs Confirmation', 'Auto Detected', 'Manually Confirmed', 'Manually Overridden'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Project Type</label>
                <select value={form.project_type} onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))} className={inputCls}>
                  <option value="">Select type</option>
                  {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                  {PROJECT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Expected Finish</label>
                <input type="date" value={form.expected_finish_date} onChange={e => setForm(f => ({ ...f, expected_finish_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Projected Finish</label>
                <input type="date" value={form.projected_finish_date} onChange={e => setForm(f => ({ ...f, projected_finish_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Progress %</label>
                <input type="number" min="0" max="100" value={form.progress_percentage}
                  onChange={e => setForm(f => ({ ...f, progress_percentage: parseInt(e.target.value) || 0 }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Permits &amp; Inspections</label>
                <select
                  value={form.permits_applicability}
                  onChange={e => setForm(f => ({ ...f, permits_applicability: e.target.value as PermitsApplicability }))}
                  className={inputCls}
                >
                  {PERMITS_APPLICABILITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                {form.permits_applicability === 'Not Applicable' && (
                  <p className="text-[11px] text-amber-600 mt-1">Permit issues and inspection tasks will be excluded from live operations counts for this project.</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Internal Notes</label>
                <textarea rows={2} value={form.internal_notes} onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Client-Visible Notes</label>
                <textarea rows={2} value={form.client_visible_notes} onChange={e => setForm(f => ({ ...f, client_visible_notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
            </div>
            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{saveError}</div>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={saveProject} disabled={saving || !form.project_name || !form.client_name} className="btn-primary">
                {saving ? 'Saving...' : editProject ? 'Update Project' : 'Create Project'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Archive Confirm Modal ───────────────────────────────────────── */}
      {archiveTarget && (
        <Modal
          title={archiveTarget.is_archived ? 'Unarchive Project?' : 'Archive Project?'}
          onClose={() => setArchiveTarget(null)}
          size="sm"
        >
          <div className="space-y-4">
            {archiveTarget.is_archived ? (
              <p className="text-sm text-slate-600">
                This will restore <span className="font-semibold text-slate-900">{archiveTarget.project_name}</span> to the active projects view.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  This will move <span className="font-semibold text-slate-900">{archiveTarget.project_name}</span> out of active views. All project data, files, tasks, messages, and records will be preserved.
                </p>
                <div>
                  <label className={labelCls}>Reason (optional)</label>
                  <input
                    value={archiveReason}
                    onChange={e => setArchiveReason(e.target.value)}
                    placeholder="e.g. Project completed, client on hold..."
                    className={inputCls}
                  />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setArchiveTarget(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={confirmArchive}
                disabled={archiving}
                className={archiveTarget.is_archived
                  ? 'btn-primary'
                  : 'px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60'}
              >
                {archiving ? 'Processing...' : archiveTarget.is_archived ? 'Unarchive Project' : 'Archive Project'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Delete Confirm Modal ────────────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="Delete Project?" onClose={() => setDeleteTarget(null)} size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                This will remove <span className="font-semibold">{deleteTarget.project_name}</span> from active project views. Project records, files, tasks, messages, and history will be preserved for audit and future reference.
              </p>
            </div>
            <div>
              <label className={labelCls}>Reason (optional)</label>
              <input
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate entry, created by mistake..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Type DELETE to confirm</label>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className={`${inputCls} font-mono tracking-widest ${deleteConfirmText && deleteConfirmText !== 'DELETE' ? 'border-red-300 focus:border-red-400' : ''}`}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setDeleteTarget(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── GC Request Archive Modal ─────────────────────────────────────── */}
      {requestTarget && (
        <Modal title="Request Archive" onClose={() => setRequestTarget(null)} size="sm">
          {requestSuccess ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700">
                  Archive request submitted for <span className="font-semibold">{requestTarget.project_name}</span>. An admin will review and respond shortly.
                </p>
              </div>
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button onClick={() => setRequestTarget(null)} className="btn-primary">Done</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Submit a request to archive <span className="font-semibold text-slate-900">{requestTarget.project_name}</span>. An admin will review and approve or deny the request.
              </p>
              <div>
                <label className={labelCls}>Reason *</label>
                <textarea
                  rows={3}
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="Explain why this project should be archived..."
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setRequestTarget(null)} className="btn-ghost">Cancel</button>
                <button
                  onClick={submitArchiveRequest}
                  disabled={requesting || !requestReason.trim()}
                  className="btn-primary"
                >
                  {requesting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
