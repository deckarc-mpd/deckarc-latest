import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { HardHat, AlertCircle, ChevronRight, Eye, EyeOff, X, CheckCircle, Building2, Users, Mail } from 'lucide-react';

type LoginView = 'login' | 'request-access' | 'request-workspace' | 'forgot-password';

const REQUESTED_ROLES = [
  'General Contractor',
  'Subcontractor',
  'Client / Homeowner',
  'Supplier / Vendor',
  'Internal Team Member',
  'Other',
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const [view, setView] = useState<LoginView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message || 'Invalid email or password. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 bg-steel-950 px-12 py-10 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(255,255,255,0.015) 20px, rgba(255,255,255,0.015) 21px)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `linear-gradient(rgba(56,114,188,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,114,188,0.08) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-steel-500 rounded-xl flex items-center justify-center shadow-md">
              <HardHat className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white tracking-tight">CP360</span>
                <span className="text-[10px] font-bold bg-amber-500 text-concrete-950 px-1.5 py-0.5 rounded leading-none tracking-wide">AI</span>
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4 tracking-tight">
            Construction<br />
            <span className="text-steel-400">Progress360</span>
          </h1>
          <p className="text-steel-300 text-base leading-relaxed mb-10 font-light">
            AI-enabled project intelligence for high-performance contractors. Track every phase, milestone, and field update in one place.
          </p>
          <div className="space-y-3">
            {[
              'Real-time task & milestone tracking',
              'AI-generated internal + client reports',
              'Permit, inspection & delay management',
              'Role-based access for your entire team',
            ].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-steel-500/30 border border-steel-500/50 flex items-center justify-center flex-shrink-0">
                  <ChevronRight className="w-3 h-3 text-steel-400" />
                </div>
                <span className="text-sm text-steel-300 font-medium">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10">
          <p className="text-steel-500 text-xs font-medium">
            CP360 — <span className="text-steel-300">A CONVAZANT Product</span>
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-concrete-50 px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-steel-800 rounded-2xl mb-3 shadow-md">
              <HardHat className="w-7 h-7 text-white" strokeWidth={2} />
            </div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-concrete-900">ConstructionProgress360</h1>
              <span className="text-[10px] font-bold bg-amber-500 text-concrete-950 px-1.5 py-0.5 rounded leading-none">AI</span>
            </div>
            <p className="text-sm text-concrete-500">CP360 — A CONVAZANT Product</p>
          </div>

          {view === 'login' && (
            <LoginForm
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              error={error}
              loading={loading}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              handleSubmit={handleSubmit}
              onRequestAccess={() => setView('request-access')}
              onRequestWorkspace={() => setView('request-workspace')}
              onForgotPassword={() => setView('forgot-password')}
            />
          )}

          {view === 'request-access' && (
            <RequestAccessForm
              submitted={submitted}
              setSubmitted={setSubmitted}
              onBack={() => { setView('login'); setSubmitted(false); }}
            />
          )}

          {view === 'request-workspace' && (
            <RequestWorkspaceForm
              submitted={submitted}
              setSubmitted={setSubmitted}
              onBack={() => { setView('login'); setSubmitted(false); }}
            />
          )}

          {view === 'forgot-password' && (
            <ForgotPasswordForm
              onBack={() => setView('login')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({
  email, setEmail, password, setPassword, error, loading, showPassword, setShowPassword,
  handleSubmit, onRequestAccess, onRequestWorkspace, onForgotPassword,
}: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  error: string; loading: boolean;
  showPassword: boolean; setShowPassword: (v: boolean) => void;
  handleSubmit: (e: FormEvent) => void;
  onRequestAccess: () => void;
  onRequestWorkspace: () => void;
  onForgotPassword: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-concrete-900 mb-1">Welcome back</h2>
        <p className="text-sm text-concrete-500">Sign in to your CP360 workspace</p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-hazard-50 border border-hazard-200 text-hazard-700 text-sm rounded-xl px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-concrete-600 mb-1.5">Email Address</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com" required className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-concrete-600 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              required className="input-field pr-10"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-concrete-400 hover:text-concrete-600 transition-colors" tabIndex={-1}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-1">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Signing in...
            </span>
          ) : 'Sign In'}
        </button>
      </form>

      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-xs text-concrete-400 hover:text-steel-600 transition-colors"
        >
          Forgot your password?
        </button>
      </div>

      {/* Request access / workspace */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          onClick={onRequestAccess}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-concrete-500 hover:text-steel-700 hover:bg-concrete-50 border border-concrete-200 rounded-xl py-2.5 px-3 transition-all"
        >
          <Users className="w-3.5 h-3.5" />
          Request Access
        </button>
        <button
          onClick={onRequestWorkspace}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-concrete-500 hover:text-steel-700 hover:bg-concrete-50 border border-concrete-200 rounded-xl py-2.5 px-3 transition-all"
        >
          <Building2 className="w-3.5 h-3.5" />
          Request CP360
        </button>
      </div>

      <div className="mt-6 pt-5 border-t border-concrete-100">
        <p className="text-[11px] font-semibold text-concrete-400 uppercase tracking-widest mb-3">Test Accounts</p>
        <div className="space-y-1.5">
          {[
            { email: 'convazant.admin@test.com', label: 'CONVAZANT Admin' },
            { email: 'deckarc.admin@test.com',   label: 'DECKARC Admin' },
            { email: 'gc@test.com',              label: 'General Contractor' },
            { email: 'subcontractor@test.com',   label: 'Subcontractor' },
            { email: 'client@test.com',          label: 'Client' },
          ].map(a => (
            <button
              key={a.email}
              type="button"
              onClick={() => { setEmail(a.email); setPassword('Test1234!'); }}
              className="w-full flex items-center justify-between text-xs text-concrete-500 hover:text-concrete-800 hover:bg-concrete-50 px-2.5 py-1.5 rounded-lg transition-colors text-left group"
            >
              <span className="font-mono">{a.email}</span>
              <span className="text-concrete-400 group-hover:text-steel-600 font-medium">{a.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-concrete-400 text-center pt-1">
          Password: <span className="font-mono font-semibold text-concrete-600">Test1234!</span>
        </p>
      </div>
    </div>
  );
}

function RequestAccessForm({ submitted, setSubmitted, onBack }: {
  submitted: boolean; setSubmitted: (v: boolean) => void; onBack: () => void;
}) {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', company_name: '',
    requested_role: '', existing_workspace_name: '', project_or_client_name: '',
    reason: '', message: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('access_requests').insert(form);
    if (err) { setError(err.message); } else { setSubmitted(true); }
    setSaving(false);
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-8 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-concrete-900 mb-2">Request Submitted</h2>
        <p className="text-sm text-concrete-500 mb-6">Your access request has been submitted. A DECKARC Admin will review it and contact you at the email provided.</p>
        <button onClick={onBack} className="btn-primary text-sm px-5 py-2.5">Return to Login</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-concrete-900">Request Access</h2>
          <p className="text-xs text-concrete-500 mt-0.5">For users who belong to an existing company or project</p>
        </div>
        <button onClick={onBack} className="p-1.5 hover:bg-concrete-100 rounded-lg text-concrete-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-hazard-50 border border-hazard-200 text-hazard-700 text-sm rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Full Name *" value={form.full_name} onChange={v => update('full_name', v)} placeholder="Your full name" required />
        <Field label="Email *" type="email" value={form.email} onChange={v => update('email', v)} placeholder="you@company.com" required />
        <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} placeholder="(704) 555-0000" />
        <Field label="Company Name" value={form.company_name} onChange={v => update('company_name', v)} placeholder="Your company" />
        <div>
          <label className="block text-sm font-medium text-concrete-600 mb-1.5">Requested Role *</label>
          <select value={form.requested_role} onChange={e => update('requested_role', e.target.value)} className="input-field text-sm" required>
            <option value="">Select a role...</option>
            {REQUESTED_ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <Field label="Existing Workspace / Company Name" value={form.existing_workspace_name} onChange={v => update('existing_workspace_name', v)} placeholder="e.g. DECKARC LLC" />
        <Field label="Project or Client Name" value={form.project_or_client_name} onChange={v => update('project_or_client_name', v)} placeholder="Project or client you're associated with" />
        <div>
          <label className="block text-sm font-medium text-concrete-600 mb-1.5">Reason for Access</label>
          <textarea value={form.message} onChange={e => update('message', e.target.value)} rows={2} className="input-field text-sm w-full resize-none" placeholder="Briefly explain why you need access..." />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-sm font-semibold">
          {saving ? 'Submitting...' : 'Submit Access Request'}
        </button>
      </form>
    </div>
  );
}

function RequestWorkspaceForm({ submitted, setSubmitted, onBack }: {
  submitted: boolean; setSubmitted: (v: boolean) => void; onBack: () => void;
}) {
  const [form, setForm] = useState({
    company_name: '', owner_full_name: '', owner_email: '', phone: '',
    website: '', business_type: '', service_area: '',
    active_project_count: '', expected_user_count: '', message: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('workspace_requests').insert(form);
    if (err) { setError(err.message); } else { setSubmitted(true); }
    setSaving(false);
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-8 text-center">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-concrete-900 mb-2">Workspace Request Submitted</h2>
        <p className="text-sm text-concrete-500 mb-6">Your request for a CP360 workspace has been submitted to CONVAZANT INC for review. You will be contacted at the email provided.</p>
        <button onClick={onBack} className="btn-primary text-sm px-5 py-2.5">Return to Login</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-concrete-900">Request CP360 Workspace</h2>
          <p className="text-xs text-concrete-500 mt-0.5">For new contracting companies wanting to use CP360</p>
        </div>
        <button onClick={onBack} className="p-1.5 hover:bg-concrete-100 rounded-lg text-concrete-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-hazard-50 border border-hazard-200 text-hazard-700 text-sm rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Company Name *" value={form.company_name} onChange={v => update('company_name', v)} placeholder="Your company name" required />
        <Field label="Owner / Admin Full Name *" value={form.owner_full_name} onChange={v => update('owner_full_name', v)} placeholder="Your full name" required />
        <Field label="Owner / Admin Email *" type="email" value={form.owner_email} onChange={v => update('owner_email', v)} placeholder="admin@yourcompany.com" required />
        <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} placeholder="(704) 555-0000" />
        <Field label="Company Website (optional)" value={form.website} onChange={v => update('website', v)} placeholder="https://yourcompany.com" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business Type" value={form.business_type} onChange={v => update('business_type', v)} placeholder="e.g. General Contractor" />
          <Field label="Service Area" value={form.service_area} onChange={v => update('service_area', v)} placeholder="e.g. Charlotte, NC" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Active Projects" value={form.active_project_count} onChange={v => update('active_project_count', v)} placeholder="e.g. 5-10" />
          <Field label="Expected Users" value={form.expected_user_count} onChange={v => update('expected_user_count', v)} placeholder="e.g. 10-25" />
        </div>
        <div>
          <label className="block text-sm font-medium text-concrete-600 mb-1.5">Message</label>
          <textarea value={form.message} onChange={e => update('message', e.target.value)} rows={2} className="input-field text-sm w-full resize-none" placeholder="Tell us about your company and how you'd use CP360..." />
        </div>
        <p className="text-[11px] text-concrete-400">
          Only CONVAZANT Super Admin can approve workspace requests. You will be notified by email upon review.
        </p>
        <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-sm font-semibold">
          {saving ? 'Submitting...' : 'Submit Workspace Request'}
        </button>
      </form>
    </div>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-8 text-center">
        <div className="w-12 h-12 bg-site-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-site-600" />
        </div>
        <h2 className="text-lg font-bold text-concrete-900 mb-2">Check your email</h2>
        <p className="text-sm text-concrete-500 mb-1">A password reset link has been sent to</p>
        <p className="text-sm font-semibold text-concrete-800 mb-6">{email}</p>
        <p className="text-xs text-concrete-400 mb-6">Click the link in the email to set a new password. If you don't see it, check your spam folder.</p>
        <button onClick={onBack} className="btn-primary text-sm px-5 py-2.5">Back to Sign In</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-concrete-200 shadow-card p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-concrete-900 mb-1">Reset Password</h2>
          <p className="text-sm text-concrete-500">Enter your email to receive a reset link</p>
        </div>
        <button onClick={onBack} className="p-1.5 hover:bg-concrete-100 rounded-lg text-concrete-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-hazard-50 border border-hazard-200 text-hazard-700 text-sm rounded-xl px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-concrete-600 mb-1.5">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-concrete-400 pointer-events-none" />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com" required
              className="input-field pl-9"
            />
          </div>
        </div>
        <button type="submit" disabled={loading || !email} className="btn-primary w-full py-3 disabled:opacity-50">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Sending...
            </span>
          ) : 'Send Reset Link'}
        </button>
      </form>
      <div className="mt-4 text-center">
        <button onClick={onBack} className="text-xs text-concrete-400 hover:text-steel-600 transition-colors">
          Back to Sign In
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-concrete-600 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        required={required} className="input-field text-sm" />
    </div>
  );
}
