import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  UserPlus, Trash2, Search, X, Check, AlertCircle,
  User, Building2, Mail, Phone, Loader2, Clock, Copy, CheckCircle2,
} from 'lucide-react';

interface TeamMember {
  id: string;           // project_users.id
  user_id: string;
  full_name: string;
  display_name: string | null;
  email: string;
  phone_number: string | null;
  role: string;
  role_on_project: string;
  company_name: string | null;
  trade_specialty: string | null;
  is_active: boolean;
}

interface PendingInvite {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  company_name: string | null;
  invited_at: string;
  status: string;
}

interface AllUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_name: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  CONVAZANT_SUPER_ADMIN: 'Platform Admin',
  DECKARC_ADMIN:        'Company Admin',
  GENERAL_CONTRACTOR:   'GC / Project Manager',
  SUBCONTRACTOR:        'Subcontractor',
  CLIENT:               'Client / Homeowner',
};

const ROLE_COLORS: Record<string, string> = {
  CONVAZANT_SUPER_ADMIN: 'bg-amber-50 text-amber-700 border-amber-200',
  DECKARC_ADMIN:        'bg-blue-50 text-blue-700 border-blue-200',
  GENERAL_CONTRACTOR:   'bg-slate-100 text-slate-700 border-slate-200',
  SUBCONTRACTOR:        'bg-orange-50 text-orange-700 border-orange-200',
  CLIENT:               'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5">
      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      {message}
    </div>
  );
}

// ── Add Member Modal (two tabs: existing users + invite new) ─────────────────

const INVITE_ROLES = [
  { value: 'CLIENT',              label: 'Client / Homeowner' },
  { value: 'SUBCONTRACTOR',       label: 'Subcontractor' },
  { value: 'GENERAL_CONTRACTOR',  label: 'GC / Project Manager' },
  { value: 'DECKARC_ADMIN',       label: 'Company Admin' },
];

const INP = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-colors';
const LBL = 'block text-xs font-semibold text-slate-600 mb-1';

interface InviteSuccess {
  full_name: string;
  email: string;
  role: string;
  company_name: string;
  projectName: string;
}

const CP360_URL = 'https://constructionprogress360.com';

function CopyInviteMessage({ invite }: { invite: InviteSuccess }) {
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const message = [
    `Hi ${invite.full_name},`,
    '',
    `You have been invited to collaborate on "${invite.projectName}" in CP360.`,
    '',
    `Role: ${ROLE_LABELS[invite.role] ?? invite.role}`,
    `Company: DECKARC LLC`,
    `Project: ${invite.projectName}`,
    '',
    'Next step:',
    `Please confirm your preferred login email to DECKARC Admin, or confirm this email:`,
    invite.email,
    '',
    'DECKARC Admin will activate your CP360 access and notify you once your login is ready.',
    '',
    `CP360 website: ${CP360_URL}`,
    '',
    'Note: This invite was created as Pending inside CP360. Email invite links are not automated yet.',
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(CP360_URL);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-600">Manual invite message</p>
      <pre className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 whitespace-pre-wrap leading-relaxed font-mono">
        {message}
      </pre>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy Invite Message'}
        </button>
        <button
          onClick={copyUrl}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          {copiedUrl ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedUrl ? 'Copied!' : 'Copy CP360 Website URL'}
        </button>
      </div>
    </div>
  );
}

