import { useEffect, useState } from 'react';
import { supabase, NotificationPreferences } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getRoleLabel } from '../lib/alertUtils';
import {
  Building2, Shield, Info, Bell, CheckCircle,
  User, Lock, Eye, EyeOff, Phone, Edit2, X, MapPin, Hash,
  ChevronDown, ChevronRight, Construction, LogOut,
  Layers, Palette, ClipboardCheck,
} from 'lucide-react';

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <h2 className="text-sm font-semibold text-concrete-800 mb-4 flex items-center gap-2">
      <Icon className="w-4 h-4" />
      {title}
    </h2>
  );
}

function Row({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-concrete-50 last:border-0">
      <span className="text-concrete-500 text-sm">{label}</span>
      <span className={`font-medium text-concrete-900 text-sm ${cls}`}>{value}</span>
    </div>
  );
}

function Toggle({ checked, onChange, label, sublabel }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sublabel?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-concrete-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-concrete-800">{label}</p>
        {sublabel && <p className="text-xs text-concrete-400 mt-0.5">{sublabel}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{ height: '22px', width: '40px' }}
        className={`relative rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-steel-700' : 'bg-concrete-200'}`}
      >
        <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
      </button>
    </div>
  );
}

const blank = (): Partial<NotificationPreferences> => ({
  notifications_enabled: true, email_notifications: true, sms_notifications: false,
  preferred_method: 'email', quiet_hours_start: null, quiet_hours_end: null,
  notify_on_delay: true, notify_on_inspection: true, notify_on_payment_due: true,
  notify_on_client_decision: true, notify_on_daily_update: false,
});

// ── Personal Info section ─────────────────────────────────────────────────────

