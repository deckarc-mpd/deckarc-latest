import { useEffect, useState } from 'react';
import { supabase, Project } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertDot } from '../components/StatusBadge';
import TasksTab from '../components/project/TasksTab';
import PermitsTab from '../components/project/PermitsTab';
import InspectionsTab from '../components/project/InspectionsTab';
import InspectionChecklistTab from '../components/project/InspectionChecklistTab';
import ClientDecisionsTab from '../components/project/ClientDecisionsTab';
import ChangeOrdersTab from '../components/project/ChangeOrdersTab';
import PaymentsTab from '../components/project/PaymentsTab';
import DailyUpdatesTab from '../components/project/DailyUpdatesTab';
import AiSummaryTab from '../components/project/AiSummaryTab';
import WeatherRisksTab from '../components/project/WeatherRisksTab';
import MaterialsTab from '../components/project/MaterialsTab';
import IncidentsTab from '../components/project/IncidentsTab';
import RFIsTab from '../components/project/RFIsTab';
import CrewConfirmationsTab from '../components/project/CrewConfirmationsTab';
import PhotoLogTab from '../components/project/PhotoLogTab';
import PunchListTab from '../components/project/PunchListTab';
import PhaseReadinessTab from '../components/project/PhaseReadinessTab';
import ScheduleChangeLogTab from '../components/project/ScheduleChangeLogTab';
import ActivityLogTab from '../components/project/ActivityLogTab';
import CloseoutTab from '../components/project/CloseoutTab';
import CommunicationHubTab from '../components/project/CommunicationHubTab';
import DelayReasonsTab from '../components/project/DelayReasonsTab';
import ScheduleUpdatesSection from '../components/project/ScheduleUpdatesSection';
import TeamMembersTab from '../components/project/TeamMembersTab';
import {
  ArrowLeft, MapPin, Calendar, Building2, RefreshCw, Eye, X,
  LayoutGrid, CheckSquare, ClipboardList, ShieldCheck, Cloud,
  Boxes, Users, Image, Folder, Activity, MessageSquare,
  DollarSign, FileText, Wrench, Zap, BookOpen, ChevronDown,
  Menu as MenuIcon, AlignLeft, CheckCircle, Clock, UserPlus,
} from 'lucide-react';
import { cascadeDelayFromTask } from '../lib/scheduleEngine';
import { useClientPreview } from '../contexts/ClientPreviewContext';
import Modal from '../components/Modal';

// ── Types shared with the "Add Another Project" mini-flow ──────────────────────

const PROJECT_STATUSES_ADD = ['Planning', 'Permit', 'In Progress', 'Delayed', 'Completed', 'On Hold'];
const PROJECT_TYPES_ADD = [
  'Single-story room addition', 'Two-story extension', 'Bathroom remodel',
  'Kitchen remodel', 'Deck/Patio', 'New construction', 'Renovation', 'Other',
];
const COUNTIES_ADD = [
  'Mecklenburg County', 'Cabarrus County', 'Union County', 'Iredell County',
  'Gaston County', 'York County, SC', 'Other / Manually Entered',
];
const PERMITS_OPTS_ADD = ['To Be Confirmed', 'Applicable', 'Not Applicable'] as const;
type PermitsApplicabilityAdd = typeof PERMITS_OPTS_ADD[number];

interface AddProjectFormData {
  // New project identity
  project_name: string;
  status: string;
  progress_percentage: number;
  start_date: string;
  expected_finish_date: string;
  // Client identity — prefilled, editable
  client_name: string;
  client_email: string;
  // Property / address — prefilled from source project, all editable
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  county_status: string;
  jurisdiction: string;
  permit_authority: string;
  project_type: string;
  permits_applicability: PermitsApplicabilityAdd;
  // Notes — prefilled, editable
  description: string;
  internal_notes: string;
  client_visible_notes: string;
}

// ── Add Another Project Modal ──────────────────────────────────────────────────

interface AddAnotherProjectModalProps {
  sourceProject: Project;
  adminProfileId: string;
  adminOrgId: string | null;
  adminRole: string;
  onClose: () => void;
  onCreated: (newProjectId: string) => void;
}

