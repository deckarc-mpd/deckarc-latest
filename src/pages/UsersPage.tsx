import { useEffect, useState } from 'react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import { getRoleLabel } from '../lib/alertUtils';
import { Edit2, Plus, Search, Send, CheckCircle } from 'lucide-react';

const ROLES = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR', 'SUBCONTRACTOR', 'CLIENT'];

interface UsersPageProps {
  title?: string;
  subtitle?: (count: number) => string;
  hideHeader?: boolean;
  noContainer?: boolean;
  registerAddUser?: (fn: () => void) => void;
}

export default function UsersPage({ title, subtitle, hideHeader, noContainer, registerAddUser }: UsersPageProps = {}) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'SUBCONTRACTOR', is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [resetSent, setResetSent] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  const canManage = profile?.role === 'CONVAZANT_SUPER_ADMIN' || profile?.role === 'DECKARC_ADMIN';

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('user_profiles').select('*').order('full_name');
    setUsers(data || []);
    setLoading(false);
  }

  function openEdit(u: UserProfile) {
    setEditUser(u);
    setForm({ full_name: u.full_name, email: u.email, role: u.role, is_active: u.is_active });
    setError('');
    setResetSent(false);
    setShowModal(true);
  }

  async function sendPasswordReset() {
    if (!editUser) return;
    setResetSending(true);
    await supabase.auth.resetPasswordForEmail(editUser.email, {
      redirectTo: `${window.location.origin}`,
    });
    setResetSending(false);
    setResetSent(true);
  }

  function openCreate() {
    setEditUser(null);
    setForm({ full_name: '', email: '', role: 'SUBCONTRACTOR', is_active: true });
    setError('');
    setShowModal(true);
  }

  // Expose openCreate to parent so it can place the button in its own header
  if (registerAddUser) registerAddUser(openCreate);

  async function saveUser() {
    setSaving(true);
    setError('');
    try {
      if (editUser) {
        await supabase.from('user_profiles').update({
          full_name: form.full_name,
          role: form.role,
          is_active: form.is_active,
        }).eq('id', editUser.id);
      } else {
        setError('To add a new user, ask them to sign up with their email and password, then edit their profile here to assign a role.');
        setSaving(false);
        return;
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.message || 'Error saving user.');
    }
    setSaving(false);
  }

  const roleColors: Record<string, string> = {
    CONVAZANT_SUPER_ADMIN: 'bg-concrete-900 text-white',
    DECKARC_ADMIN: 'bg-steel-700 text-white',
    GENERAL_CONTRACTOR: 'bg-steel-100 text-steel-700',
    SUBCONTRACTOR: 'bg-amber-100 text-amber-700',
    CLIENT: 'bg-site-100 text-site-700',
  };

  return (
    <div className={noContainer ? '' : 'p-6 max-w-4xl mx-auto'}>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-concrete-900">{title ?? 'Users'}</h1>
            <p className="text-sm text-concrete-500 mt-0.5">{subtitle ? subtitle(users.length) : `${users.length} registered users`}</p>
          </div>
          {canManage && (
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>
      )}

      {/* Search + filter */}
      {!loading && users.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-concrete-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-concrete-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-steel-200 placeholder-concrete-400"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="text-sm border border-concrete-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-steel-200 text-concrete-700"
          >
            <option value="all">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-concrete-400 text-sm">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-concrete-400 text-sm">No users found.</div>
      ) : (() => {
        const q = search.trim().toLowerCase();
        const visible = users.filter(u =>
          (roleFilter === 'all' || u.role === roleFilter) &&
          (!q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
        );
        return visible.length === 0 ? (
          <div className="text-center py-12 text-concrete-400 text-sm">No users match your search.</div>
        ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-concrete-100">
            {visible.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-concrete-50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-steel-100 flex items-center justify-center text-sm font-semibold text-steel-700 flex-shrink-0">
                  {u.full_name?.charAt(0) || u.email?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-concrete-900">{u.full_name || '(No name)'}</p>
                  <p className="text-xs text-concrete-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleColors[u.role] || 'bg-concrete-100 text-concrete-600'}`}>
                    {getRoleLabel(u.role)}
                  </span>
                  {!u.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-concrete-100 text-concrete-500">Inactive</span>
                  )}
                </div>
                {canManage && (
                  <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {showModal && (
        <Modal title={editUser ? 'Edit User' : 'Add User'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            {error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            {editUser ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-concrete-600 mb-1.5">Full Name</label>
                  <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-concrete-600 mb-1.5">Email</label>
                  <input value={form.email} disabled
                    className="input-field bg-concrete-50 text-concrete-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-concrete-600 mb-1.5">Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="input-field">
                    {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded" />
                  <label htmlFor="active" className="text-sm text-concrete-700">Active</label>
                </div>
              </>
            ) : (
              <div className="bg-concrete-50 rounded-lg p-4 text-sm text-concrete-600">
                <p className="font-medium text-concrete-800 mb-2">How to add a new user:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-concrete-600">
                  <li>Have the user sign up using the login page with their email and a password.</li>
                  <li>Once they have logged in once, their profile will appear here.</li>
                  <li>Edit their profile to assign the correct role.</li>
                </ol>
                <p className="mt-3 text-xs text-concrete-400">Note: User self-registration is handled via Supabase Auth. Role assignment is managed here.</p>
              </div>
            )}

            {editUser && (
              <>
                <div className="pt-2 border-t border-concrete-100">
                  <p className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-2">Account Security</p>
                  <div className="flex items-center justify-between bg-concrete-50 rounded-lg px-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-concrete-700">Send Password Reset</p>
                      <p className="text-xs text-concrete-400">Sends a reset link to {editUser.email}</p>
                    </div>
                    {resetSent ? (
                      <span className="flex items-center gap-1.5 text-xs text-site-600 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Sent
                      </span>
                    ) : (
                      <button
                        onClick={sendPasswordReset}
                        disabled={resetSending}
                        className="flex items-center gap-1.5 text-xs font-semibold text-steel-600 hover:text-steel-800 border border-steel-200 hover:border-steel-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        {resetSending ? 'Sending...' : 'Send Reset Link'}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-concrete-400 mt-2">Passwords are never visible to admins. Only the user can set or change their own password.</p>
                </div>
                <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
                  <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                  <button onClick={saveUser} disabled={saving} className="btn-primary disabled:opacity-50">
                    {saving ? 'Saving...' : 'Update'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