function PersonalInfoSection() {
  const { profile, updateProfile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone_number: '', display_name: '', contact_address: '', ein: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    setForm({
      full_name: profile?.full_name || '',
      phone_number: profile?.phone_number || '',
      display_name: profile?.display_name || '',
      contact_address: profile?.contact_address || '',
      ein: profile?.ein || '',
    });
    setError('');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    const { error: err } = await updateProfile({
      full_name: form.full_name.trim(),
      phone_number: form.phone_number.trim() || null as any,
      display_name: form.display_name.trim() || null as any,
      contact_address: form.contact_address.trim() || null as any,
      ein: form.ein.trim() || null as any,
    });
    if (err) {
      setError(err.message);
    } else {
      await refreshProfile();
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeader icon={User} title="Personal Info" />
        {!editing && (
          <button onClick={startEdit} className="flex items-center gap-1.5 text-xs text-steel-600 hover:text-steel-800 font-medium transition-colors">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {editing && (
          <button onClick={() => setEditing(false)} className="p-1 rounded text-concrete-400 hover:text-concrete-600 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full bg-steel-100 flex items-center justify-center text-xl font-bold text-steel-700 flex-shrink-0">
          {(profile?.display_name || profile?.full_name)?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <p className="font-semibold text-concrete-900">{profile?.display_name || profile?.full_name || '—'}</p>
          <p className="text-xs text-concrete-500">{profile?.email}</p>
          <span className="inline-block mt-1 text-[11px] font-medium bg-steel-100 text-steel-700 px-2 py-0.5 rounded-full">
            {getRoleLabel(profile?.role || '')}
          </span>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          {error && (
            <div className="text-sm text-hazard-600 bg-hazard-50 border border-hazard-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="label-sm">Full Name</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="input-field" placeholder="Your full name" />
          </div>
          <div>
            <label className="label-sm">Display Name <span className="text-concrete-400 font-normal">(optional)</span></label>
            <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              className="input-field" placeholder="Preferred name shown in greetings" />
          </div>
          <div>
            <label className="label-sm flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Phone Number <span className="text-concrete-400 font-normal">(optional)</span>
            </label>
            <input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
              className="input-field" placeholder="(704) 555-0000" type="tel" />
          </div>
          <div>
            <label className="label-sm flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Contact Address <span className="text-concrete-400 font-normal">(optional)</span>
            </label>
            <input value={form.contact_address} onChange={e => setForm(f => ({ ...f, contact_address: e.target.value }))}
              className="input-field" placeholder="123 Main St, Charlotte, NC 28202" />
          </div>
          <div>
            <label className="label-sm flex items-center gap-1.5">
              <Hash className="w-3 h-3" /> EIN <span className="text-concrete-400 font-normal">(optional — e.g. 12-3456789)</span>
            </label>
            <input value={form.ein} onChange={e => setForm(f => ({ ...f, ein: e.target.value }))}
              className="input-field" placeholder="12-3456789" maxLength={20} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-4 py-2">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-0">
          <Row label="Full Name" value={profile?.full_name || '—'} />
          {profile?.display_name && <Row label="Display Name" value={profile.display_name} />}
          <Row label="Email" value={profile?.email || '—'} />
          <Row label="Phone" value={profile?.phone_number || 'Not set'} />
          <Row label="Contact Address" value={profile?.contact_address || 'Not set'} />
          <Row label="EIN" value={profile?.ein || 'Not set'} />
          <Row label="Account Status" value={profile?.is_active ? 'Active' : 'Inactive'}
            cls={profile?.is_active ? 'text-site-600' : 'text-hazard-600'} />
          <Row label="Member Since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'} />
        </div>
      )}

      {saved && (
        <div className="mt-3 flex items-center gap-2 text-site-600 text-xs font-medium">
          <CheckCircle className="w-3.5 h-3.5" /> Profile updated
        </div>
      )}
    </div>
  );
}

// ── Account Security / Change Password section ────────────────────────────────

function AccountSecuritySection() {
  const { updatePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setForm({ current: '', next: '', confirm: '' });
    setError('');
    setSuccess(false);
    setOpen(false);
  }

  async function handleSave() {
    setError('');
    if (form.next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    const { error: err } = await updatePassword(form.next);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      setForm({ current: '', next: '', confirm: '' });
      setOpen(false);
    }
    setSaving(false);
  }

  return (
    <div className="card p-5">
      <SectionHeader icon={Lock} title="Account Security" />

      <div className="flex items-center justify-between py-3 border-b border-concrete-50">
        <div>
          <p className="text-sm font-medium text-concrete-800">Password</p>
          <p className="text-xs text-concrete-400">Change your account password</p>
        </div>
        <button
          onClick={() => { setOpen(o => !o); setError(''); setSuccess(false); }}
          className="text-xs font-semibold text-steel-600 hover:text-steel-800 border border-steel-200 hover:border-steel-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          {open ? 'Cancel' : 'Change Password'}
        </button>
      </div>

      {success && (
        <div className="mt-3 flex items-center gap-2 text-site-600 text-sm font-medium bg-site-50 border border-site-200 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> Password updated successfully.
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          {error && (
            <div className="text-sm text-hazard-600 bg-hazard-50 border border-hazard-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="label-sm">New Password</label>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                value={form.next}
                onChange={e => setForm(f => ({ ...f, next: e.target.value }))}
                className="input-field pr-10"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowNext(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-concrete-400 hover:text-concrete-600 transition-colors" tabIndex={-1}>
                {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.next.length > 0 && form.next.length < 8 && (
              <p className="text-xs text-amber-600 mt-1">Must be at least 8 characters</p>
            )}
          </div>
          <div>
            <label className="label-sm">Confirm New Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className="input-field pr-10"
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-concrete-400 hover:text-concrete-600 transition-colors" tabIndex={-1}>
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.confirm.length > 0 && form.next !== form.confirm && (
              <p className="text-xs text-hazard-600 mt-1">Passwords do not match</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !form.next || !form.confirm}
              className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
            >
              {saving ? 'Updating...' : 'Update Password'}
            </button>
            <button onClick={reset} className="btn-ghost text-xs px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="pt-3 mt-1">
        <p className="text-xs text-concrete-400">
          Passwords are managed securely and are never stored or visible in the application.
          If you forgot your password, use the <span className="font-medium text-concrete-600">Forgot Password</span> link on the sign-in page.
        </p>
      </div>
    </div>
  );
}

// ── Notification Preferences section ─────────────────────────────────────────

function NotificationSection() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<Partial<NotificationPreferences>>(blank());
  const [prefLoading, setPrefLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (profile) loadPrefs(); }, [profile]);

  async function loadPrefs() {
    setPrefLoading(true);
    const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', profile!.id).maybeSingle();
    if (data) setPrefs(data);
    setPrefLoading(false);
  }

  async function savePrefs() {
    setSaving(true);
    const { data: existing } = await supabase.from('notification_preferences').select('id').eq('user_id', profile!.id).maybeSingle();
    if (existing) {
      await supabase.from('notification_preferences').update({ ...prefs, updated_at: new Date().toISOString() }).eq('user_id', profile!.id);
    } else {
      await supabase.from('notification_preferences').insert({ ...prefs, user_id: profile!.id });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const tp = (k: keyof NotificationPreferences) => (v: boolean) => setPrefs(prev => ({ ...prev, [k]: v }));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeader icon={Bell} title="Notification Preferences" />
        <button onClick={savePrefs} disabled={saving || prefLoading} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
          {saved ? <><CheckCircle className="w-3.5 h-3.5" /> Saved</> : saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {prefLoading ? (
        <div className="text-sm text-concrete-400 py-4 text-center">Loading preferences...</div>
      ) : (
        <div>
          <Toggle
            checked={!!prefs.notifications_enabled}
            onChange={tp('notifications_enabled')}
            label="Enable Notifications"
            sublabel="Master switch for all notifications"
          />
          <div className={`transition-opacity mt-2 ${prefs.notifications_enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <p className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-2 mt-3">Delivery Method</p>
            <Toggle checked={!!prefs.email_notifications} onChange={tp('email_notifications')} label="Email Notifications" sublabel="Receive alerts via email" />
            <Toggle checked={!!prefs.sms_notifications} onChange={tp('sms_notifications')} label="SMS Notifications" sublabel="Text message alerts (simulated in MVP)" />
            <div className="flex items-center justify-between py-3 border-b border-concrete-50">
              <div>
                <p className="text-sm font-medium text-concrete-800">Preferred Method</p>
                <p className="text-xs text-concrete-400">Which channel to prioritize</p>
              </div>
              <select
                value={prefs.preferred_method || 'email'}
                onChange={e => setPrefs(prev => ({ ...prev, preferred_method: e.target.value }))}
                className="text-xs border border-concrete-200 rounded-lg px-2 py-1 bg-white text-concrete-700 focus:outline-none focus:border-steel-400"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="both">Both</option>
              </select>
            </div>
            <p className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-2 mt-4">Notify Me When</p>
            <Toggle checked={!!prefs.notify_on_delay} onChange={tp('notify_on_delay')} label="Delay Added" sublabel="Task or project is delayed" />
            <Toggle checked={!!prefs.notify_on_inspection} onChange={tp('notify_on_inspection')} label="Inspection Scheduled or Failed" sublabel="Inspection status changes" />
            <Toggle checked={!!prefs.notify_on_payment_due} onChange={tp('notify_on_payment_due')} label="Payment Due" sublabel="Milestone approaching or overdue" />
            <Toggle checked={!!prefs.notify_on_client_decision} onChange={tp('notify_on_client_decision')} label="Client Decision Needed" sublabel="New client decisions requested" />
            <Toggle checked={!!prefs.notify_on_daily_update} onChange={tp('notify_on_daily_update')} label="Daily Update Submitted" sublabel="When crew submits a daily update" />
            <div className="pt-3 mt-2 border-t border-concrete-100">
              <p className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-3">Quiet Hours</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-sm">Start</label>
                  <input type="time" className="input-field" value={prefs.quiet_hours_start || ''} onChange={e => setPrefs(prev => ({ ...prev, quiet_hours_start: e.target.value || null }))} />
                </div>
                <div>
                  <label className="label-sm">End</label>
                  <input type="time" className="input-field" value={prefs.quiet_hours_end || ''} onChange={e => setPrefs(prev => ({ ...prev, quiet_hours_end: e.target.value || null }))} />
                </div>
              </div>
              <p className="text-xs text-concrete-400 mt-2">No notifications will be sent during quiet hours.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Permissions section ───────────────────────────────────────────────────────

function PermissionsSection() {
  const { profile } = useAuth();
  return (
    <div className="card p-5">
      <SectionHeader icon={Shield} title="Your Permissions" />
      <div className="text-sm text-concrete-600 space-y-1.5">
        {profile?.role === 'CONVAZANT_SUPER_ADMIN' && (<><p>- Full access to all projects, users, and settings</p><p>- Can manage all workspaces</p><p>- Can create, approve, and delete any record</p></>)}
        {profile?.role === 'DECKARC_ADMIN' && (<><p>- Full access to all projects in this workspace</p><p>- Can create, edit, and manage projects and users</p><p>- Can approve schedule change requests</p><p>- Can generate all reports and AI summaries</p></>)}
        {profile?.role === 'GENERAL_CONTRACTOR' && (<><p>- Can view assigned projects</p><p>- Can update tasks, permits, and inspections</p><p>- Schedule changes require admin approval</p><p>- Can submit daily updates</p></>)}
        {profile?.role === 'SUBCONTRACTOR' && (<><p>- Can view assigned tasks</p><p>- Can submit daily updates via Field Mode</p><p>- Cannot view financial or admin-only data</p></>)}
        {profile?.role === 'CLIENT' && (<><p>- Can view simplified project progress</p><p>- Can see milestones and client decisions</p><p>- Cannot see internal notes or sensitive details</p></>)}
      </div>
    </div>
  );
}

// ── App Info section ──────────────────────────────────────────────────────────

function AppInfoSection() {
  return (
    <div className="card p-5">
      <SectionHeader icon={Building2} title="Application Info" />
      <div className="space-y-0 text-sm">
        {([
          ['Product', 'ConstructionProgress360', ''],
          ['Short Name', 'CP360', ''],
          ['Version', 'MVP 2.0', ''],
          ['AI-Enabled', 'Yes — Summaries + Confidence Scoring', 'text-site-600'],
        ] as [string, string, string][]).map(([k, v, cls]) => (
          <Row key={k} label={k} value={v} cls={cls} />
        ))}
      </div>
    </div>
  );
}

// ── Coming Soon panel ─────────────────────────────────────────────────────────

function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
        <Construction className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
        This section is not yet available. Check back soon.
      </p>
    </div>
  );
}

// ── Settings nav structure ────────────────────────────────────────────────────

type SettingsTab =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'permissions'
  | 'company-info'
  | 'business-docs'
  | 'workday-exceptions'
  | 'communications'
  | 'quickbooks'
  | 'calendar'
  | 'google-drive'
  | 'zapier'
  | 'company-logo'
  | 'doc-header-logo'
  | 'estimate-header'
  | 'contract-footer'
  | 'license-info'
  | 'insurance-coi'
  | 'business-registration'
  | 'tax-ein'
  | 'app-info'
  | 'sign-out';

interface TabItem {
  id: SettingsTab;
  label: string;
  live?: boolean;
}

interface TabGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  defaultOpen: boolean;
  adminOnly?: boolean;
  items: TabItem[];
}

const tabGroups: TabGroup[] = [
  {
    id: 'account',
    label: 'Account Settings',
    icon: User,
    defaultOpen: true,
    items: [
      { id: 'profile',       label: 'Profile',       live: true },
      { id: 'security',      label: 'Security',      live: true },
      { id: 'notifications', label: 'Notifications', live: true },
      { id: 'permissions',   label: 'Permissions',   live: true },
    ],
  },
  {
    id: 'company',
    label: 'Company Settings',
    icon: Building2,
    defaultOpen: true,
    adminOnly: true,
    items: [
      { id: 'company-info',       label: 'Company Info' },
      { id: 'business-docs',      label: 'Business Documents' },
      { id: 'workday-exceptions', label: 'Workday Exceptions' },
      { id: 'communications',     label: 'Communications' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Layers,
    defaultOpen: true,
    adminOnly: true,
    items: [
      { id: 'quickbooks',   label: 'QuickBooks Online' },
      { id: 'calendar',     label: 'Calendar' },
      { id: 'google-drive', label: 'Google Drive' },
      { id: 'zapier',       label: 'Zapier' },
    ],
  },
  {
    id: 'branding',
    label: 'Branding & Documents',
    icon: Palette,
    defaultOpen: true,
    adminOnly: true,
    items: [
      { id: 'company-logo',    label: 'Company Logo' },
      { id: 'doc-header-logo', label: 'Document Header Logo' },
      { id: 'estimate-header', label: 'Estimate / Invoice Header' },
      { id: 'contract-footer', label: 'Contract Footer' },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: ClipboardCheck,
    defaultOpen: true,
    adminOnly: true,
    items: [
      { id: 'license-info',          label: 'License Info' },
      { id: 'insurance-coi',         label: 'Insurance / COI' },
      { id: 'business-registration', label: 'Business Registration' },
      { id: 'tax-ein',               label: 'Tax / EIN Info' },
    ],
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    defaultOpen: true,
    items: [
      { id: 'app-info',  label: 'Application Info', live: true },
      { id: 'sign-out',  label: 'Sign Out',          live: true },
    ],
  },
];

// ── Tab subtitle map ──────────────────────────────────────────────────────────

const tabSubtitles: Partial<Record<SettingsTab, string>> = {
  profile:       'Manage your personal information and contact details.',
  security:      'Update your password and account security options.',
  notifications: 'Choose how and when you receive notifications.',
  permissions:   'Your current access level and role permissions.',
  'app-info':    'Version and platform information.',
  'sign-out':    'End your current session.',
};

// ── Main SettingsPage ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { profile, signOut } = useAuth();

  const isAdmin =
    profile?.role === 'DECKARC_ADMIN' ||
    profile?.role === 'CONVAZANT_SUPER_ADMIN';

  const visibleGroups = tabGroups.filter(g => !g.adminOnly || isAdmin);
  const firstTab = visibleGroups[0]?.items[0]?.id ?? 'profile';

  const [activeTab, setActiveTab] = useState<SettingsTab>(firstTab);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(tabGroups.map(g => [g.id, g.defaultOpen]))
  );

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const allItems = visibleGroups.flatMap(g => g.items);
  const activeItem = allItems.find(i => i.id === activeTab);

  function renderContent() {
    switch (activeTab) {
      case 'profile':       return <PersonalInfoSection />;
      case 'security':      return <AccountSecuritySection />;
      case 'notifications': return <NotificationSection />;
      case 'permissions':   return <PermissionsSection />;
      case 'app-info':      return <AppInfoSection />;
      case 'sign-out':
        return (
          <div className="card p-5 flex flex-col items-start gap-4">
            <SectionHeader icon={LogOut} title="Sign Out" />
            <p className="text-sm text-concrete-500">You will be returned to the sign-in page.</p>
            <button
              onClick={signOut}
              className="py-2.5 px-5 text-sm font-medium text-hazard-600 border border-hazard-200 rounded-xl hover:bg-hazard-50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        );
      default:
        return <ComingSoonPanel label={activeItem?.label ?? String(activeTab)} />;
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Settings sidebar ── */}
      <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <p className="text-[13px] font-semibold text-slate-800 tracking-tight">Settings</p>
        </div>

        <nav className="flex-1 py-2 pb-6">
          {visibleGroups.map(group => {
            const Icon = group.icon;
            const open = openGroups[group.id] ?? group.defaultOpen;

            return (
              <div key={group.id} className="mt-3 first:mt-2">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors duration-100 hover:bg-slate-50 group"
                >
                  <Icon
                    className="w-[13px] h-[13px] flex-shrink-0 text-slate-400 group-hover:text-slate-500"
                    strokeWidth={1.75}
                  />
                  <span className="flex-1 text-[12px] font-medium text-slate-500 group-hover:text-slate-700 leading-none">
                    {group.label}
                  </span>
                  {open
                    ? <ChevronDown className="w-3 h-3 text-slate-300 flex-shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  }
                </button>

                {open && (
                  <div className="relative ml-[23px] mt-0.5 mb-1">
                    {/* Vertical tree line */}
                    <span className="absolute left-0 top-1 bottom-1 w-px bg-slate-100" />

                    {group.items.map(item => {
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          className={`w-full text-left pl-4 pr-3 py-[5px] text-[13px] transition-colors duration-100 relative ${
                            active
                              ? 'text-slate-900 font-medium'
                              : item.live
                                ? 'text-slate-500 hover:text-slate-900'
                                : 'text-slate-400 hover:text-slate-500'
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-[4px] bottom-[4px] w-px bg-slate-500" />
                          )}
                          <span className="leading-snug">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-50">
        {/* Content header */}
        <div className="bg-white border-b border-slate-100 px-8 py-5 flex-shrink-0">
          <div className="max-w-2xl">
            <h2 className="text-[15px] font-semibold text-slate-800 leading-tight">
              {activeItem?.label ?? 'Settings'}
            </h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {tabSubtitles[activeTab] ?? 'This section is coming soon.'}
            </p>
          </div>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