function AddAnotherProjectModal({
  sourceProject, adminProfileId, adminOrgId, adminRole, onClose, onCreated,
}: AddAnotherProjectModalProps) {
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-steel-500/20 focus:border-steel-500 transition-colors';
  const labelCls = 'block text-sm font-medium text-slate-600 mb-1.5';

  // Prefill all available property/location fields from the source project.
  // All fields remain editable — admin may keep, change, or clear any value.
  const rawApplicability = (sourceProject as any).permits_applicability as string | undefined;
  const sourceApplicability: PermitsApplicabilityAdd =
    rawApplicability === 'Applicable' || rawApplicability === 'Not Applicable'
      ? rawApplicability
      : 'To Be Confirmed';

  const [form, setForm] = useState<AddProjectFormData>({
    project_name: '',
    status: 'Planning',
    progress_percentage: 0,
    start_date: '',
    expected_finish_date: '',
    // Client — prefilled from source
    client_name: sourceProject.client_name || '',
    client_email: (sourceProject.client_email || '').trim().toLowerCase(),
    // Property / address — prefilled from source, all editable
    address: sourceProject.address || '',
    city: sourceProject.city || '',
    state: sourceProject.state || 'NC',
    zip: (sourceProject as any).zip || '',
    county: (sourceProject as any).county || '',
    county_status: (sourceProject as any).county_status || 'Needs Confirmation',
    jurisdiction: sourceProject.jurisdiction || '',
    permit_authority: sourceProject.permit_authority || '',
    project_type: sourceProject.project_type || '',
    permits_applicability: sourceApplicability,
    // Notes — prefilled from source (admin will usually clear/replace)
    description: sourceProject.description || '',
    internal_notes: '',
    client_visible_notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [clientNotFound, setClientNotFound] = useState(false);

  async function handleSave() {
    if (!form.project_name.trim() || !form.client_name.trim()) return;
    setSaving(true);
    setSaveError('');
    setClientNotFound(false);

    // Normalize email — form state is already normalized on init; re-normalize on save
    const normalizedEmail = form.client_email.trim().toLowerCase();

    const payload = {
      project_name: form.project_name.trim(),
      client_name: form.client_name.trim(),
      client_email: normalizedEmail,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      county: form.county || null,
      county_status: form.county_status,
      jurisdiction: form.jurisdiction.trim() || null,
      permit_authority: form.permit_authority.trim() || null,
      project_type: form.project_type || null,
      description: form.description.trim() || null,
      start_date: form.start_date || null,
      expected_finish_date: form.expected_finish_date || null,
      projected_finish_date: null,
      status: form.status,
      progress_percentage: form.progress_percentage,
      internal_notes: form.internal_notes.trim() || null,
      client_visible_notes: form.client_visible_notes.trim() || null,
      permits_applicability: form.permits_applicability,
      organization_id: adminOrgId,
    };

    console.log('[AddAnotherProject] creating project', {
      source_project_id: sourceProject.id,
      normalized_client_email: normalizedEmail,
      property_address_fields: {
        address: payload.address,
        city: payload.city,
        state: payload.state,
        zip: payload.zip,
        county: payload.county,
        jurisdiction: payload.jurisdiction,
        permit_authority: payload.permit_authority,
        project_type: payload.project_type,
        permits_applicability: payload.permits_applicability,
      },
    });

    const { data: newProject, error } = await supabase
      .from('projects')
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error || !newProject?.id) {
      setSaveError(error?.message || 'Failed to create project.');
      setSaving(false);
      return;
    }

    console.log('[AddAnotherProject] new project id:', newProject.id);

    // Add admin as project_user
    await supabase.from('project_users').insert({
      project_id: newProject.id,
      user_id: adminProfileId,
      role_on_project: adminRole,
    });

    // Look up existing CLIENT user by normalized email and link without duplicating
    if (normalizedEmail) {
      const { data: clientProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('role', 'CLIENT')
        .maybeSingle();

      if (clientProfile?.id) {
        console.log('[AddAnotherProject] matched client user id:', clientProfile.id);
        // Use upsert-style insert so we never create a duplicate row
        const { error: puError } = await supabase.from('project_users').insert({
          project_id: newProject.id,
          user_id: clientProfile.id,
          role_on_project: 'CLIENT',
        });
        if (puError) {
          // UNIQUE constraint violation means the row already existed — safe to ignore
          if (!puError.message.includes('duplicate') && !puError.code?.startsWith('23')) {
            console.warn('[AddAnotherProject] project_users insert warning:', puError.message);
          } else {
            console.log('[AddAnotherProject] project_users row already existed — no duplicate created');
          }
        } else {
          console.log('[AddAnotherProject] project_users link created for client:', clientProfile.id);
        }
      } else {
        console.log('[AddAnotherProject] no CLIENT user_profile found for email:', normalizedEmail);
        setClientNotFound(true);
        setSaving(false);
        // Project was created successfully; show notice and let admin dismiss
        onCreated(newProject.id);
        return;
      }
    }

    setSaving(false);
    onCreated(newProject.id);
  }

  return (
    <Modal title="Add Another Project for This Client" onClose={onClose} size="xl">
      <div className="space-y-4">

        {/* Prefill notice */}
        <div className="bg-steel-50 border border-steel-200 rounded-lg px-4 py-3">
          <p className="text-xs text-steel-700">
            Client and property details are pre-filled from the existing project. All fields are editable —
            keep the same property or update for the new project location.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* ── New project identity ─────────────────────────────────── */}
          <div className="sm:col-span-2">
            <label className={labelCls}>Project Name *</label>
            <input
              value={form.project_name}
              onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
              placeholder="e.g. Bathroom Remodel, ADU Construction..."
              className={inputCls}
              autoFocus
            />
          </div>

          {/* ── Client identity — prefilled, editable ───────────────── */}
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Client</p>
          </div>
          <div>
            <label className={labelCls}>Client Name *</label>
            <input
              value={form.client_name}
              onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Client Email</label>
            <input
              type="email"
              value={form.client_email}
              onChange={e => setForm(f => ({ ...f, client_email: e.target.value.trim().toLowerCase() }))}
              className={inputCls}
            />
          </div>

          {/* ── Property / address — prefilled, all editable ────────── */}
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-1">Property &amp; Location</p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Street Address</label>
            <input
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Street address..."
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>City</label>
            <input
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>State</label>
              <input
                value={form.state}
                onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input
                value={form.zip}
                onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>County</label>
            <select
              value={form.county}
              onChange={e => setForm(f => ({ ...f, county: e.target.value, county_status: 'Manually Confirmed' }))}
              className={inputCls}
            >
              <option value="">Select county...</option>
              {COUNTIES_ADD.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Jurisdiction</label>
            <input
              value={form.jurisdiction}
              onChange={e => setForm(f => ({ ...f, jurisdiction: e.target.value }))}
              placeholder="e.g. City of Charlotte"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Permit Authority</label>
            <input
              value={form.permit_authority}
              onChange={e => setForm(f => ({ ...f, permit_authority: e.target.value }))}
              placeholder="e.g. Mecklenburg County Permits"
              className={inputCls}
            />
          </div>

          {/* ── Project setup ────────────────────────────────────────── */}
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-1">Project Setup</p>
          </div>

          <div>
            <label className={labelCls}>Project Type</label>
            <select
              value={form.project_type}
              onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))}
              className={inputCls}
            >
              <option value="">Select type</option>
              {PROJECT_TYPES_ADD.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className={inputCls}
            >
              {PROJECT_STATUSES_ADD.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Expected Finish</label>
            <input
              type="date"
              value={form.expected_finish_date}
              onChange={e => setForm(f => ({ ...f, expected_finish_date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Permits &amp; Inspections</label>
            <select
              value={form.permits_applicability}
              onChange={e => setForm(f => ({ ...f, permits_applicability: e.target.value as PermitsApplicabilityAdd }))}
              className={inputCls}
            >
              {PERMITS_OPTS_ADD.map(o => <option key={o}>{o}</option>)}
            </select>
            {form.permits_applicability === 'Not Applicable' && (
              <p className="text-[11px] text-amber-600 mt-1">
                Permit issues and inspection tasks will be excluded from live operations counts for this project.
              </p>
            )}
          </div>

          {/* ── Notes ────────────────────────────────────────────────── */}
          <div className="sm:col-span-2">
            <label className={labelCls}>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Internal Notes</label>
            <textarea
              rows={2}
              value={form.internal_notes}
              onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Client-Visible Notes</label>
            <textarea
              rows={2}
              value={form.client_visible_notes}
              onChange={e => setForm(f => ({ ...f, client_visible_notes: e.target.value }))}
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{saveError}</div>
        )}

        {clientNotFound && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            Project created, but no client login exists yet for this email. The project will appear in the
            client portal after the client account is created and linked.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.project_name.trim() || !form.client_name.trim()}
            className="btn-primary"
          >
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Tab = 'overview' | 'project-details' | 'permits-inspections'
  | 'tasks' | 'decisions' | 'rfis' | 'change-orders'
  | 'daily-updates' | 'site-logs' | 'incidents' | 'weather' | 'photos' | 'crew' | 'phases' | 'punch' | 'comms'
  | 'materials' | 'payments'
  | 'schedule-log' | 'activity' | 'closeout'
  | 'ai' | 'delay-reasons' | 'team-members';

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    group: 'PROJECT',
    items: [
      { id: 'overview',             label: 'Overview',               icon: LayoutGrid },
      { id: 'ai',                   label: 'Project Pulse / AI',     icon: BookOpen },
      { id: 'delay-reasons',        label: 'Schedule Impacts',        icon: Zap },
      { id: 'permits-inspections',  label: 'Permits & Inspections',  icon: ShieldCheck },
    ],
  },
  {
    group: 'PLANNING & SCOPE',
    items: [
      { id: 'tasks',             label: 'Tasks & Milestones', icon: CheckSquare },
      { id: 'decisions',         label: 'Client Decisions',   icon: FileText },
      { id: 'rfis',              label: 'RFIs',               icon: MessageSquare },
      { id: 'change-orders',     label: 'Change Orders',      icon: AlignLeft },
    ],
  },
  {
    group: 'FIELD',
    items: [
      { id: 'daily-updates',  label: 'Daily Updates',   icon: ClipboardList },
      { id: 'incidents',      label: 'Incidents',       icon: Zap },
      { id: 'weather',        label: 'Weather Risks',   icon: Cloud },
      { id: 'photos',         label: 'Photo Log',       icon: Image },
      { id: 'crew',           label: 'Crew',            icon: Users },
      { id: 'phases',         label: 'Site Readiness',  icon: Activity },
      { id: 'punch',          label: 'Punch List',      icon: Wrench },
      { id: 'comms',          label: 'Communication',       icon: MessageSquare },
    ],
  },
  {
    group: 'RESOURCES',
    items: [
      { id: 'materials',     label: 'Materials',       icon: Boxes },
      { id: 'team-members',  label: 'Team Members',    icon: Users },
    ],
  },
  {
    group: 'FINANCE',
    items: [
      { id: 'payments',  label: 'Payments',  icon: DollarSign },
    ],
  },
  {
    group: 'FILES & RECORDS',
    items: [
      { id: 'schedule-log',  label: 'Schedule Change History', icon: Calendar },
      { id: 'activity',      label: 'Activity Log',            icon: Activity },
      { id: 'closeout',      label: 'Closeout',                icon: Folder },
    ],
  },
];

const GC_ALLOWED: Tab[] = [
  'overview', 'ai', 'tasks', 'daily-updates', 'permits-inspections',
  'materials', 'photos', 'comms', 'delay-reasons', 'incidents', 'weather', 'crew', 'team-members',
];

const SUB_ALLOWED: Tab[] = [
  'overview', 'tasks', 'daily-updates', 'photos',
];

const CLIENT_NAV_GROUPS: NavGroup[] = [
  {
    group: 'PROJECT',
    items: [
      { id: 'overview',   label: 'Overview',         icon: LayoutGrid },
      { id: 'tasks',      label: 'Milestones',       icon: CheckSquare },
      { id: 'decisions',  label: 'Decisions Needed', icon: FileText },
      { id: 'ai',         label: 'Project Update',   icon: BookOpen },
    ],
  },
];

function filterNavGroups(groups: NavGroup[], role: string, viewAsClient: boolean): NavGroup[] {
  if (viewAsClient || role === 'CLIENT') return CLIENT_NAV_GROUPS;
  if (role === 'SUBCONTRACTOR') {
    return groups.map(g => ({
      ...g,
      items: g.items.filter(i => SUB_ALLOWED.includes(i.id)),
    })).filter(g => g.items.length > 0);
  }
  if (role === 'GENERAL_CONTRACTOR') {
    return groups.map(g => ({
      ...g,
      items: g.items.filter(i => GC_ALLOWED.includes(i.id)),
    })).filter(g => g.items.length > 0);
  }
  return groups;
}

function getActiveGroup(groups: NavGroup[], activeTab: Tab): string {
  return groups.find(g => g.items.some(i => i.id === activeTab))?.group ?? '';
}

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem('projectNavCollapsed');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCollapsedGroups(state: Record<string, boolean>) {
  try {
    sessionStorage.setItem('projectNavCollapsed', JSON.stringify(state));
  } catch { /* ignore */ }
}

export default function ProjectDetailPage({ projectId, onBack, onViewProject, initialTab, initialTaskId }: {
  projectId: string;
  onBack: () => void;
  onViewProject?: (id: string) => void;
  initialTab?: string;
  initialTaskId?: string;
}) {
  const { profile } = useAuth();
  const { startPreview } = useClientPreview();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'overview');
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [viewAsClient, setViewAsClient] = useState(false);
  const [secondaryNavOpen, setSecondaryNavOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadCollapsedGroups);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);

  const isAdmin = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN'].includes(profile?.role || '');
  // Only DECKARC_ADMIN can create projects (same as canEdit in ProjectsPage)
  const canCreateProject = profile?.role === 'DECKARC_ADMIN';
  const effectiveRole = viewAsClient ? 'CLIENT' : (profile?.role || '');
  const isClient = effectiveRole === 'CLIENT';

  const navGroups = filterNavGroups(ALL_NAV_GROUPS, profile?.role || '', viewAsClient);

  // openGroup stores the single expanded group name (accordion)
  const activeGroup = getActiveGroup(navGroups, tab);
  const openGroup = collapsedGroups['__open__'] ?? activeGroup;

  function isGroupCollapsed(groupName: string): boolean {
    if (groupName === activeGroup) return false;
    return openGroup !== groupName;
  }

  function toggleGroup(groupName: string) {
    if (groupName === activeGroup) return; // active group is always open
    const next = openGroup === groupName ? activeGroup : groupName;
    const state = { ...collapsedGroups, '__open__': next };
    setCollapsedGroups(state);
    saveCollapsedGroups(state);
  }

  function selectTab(t: Tab) {
    setTab(t);
    setMobileNavOpen(false);
    const targetGroup = getActiveGroup(filterNavGroups(ALL_NAV_GROUPS, profile?.role || '', viewAsClient), t);
    if (targetGroup) {
      const state = { ...collapsedGroups, '__open__': targetGroup };
      setCollapsedGroups(state);
      saveCollapsedGroups(state);
    }
  }

  useEffect(() => { loadProject(); }, [projectId]);

  async function loadProject() {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    setProject(data);
    setLoading(false);
  }

  async function recalculateSchedule() {
    if (!project) return;
    setRecalculating(true);
    const { data: tasks } = await supabase.from('tasks').select('*').eq('project_id', projectId);
    if (tasks) {
      for (const task of tasks) {
        if (task.delay_days > 0 && task.status !== 'Completed') {
          await cascadeDelayFromTask(projectId, task.id, 0, 'Manual Adjustment', 'Schedule recalculation', profile?.full_name || 'Admin');
        }
      }
    }
    await loadProject();
    setRecalculating(false);
  }

  if (loading) return <div className="p-8 text-center text-concrete-400">Loading project...</div>;
  if (!project) return <div className="p-8 text-center text-concrete-400">Project not found.</div>;

  const progressBarColor = project.status === 'Delayed' ? 'bg-hazard-400' :
    project.status === 'Completed' ? 'bg-site-500' : 'bg-steel-500';

  const statusBadgeClass = project.status === 'Delayed' ? 'bg-hazard-100 text-hazard-700' :
    project.status === 'In Progress' ? 'bg-steel-100 text-steel-700' :
    project.status === 'Completed' ? 'bg-site-100 text-site-700' : 'bg-concrete-100 text-concrete-700';

  const activeLabel = navGroups.flatMap(g => g.items).find(i => i.id === tab)?.label ?? 'Overview';

  return (
    <div className="flex flex-col h-full">
      {/* View As Client Banner */}
      {viewAsClient && (
        <div className="bg-amber-500 px-5 py-2.5 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-white flex-shrink-0" />
            <span className="text-sm font-semibold text-white">
              You are previewing this project as the Client. Internal/admin-only information is hidden.
            </span>
          </div>
          <button
            onClick={() => { setViewAsClient(false); setTab('overview'); }}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            Exit Client Preview
          </button>
        </div>
      )}

      {/* Project header */}
      <div className="bg-white border-b border-concrete-200 px-5 py-3.5 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-concrete-500 hover:text-concrete-900 mb-2.5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertDot status={project.alert_status || 'green'} />
              <h1 className="text-lg font-bold text-concrete-900">{project.project_name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-concrete-500">
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{project.client_name}</span>
              {(project.address || project.city) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {project.address ? `${project.address}, ` : ''}{project.city}{project.state ? `, ${project.state}` : ''}
                </span>
              )}
              {project.expected_finish_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {project.projected_finish_date && project.projected_finish_date !== project.expected_finish_date ? (
                    <>
                      <span className="line-through text-concrete-400 mr-1">
                        {new Date(project.expected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="text-amber-600 font-medium">
                        {new Date(project.projected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </>
                  ) : (
                    new Date(project.expected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && !viewAsClient && (
              <button
                onClick={() => {
                  startPreview({
                    clientUserId: project.id,
                    clientName: project.client_name || 'Client',
                    clientEmail: project.client_email || '',
                    startProjectId: project.id,
                    returnPage: 'projects',
                    returnProjectId: project.id,
                  });
                }}
                className="btn-ghost text-xs flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Preview Client Portal
              </button>
            )}
            {canCreateProject && !viewAsClient && (
              <button
                onClick={() => setShowAddProjectModal(true)}
                className="btn-ghost text-xs flex items-center gap-1.5"
                title="Create a new project pre-filled with this client's information"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Another Project for This Client
              </button>
            )}
            {isAdmin && !viewAsClient && (
              <button onClick={recalculateSchedule} disabled={recalculating} className="btn-ghost text-xs flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? 'Recalculating...' : 'Recalculate Schedule'}
              </button>
            )}
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeClass}`}>
              {project.status}
            </span>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-xs text-concrete-400 mb-1">
            <span>Overall Progress</span><span>{project.progress_percentage}%</span>
          </div>
          <div className="h-1.5 bg-concrete-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressBarColor}`} style={{ width: `${project.progress_percentage}%` }} />
          </div>
        </div>
      </div>

      {/* Body: secondary nav + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Secondary project nav — desktop */}
        <div
          className={`hidden lg:flex flex-col flex-shrink-0 bg-white border-r border-slate-200 transition-all duration-200 overflow-hidden ${
            secondaryNavOpen ? 'w-52' : 'w-0'
          }`}
        >
          {secondaryNavOpen && (
            <div className="flex flex-col h-full overflow-y-auto scrollbar-hide pt-3 pb-6">
              {navGroups.map((g, gi) => {
                const collapsed = isGroupCollapsed(g.group);
                const activeGroup = getActiveGroup(navGroups, tab);
                const isActiveGroup = g.group === activeGroup;
                const GroupIcon = g.items[0]?.icon;
                return (
                  <div key={g.group} className={gi > 0 ? 'mt-0.5' : ''}>
                    {/* Group header — HouzzPro style: icon + label + chevron */}
                    <button
                      onClick={() => toggleGroup(g.group)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 transition-colors ${
                        isActiveGroup ? 'cursor-default' : 'hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      {GroupIcon && (
                        <GroupIcon
                          className="w-3.5 h-3.5 flex-shrink-0 text-slate-400"
                          strokeWidth={2}
                        />
                      )}
                      <span className={`flex-1 text-left text-[12px] font-semibold tracking-wide ${
                        isActiveGroup ? 'text-slate-800' : 'text-slate-500'
                      }`}>
                        {g.group.charAt(0) + g.group.slice(1).toLowerCase().replace(' & ', ' & ')}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform duration-150 ${
                          collapsed ? '-rotate-90' : 'rotate-0'
                        }`}
                        strokeWidth={2}
                      />
                    </button>

                    {/* Items — plain text, no background, left-border on active */}
                    {!collapsed && (
                      <div className="pb-1">
                        {g.items.map(item => {
                          const active = tab === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => selectTab(item.id)}
                              className={`w-full text-left pl-10 pr-4 py-2 text-[13px] transition-colors border-l-2 ${
                                active
                                  ? 'border-slate-900 text-slate-900 font-semibold bg-slate-50'
                                  : 'border-transparent text-slate-500 font-normal hover:text-slate-800 hover:bg-slate-50/60'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Toggle button for secondary nav */}
        <button
          onClick={() => setSecondaryNavOpen(!secondaryNavOpen)}
          className="hidden lg:flex items-center justify-center w-4 flex-shrink-0 bg-white border-r border-slate-200 hover:bg-slate-50 transition-colors group"
          title={secondaryNavOpen ? 'Collapse project nav' : 'Expand project nav'}
        >
          <div className="w-3 h-6 flex flex-col items-center justify-center gap-0.5">
            <div className="w-0.5 h-3 bg-slate-300 group-hover:bg-slate-500 rounded-full transition-colors" />
            <div className="w-0.5 h-1.5 bg-slate-200 group-hover:bg-slate-400 rounded-full transition-colors" />
          </div>
        </button>

        {/* Mobile nav bar */}
        <div className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 absolute top-auto z-10 left-0 right-0" style={{ position: 'sticky', top: 0 }}>
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-700"
          >
            <MenuIcon className="w-4 h-4" />
            <span>{activeLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div className="lg:hidden absolute top-auto left-0 right-0 z-20 bg-white border-b border-slate-200 shadow-xl max-h-80 overflow-y-auto">
            {navGroups.map((g, gi) => {
              const GroupIcon = g.items[0]?.icon;
              return (
                <div key={g.group} className={gi > 0 ? 'border-t border-slate-100' : ''}>
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    {GroupIcon && <GroupIcon className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" strokeWidth={2} />}
                    <span className="text-[12px] font-semibold text-slate-500 tracking-wide">
                      {g.group.charAt(0) + g.group.slice(1).toLowerCase()}
                    </span>
                  </div>
                  {g.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => selectTab(item.id)}
                      className={`w-full text-left pl-10 pr-4 py-2.5 text-[13px] border-l-2 transition-colors ${
                        tab === item.id
                          ? 'border-slate-900 text-slate-900 font-semibold bg-slate-50'
                          : 'border-transparent text-slate-500 font-normal hover:text-slate-800 hover:bg-slate-50/60'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto bg-concrete-50 min-w-0">
          {tab === 'overview'              && <OverviewTab project={project} onRefresh={loadProject} effectiveRole={effectiveRole} />}
          {tab === 'ai'                    && <AiSummaryTab project={project} />}
          {tab === 'delay-reasons'         && <div className="p-6"><DelayReasonsTab projectId={project.id} effectiveRole={effectiveRole} /></div>}
          {tab === 'permits-inspections'   && <ProjectPermitsInspectionsTab project={project} role={effectiveRole} onProjectUpdate={loadProject} />}
          {tab === 'tasks'                 && <TasksTab project={project} initialTaskId={initialTaskId} />}
          {tab === 'decisions'             && <ClientDecisionsTab project={project} />}
          {tab === 'rfis'                  && <div className="p-6"><RFIsTab projectId={project.id} /></div>}
          {tab === 'change-orders'         && <ChangeOrdersTab project={project} onProjectUpdate={loadProject} />}
          {tab === 'daily-updates'         && <DailyUpdatesTab project={project} />}
          {tab === 'incidents'             && <div className="p-6"><IncidentsTab projectId={project.id} /></div>}
          {tab === 'weather'               && <WeatherRisksTab project={project} />}
          {tab === 'photos'                && <div className="p-6"><PhotoLogTab projectId={project.id} userId={profile?.id || ''} /></div>}
          {tab === 'crew'                  && <div className="p-6"><CrewConfirmationsTab projectId={project.id} /></div>}
          {tab === 'phases'                && <div className="p-6"><PhaseReadinessTab projectId={project.id} /></div>}
          {tab === 'punch'                 && <div className="p-6"><PunchListTab projectId={project.id} /></div>}
          {tab === 'comms'                 && (
            <div className="p-6">
              <CommunicationHubTab projectId={project.id} clientSafeOnly={isClient} />
            </div>
          )}
          {tab === 'materials'             && <div className="p-6"><MaterialsTab projectId={project.id} /></div>}
          {tab === 'payments'              && <PaymentsTab project={project} />}
          {tab === 'schedule-log'          && <div className="p-6"><ScheduleChangeLogTab projectId={project.id} /></div>}
          {tab === 'activity'              && <div className="p-6"><ActivityLogTab projectId={project.id} /></div>}
          {tab === 'closeout'              && <CloseoutTab project={project} onProjectUpdate={loadProject} />}
          {tab === 'team-members'          && <TeamMembersTab projectId={project.id} projectName={project.project_name} />}
        </div>
      </div>

      {/* Add Another Project for This Client modal — DECKARC_ADMIN only */}
      {showAddProjectModal && canCreateProject && profile && (
        <AddAnotherProjectModal
          sourceProject={project}
          adminProfileId={profile.id}
          adminOrgId={profile.organization_id}
          adminRole={profile.role}
          onClose={() => setShowAddProjectModal(false)}
          onCreated={(newProjectId) => {
            setShowAddProjectModal(false);
            // Navigate admin directly to the new project if parent supports it,
            // otherwise go back to the projects list where the new project will appear.
            if (onViewProject) {
              onViewProject(newProjectId);
            } else {
              onBack();
            }
          }}
        />
      )}
    </div>
  );
}

/* ── Combined project-level Permits & Inspections workspace ── */
function ProjectPermitsInspectionsTab({ project, role, onProjectUpdate }: { project: Project; role: string; onProjectUpdate?: () => void }) {
  const isClient = role === 'CLIENT';
  const isSub    = role === 'SUBCONTRACTOR';
  type SubTab = 'permits' | 'checklist' | 'inspections';
  const [sub, setSub] = useState<SubTab>(isSub ? 'inspections' : 'permits');

  const tabs: { id: SubTab; label: string }[] = isSub
    ? [{ id: 'inspections', label: 'Inspections' }]
    : isClient
      ? [{ id: 'checklist', label: 'Inspection Progress' }, { id: 'inspections', label: 'Inspection Updates' }]
      : [
          { id: 'permits',     label: 'Permits' },
          { id: 'checklist',   label: 'Inspection Checklist' },
          { id: 'inspections', label: 'Inspections' },
        ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 pt-4 flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              sub === t.id
                ? 'border-steel-700 text-steel-800 bg-slate-50'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sub === 'permits'     && <PermitsTab project={project} onProjectUpdate={onProjectUpdate} />}
        {sub === 'checklist'   && <InspectionChecklistTab project={project} />}
        {sub === 'inspections' && <InspectionsTab project={project} />}
      </div>
    </div>
  );
}

function OverviewTab({ project, onRefresh, effectiveRole }: { project: Project; onRefresh: () => void; effectiveRole: string }) {
  const { profile } = useAuth();
  const isClient = effectiveRole === 'CLIENT';
  const canEdit = profile?.role === 'CONVAZANT_SUPER_ADMIN' || profile?.role === 'DECKARC_ADMIN';
  const [editProgress, setEditProgress] = useState(false);
  const [progressVal, setProgressVal] = useState(project.progress_percentage);
  const [statusVal, setStatusVal] = useState(project.status);
  const [projectedDate, setProjectedDate] = useState(project.projected_finish_date || '');
  const [saving, setSaving] = useState(false);

  // Client-only: fetch pending decisions + key milestones
  const [pendingDecisions, setPendingDecisions] = useState<{ id: string; decision_title: string; needed_by_date: string | null }[]>([]);
  const [nextMilestone, setNextMilestone] = useState<{ task_name: string; planned_finish_date: string | null; status: string } | null>(null);
  const [lastCompleted, setLastCompleted] = useState<{ task_name: string; actual_finish_date: string | null } | null>(null);
  const [clientDataLoading, setClientDataLoading] = useState(false);

  useEffect(() => {
    if (!isClient) return;
    loadClientData();
  }, [isClient, project.id]);

  async function loadClientData() {
    setClientDataLoading(true);
    const [{ data: decisions }, { data: tasks }] = await Promise.all([
      supabase
        .from('client_decisions')
        .select('id, decision_title, needed_by_date, status')
        .eq('project_id', project.id)
        .in('status', ['Pending', 'Needs Decision', 'Open'])
        .order('needed_by_date', { ascending: true }),
      supabase
        .from('tasks')
        .select('task_name, planned_finish_date, actual_finish_date, status, planned_start_date')
        .eq('project_id', project.id)
        .eq('is_client_visible', true)
        .order('planned_finish_date', { ascending: true }),
    ]);

    setPendingDecisions(decisions || []);

    const taskList = tasks || [];
    const active = taskList.find(t => t.status === 'In Progress');
    const upcoming = active || taskList.find(t => t.status !== 'Completed' && t.status !== 'Cancelled');
    setNextMilestone(upcoming || null);

    const completed = [...taskList].reverse().find(t => t.status === 'Completed');
    setLastCompleted(completed || null);

    setClientDataLoading(false);
  }

  function fmtD(d: string | null) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function saveOverride() {
    setSaving(true);
    await supabase.from('projects').update({ progress_percentage: progressVal, status: statusVal, projected_finish_date: projectedDate || null }).eq('id', project.id);
    setSaving(false);
    setEditProgress(false);
    onRefresh();
  }

  if (isClient) {
    const finishDate = project.projected_finish_date || project.expected_finish_date;
    const isDelayed = project.projected_finish_date && project.expected_finish_date && project.projected_finish_date !== project.expected_finish_date;
    const location = [project.address, project.city, project.state].filter(Boolean).join(', ');

    const statusPill =
      project.status === 'Delayed'     ? 'bg-amber-100 text-amber-700 border-amber-200' :
      project.status === 'Completed'   ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
      project.status === 'In Progress' ? 'bg-blue-100 text-blue-700 border-blue-200' :
      'bg-slate-100 text-slate-600 border-slate-200';

    const progressColor =
      project.status === 'Delayed' ? 'bg-amber-400' :
      project.status === 'Completed' ? 'bg-emerald-500' : 'bg-steel-500';

    return (
      <div className="p-5 sm:p-6 max-w-3xl mx-auto space-y-5">

        {/* At-a-glance hero card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Project status</p>
              <div className="flex items-center gap-2">
                <AlertDot status={project.alert_status || 'green'} />
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusPill}`}>{project.status}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{project.progress_percentage}%</p>
              <p className="text-xs text-slate-400">overall complete</p>
            </div>
          </div>
          <div className="px-5 py-3">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${project.progress_percentage}%` }} />
            </div>
          </div>
        </div>

        {/* Pending decisions alert banner */}
        {!clientDataLoading && pendingDecisions.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {pendingDecisions.length} decision{pendingDecisions.length !== 1 ? 's' : ''} need{pendingDecisions.length === 1 ? 's' : ''} your response
              </p>
              <ul className="mt-1.5 space-y-1">
                {pendingDecisions.slice(0, 3).map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-amber-700 truncate">{d.decision_title}</span>
                    {d.needed_by_date && (
                      <span className="text-xs text-amber-600 flex-shrink-0">by {fmtD(d.needed_by_date)}</span>
                    )}
                  </li>
                ))}
                {pendingDecisions.length > 3 && (
                  <li className="text-xs text-amber-600">+{pendingDecisions.length - 3} more — see Decisions Needed tab</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Key dates & location */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
          <div className="px-5 py-3.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">Project type</span>
            <span className="text-sm text-slate-800">{project.project_type || '—'}</span>
          </div>
          {location && (
            <div className="px-5 py-3.5 flex items-start justify-between gap-4">
              <span className="text-xs text-slate-500 pt-0.5">Location</span>
              <span className="text-sm text-slate-800 text-right">{location}</span>
            </div>
          )}
          <div className="px-5 py-3.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">Start date</span>
            <span className="text-sm text-slate-800">{fmtD(project.start_date)}</span>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">Original completion</span>
            <span className="text-sm text-slate-800">{fmtD(project.expected_finish_date)}</span>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between">
            <span className="text-xs text-slate-500">Expected completion</span>
            <span className={`text-sm ${isDelayed ? 'text-amber-600' : 'text-slate-800'}`}>
              {fmtD(finishDate)}
              {isDelayed && <span className="ml-1.5 text-xs text-amber-500">(revised)</span>}
            </span>
          </div>
        </div>

        {/* Milestones snapshot */}
        {!clientDataLoading && (nextMilestone || lastCompleted) && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Milestone Snapshot</p>
            </div>
            <div className="divide-y divide-slate-100">
              {lastCompleted && (
                <div className="px-5 py-3.5 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">Last completed</p>
                    <p className="text-sm text-slate-700">{lastCompleted.task_name}</p>
                    {lastCompleted.actual_finish_date && (
                      <p className="text-xs text-slate-400 mt-0.5">{fmtD(lastCompleted.actual_finish_date)}</p>
                    )}
                  </div>
                </div>
              )}
              {nextMilestone && (
                <div className="px-5 py-3.5 flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    nextMilestone.status === 'In Progress' ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    <Clock className={`w-3.5 h-3.5 ${nextMilestone.status === 'In Progress' ? 'text-blue-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">
                      {nextMilestone.status === 'In Progress' ? 'Currently in progress' : 'Next upcoming'}
                    </p>
                    <p className="text-sm text-slate-700">{nextMilestone.task_name}</p>
                    {nextMilestone.planned_finish_date && (
                      <p className="text-xs text-slate-400 mt-0.5">Est. {fmtD(nextMilestone.planned_finish_date)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Client notes */}
        {project.client_visible_notes && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Note from your team</p>
            <p className="text-sm text-slate-700 leading-relaxed">{project.client_visible_notes}</p>
          </div>
        )}

        {/* Description */}
        {project.description && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Project Description</p>
            <p className="text-sm text-slate-600 leading-relaxed">{project.description}</p>
          </div>
        )}

        {/* Schedule updates */}
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Schedule Updates</h3>
            <p className="text-xs text-slate-400 mt-0.5">Approved updates that may affect your timeline.</p>
          </div>
          <ScheduleUpdatesSection projectId={project.id} />
        </div>
      </div>
    );
  }

  // Admin / GC / Sub view
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-concrete-800 mb-4">Project Details</h3>
          <div className="space-y-3 text-sm">
            {[['Type', project.project_type || '—'],['Start Date', project.start_date ? new Date(project.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'],['Expected Finish', project.expected_finish_date ? new Date(project.expected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—']].map(([k,v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-concrete-500">{k}</span>
                <span className="text-concrete-900 font-medium">{v}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-concrete-500">Projected Finish</span>
              <span className={`font-medium ${project.projected_finish_date && project.projected_finish_date !== project.expected_finish_date ? 'text-amber-600' : 'text-concrete-900'}`}>
                {project.projected_finish_date ? new Date(project.projected_finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-concrete-800">Status</h3>
            {canEdit && !editProgress && <button onClick={() => setEditProgress(true)} className="text-xs text-steel-600 hover:text-steel-800 font-medium">Edit</button>}
          </div>
          {editProgress ? (
            <div className="space-y-3">
              <div>
                <label className="label-sm">Status</label>
                <select value={statusVal} onChange={e => setStatusVal(e.target.value)} className="input-field">
                  {['Planning', 'Permit', 'In Progress', 'Delayed', 'Completed', 'On Hold'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Progress %</label>
                <input type="number" min="0" max="100" value={progressVal} onChange={e => setProgressVal(parseInt(e.target.value) || 0)} className="input-field" />
              </div>
              <div>
                <label className="label-sm">Projected Finish Date</label>
                <input type="date" value={projectedDate} onChange={e => setProjectedDate(e.target.value)} className="input-field" />
              </div>
              <div className="flex gap-2">
                <button onClick={saveOverride} disabled={saving} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setEditProgress(false)} className="btn-ghost text-xs px-4 py-2">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <AlertDot status={project.alert_status || 'green'} />
                <span className="text-concrete-900 font-medium">{project.status}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs text-concrete-500 mb-1.5"><span>Progress</span><span>{project.progress_percentage}%</span></div>
                <div className="h-2.5 bg-concrete-100 rounded-full overflow-hidden">
                  <div className="h-full bg-steel-500 rounded-full" style={{ width: `${project.progress_percentage}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {project.client_visible_notes && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-concrete-800 mb-3">Client Notes</h3>
            <p className="text-sm text-concrete-600 leading-relaxed">{project.client_visible_notes}</p>
          </div>
        )}
        {!isClient && project.internal_notes && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-concrete-800 mb-3">Internal Notes</h3>
            <p className="text-sm text-concrete-600 leading-relaxed">{project.internal_notes}</p>
          </div>
        )}
        {project.description && (
          <div className="card p-5 md:col-span-2">
            <h3 className="text-sm font-semibold text-concrete-800 mb-3">Description</h3>
            <p className="text-sm text-concrete-600 leading-relaxed">{project.description}</p>
          </div>
        )}
      </div>

      {/* Delay Reasons / Schedule Updates section */}
      <div className="mt-6">
        <DelayReasonsTab projectId={project.id} effectiveRole={effectiveRole} />
      </div>
    </div>
  );
}