function AddMemberModal({
  projectId,
  projectName,
  existingUserIds,
  existingEmails,
  onClose,
  onAdded,
}: {
  projectId: string;
  projectName: string;
  existingUserIds: Set<string>;
  existingEmails: Set<string>;
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'existing' | 'invite'>('existing');

  // ─ Existing users tab ─
  const [search, setSearch] = useState('');
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [existingError, setExistingError] = useState('');

  // ─ Invite success state ─
  const [inviteSuccess, setInviteSuccess] = useState<InviteSuccess | null>(null);

  useEffect(() => {
    supabase.from('user_profiles').select('id, full_name, email, role, company_name')
      .eq('is_active', true).order('full_name')
      .then(({ data }) => { setAllUsers((data ?? []) as AllUser[]); setLoadingUsers(false); });
  }, []);

  const filteredUsers = allUsers.filter(u => {
    if (existingUserIds.has(u.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.company_name?.toLowerCase().includes(q);
  });

  async function addExistingUser(userId: string) {
    setSavingUser(userId);
    setExistingError('');
    const { error: err } = await supabase.from('project_users').insert({ project_id: projectId, user_id: userId });
    if (err) { setExistingError('Failed to add. They may already be on this project.'); setSavingUser(null); return; }
    setSavingUser(null);
    onAdded('Team member added.');
  }

  // ─ Invite new tab ─
  const [invite, setInvite] = useState({ full_name: '', email: '', phone: '', role: 'CLIENT', company_name: '', notes: '' });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  function setInvF(k: keyof typeof invite, v: string) { setInvite(f => ({ ...f, [k]: v })); }

  async function submitInvite() {
    const email = invite.email.trim().toLowerCase();
    if (!invite.full_name.trim() || !email || !invite.role) {
      setInviteError('Full name, email, and role are required.'); return;
    }
    setInviting(true);
    setInviteError('');

    try {
      // Check if a user with this email already exists on the platform
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingProfile) {
        // User exists — link them directly to the project
        if (existingUserIds.has(existingProfile.id)) {
          setInviteError('This person is already on this project.');
          setInviting(false);
          return;
        }
        const { error: linkErr } = await supabase.from('project_users').insert({ project_id: projectId, user_id: existingProfile.id });
        if (linkErr) { setInviteError('Failed to link user to project.'); setInviting(false); return; }
        console.log('[CP360 Invite] Existing user linked to project:', existingProfile.id);
        setInviting(false);
        onAdded('Existing user linked to project.');
        return;
      }

      // Check if already invited
      if (existingEmails.has(email)) {
        setInviteError('This email has already been invited.');
        setInviting(false);
        return;
      }

      // Create pending invite
      const { data: newInvite, error: invErr } = await supabase.from('pending_invites').insert({
        project_id: projectId,
        full_name: invite.full_name.trim(),
        email,
        phone: invite.phone.trim() || null,
        role: invite.role,
        company_name: invite.company_name.trim() || null,
        notes: invite.notes.trim() || null,
        invited_by: profile?.id ?? null,
      }).select('id').maybeSingle();

      if (invErr) {
        setInviteError('Failed to create invite. Please try again.');
        setInviting(false);
        return;
      }

      console.log('[CP360 Invite] Pending invite created:', newInvite?.id);
      console.log('[CP360 Invite] Email not configured, manual invite required.');

      // Show success screen — do NOT close modal yet
      setInviting(false);
      setInviteSuccess({
        full_name: invite.full_name.trim(),
        email,
        role: invite.role,
        company_name: invite.company_name.trim(),
        projectName,
      });

      // Refresh list in background so parent has updated data when modal closes
      onAdded(`Invite created for ${invite.full_name.trim()}.`);
    } catch {
      setInviteError('An unexpected error occurred. Please try again.');
      setInviting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100">
          <h2 className="text-[16px] font-bold text-slate-900">Add Team Member</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invite success screen */}
        {inviteSuccess ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Invite Created</p>
                <p className="text-xs text-slate-500">{inviteSuccess.full_name} has been added as Invited/Pending for this project.</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
              <p className="text-xs font-semibold text-amber-800 mb-0.5">Email invite not sent</p>
              <p className="text-xs text-amber-700">Email sending is not connected yet. Use the message below to invite this person manually.</p>
            </div>

            <CopyInviteMessage invite={inviteSuccess} />

            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => { setInviteSuccess(null); setInvite({ full_name: '', email: '', phone: '', role: 'CLIENT', company_name: '', notes: '' }); }}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Invite Another
              </button>
              <button onClick={onClose} className="text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-5 gap-4">
              {([['existing', 'Add Existing User'], ['invite', 'Invite New Person']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`py-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab: Existing Users */}
            {tab === 'existing' && (
              <>
                <div className="p-4 border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      autoFocus
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name, email, or company..."
                      className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
                    />
                  </div>
                  {existingError && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {existingError}
                    </p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading users...</span>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-slate-400">{search ? 'No users match your search.' : 'All platform users are already on this project.'}</p>
                      <p className="text-xs text-slate-400 mt-1">Use the "Invite New Person" tab to add someone new.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {filteredUsers.map(u => (
                        <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                            {(u.full_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 truncate">{u.full_name}</p>
                            <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                            {u.company_name && <p className="text-[11px] text-slate-400 truncate">{u.company_name}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <RoleBadge role={u.role} />
                            <button
                              onClick={() => addExistingUser(u.id)}
                              disabled={savingUser === u.id}
                              className="flex items-center gap-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {savingUser === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                              Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end">
                  <button onClick={onClose} className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                    Done
                  </button>
                </div>
              </>
            )}

            {/* Tab: Invite New Person */}
            {tab === 'invite' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                    If the person already has an account, they will be linked immediately. Otherwise a pending invite record is created and they appear as <strong>Invited</strong> in Team Members.
                  </p>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                    Email sending is not connected yet. After submitting, you will receive a copyable invite message to send manually.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={LBL}>Full Name *</label>
                      <input value={invite.full_name} onChange={e => setInvF('full_name', e.target.value)} placeholder="Jane Smith" className={INP} />
                    </div>
                    <div className="col-span-2">
                      <label className={LBL}>Email *</label>
                      <input type="email" value={invite.email} onChange={e => setInvF('email', e.target.value)} placeholder="jane@example.com" className={INP} />
                    </div>
                    <div>
                      <label className={LBL}>Phone</label>
                      <input value={invite.phone} onChange={e => setInvF('phone', e.target.value)} placeholder="(704) 555-0100" className={INP} />
                    </div>
                    <div>
                      <label className={LBL}>Role *</label>
                      <select value={invite.role} onChange={e => setInvF('role', e.target.value)} className={INP}>
                        {INVITE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={LBL}>Company / Trade</label>
                      <input value={invite.company_name} onChange={e => setInvF('company_name', e.target.value)} placeholder="ABC Tile Co." className={INP} />
                    </div>
                    <div className="col-span-2">
                      <label className={LBL}>Notes (optional)</label>
                      <textarea value={invite.notes} onChange={e => setInvF('notes', e.target.value)} rows={2} placeholder="e.g. tile subcontractor for Satya project" className={INP + ' resize-none'} />
                    </div>
                  </div>

                  {inviteError && (
                    <p className="text-xs text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {inviteError}
                    </p>
                  )}
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submitInvite}
                    disabled={inviting}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    Send Invite
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function TeamMembersTab({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const { profile } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingInvite, setRemovingInvite] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');

  const canManage = profile?.role === 'DECKARC_ADMIN' || profile?.role === 'CONVAZANT_SUPER_ADMIN';

  async function loadMembers() {
    setLoading(true);
    setError('');
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('project_users')
        .select(`id, user_id, role_on_project, user_profiles!inner (full_name, display_name, email, phone_number, role, company_name, trade_specialty, is_active)`)
        .eq('project_id', projectId),
      supabase
        .from('pending_invites')
        .select('id, full_name, email, phone, role, company_name, invited_at, status')
        .eq('project_id', projectId)
        .eq('status', 'pending'),
    ]);

    if (membersRes.error) {
      setError('Unable to load team members.');
      setLoading(false);
      return;
    }

    const mapped: TeamMember[] = (membersRes.data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      role_on_project: row.role_on_project || '',
      full_name: row.user_profiles?.full_name ?? '',
      display_name: row.user_profiles?.display_name ?? null,
      email: row.user_profiles?.email ?? '',
      phone_number: row.user_profiles?.phone_number ?? null,
      role: row.user_profiles?.role ?? '',
      company_name: row.user_profiles?.company_name ?? null,
      trade_specialty: row.user_profiles?.trade_specialty ?? null,
      is_active: row.user_profiles?.is_active ?? true,
    }));
    setMembers(mapped);
    setPendingInvites((invitesRes.data ?? []) as PendingInvite[]);
    setLoading(false);
  }

  useEffect(() => { loadMembers(); }, [projectId]);

  async function removeMember(rowId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this project?`)) return;
    setRemoving(rowId);
    await supabase.from('project_users').delete().eq('id', rowId);
    setRemoving(null);
    setToast(`${name} removed from project.`);
    await loadMembers();
  }

  async function cancelInvite(inviteId: string, name: string) {
    if (!window.confirm(`Cancel invite for ${name}?`)) return;
    setRemovingInvite(inviteId);
    await supabase.from('pending_invites').delete().eq('id', inviteId);
    setRemovingInvite(null);
    setToast(`Invite for ${name} cancelled.`);
    await loadMembers();
  }

  const existingUserIds = new Set(members.map(m => m.user_id));
  const existingEmails  = new Set([
    ...members.map(m => m.email?.toLowerCase()).filter(Boolean),
    ...pendingInvites.map(i => i.email?.toLowerCase()).filter(Boolean),
  ] as string[]);

  const totalCount = members.length + pendingInvites.length;

  const filteredMembers = members.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.full_name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.company_name?.toLowerCase().includes(q) || ROLE_LABELS[m.role]?.toLowerCase().includes(q);
  });

  const filteredInvites = pendingInvites.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.full_name?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q) || i.company_name?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Team Members</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Users linked to this project. Members appear in task assignment dropdowns.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add / Invite Member
          </button>
        )}
      </div>

      {/* Search */}
      {totalCount > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-4">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading team members...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && totalCount === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">No team members yet</p>
          <p className="text-xs text-slate-400 mb-4">Add or invite users to this project so they can be assigned to tasks.</p>
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add / Invite Member
            </button>
          )}
        </div>
      )}

      {/* Members list */}
      {!loading && (filteredMembers.length > 0 || filteredInvites.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-50">
            {/* Active members */}
            {filteredMembers.map(m => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                  {(m.full_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-slate-900 truncate">{m.full_name}</span>
                    <RoleBadge role={m.role} />
                    {!m.is_active && <span className="text-[11px] font-medium text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {m.email && <span className="flex items-center gap-1 text-[12px] text-slate-500"><Mail className="w-3 h-3 text-slate-400" />{m.email}</span>}
                    {m.phone_number && <span className="flex items-center gap-1 text-[12px] text-slate-500"><Phone className="w-3 h-3 text-slate-400" />{m.phone_number}</span>}
                    {m.company_name && <span className="flex items-center gap-1 text-[12px] text-slate-500"><Building2 className="w-3 h-3 text-slate-400" />{m.company_name}</span>}
                    {m.trade_specialty && <span className="text-[12px] text-slate-400">{m.trade_specialty}</span>}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => removeMember(m.id, m.full_name)}
                    disabled={removing === m.id}
                    className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    title="Remove from project"
                  >
                    {removing === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Remove</span>
                  </button>
                )}
              </div>
            ))}

            {/* Pending invites */}
            {filteredInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors bg-amber-50/30">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-slate-700 truncate">{inv.full_name}</span>
                    <RoleBadge role={inv.role} />
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Invited</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {inv.email && <span className="flex items-center gap-1 text-[12px] text-slate-500"><Mail className="w-3 h-3 text-slate-400" />{inv.email}</span>}
                    {inv.phone && <span className="flex items-center gap-1 text-[12px] text-slate-500"><Phone className="w-3 h-3 text-slate-400" />{inv.phone}</span>}
                    {inv.company_name && <span className="flex items-center gap-1 text-[12px] text-slate-500"><Building2 className="w-3 h-3 text-slate-400" />{inv.company_name}</span>}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => cancelInvite(inv.id, inv.full_name)}
                    disabled={removingInvite === inv.id}
                    className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    title="Cancel invite"
                  >
                    {removingInvite === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && search && filteredMembers.length === 0 && filteredInvites.length === 0 && totalCount > 0 && (
        <p className="text-sm text-slate-400 text-center py-8">No members match your search.</p>
      )}

      {showAddModal && (
        <AddMemberModal
          projectId={projectId}
          projectName={projectName ?? 'This Project'}
          existingUserIds={existingUserIds}
          existingEmails={existingEmails}
          onClose={() => setShowAddModal(false)}
          onAdded={async (msg) => {
            setToast(msg);
            await loadMembers();
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}
