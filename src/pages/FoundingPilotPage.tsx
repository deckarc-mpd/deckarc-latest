import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Calendar, AlertTriangle, ArrowRight, Play, Check,
  ChevronDown, ChevronUp, Menu, X, Clock, Layers,
  Users, Home, FileText, Zap, Shield, Image,
} from 'lucide-react';

function HardHatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20" />
      <path d="M4 20v-4a8 8 0 1 1 16 0v4" />
      <path d="M12 4v4" />
      <path d="M4 12h16" />
    </svg>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONTRACTOR_TYPES = [
  'Remodeler',
  'Room Addition Contractor',
  'Kitchen/Bath Remodeler',
  'Design-Build Firm',
  'Deck/Porch Contractor',
  'Outdoor Living Contractor',
  'Small Custom Builder',
  'Other',
];

const ACTIVE_PROJECT_RANGES = ['1–2', '3–5', '6–10', '11–15', '16+'];

const CHALLENGES = [
  'Chasing field updates',
  'Homeowner communication',
  'Schedule delays',
  'Permits/inspections',
  'Photos/files scattered',
  "Tomorrow's work unclear",
  'Other',
];

const FAQS = [
  {
    q: 'Is CP360 another project management software?',
    a: 'No. CP360 is not trying to replace every construction tool you use. It is focused on the daily operating rhythm: what changed yesterday, what needs attention today, what could delay tomorrow, and what the homeowner can safely see.',
  },
  {
    q: 'Do I need to move all my projects immediately?',
    a: 'No. The Founding Pilot starts with one live project so setup is simple, measurable, and low-risk.',
  },
  {
    q: 'Do homeowners and subcontractors cost extra?',
    a: 'No. For the Founding Pilot, homeowner and subcontractor access is included.',
  },
  {
    q: 'Will my team need to learn a complicated system?',
    a: "No. CP360 is designed to make updates, blockers, and Tomorrow's Plan easier to follow, not harder.",
  },
  {
    q: 'How fast can we get started?',
    a: 'For founding customers, we help organize one live project within 7 days so your team can start using CP360 without reworking your whole business.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'CP360 is currently web-based and works on desktop, tablet, and mobile browser. For the Founding Pilot, we are focusing on a simple mobile-friendly web experience before building native iOS or Android apps.',
  },
  {
    q: 'Who is CP360 best for?',
    a: 'CP360 is best for owner-led remodelers and addition contractors managing 3–15 active projects where the owner is still the main communication hub between the field team and the homeowner.',
  },
  {
    q: 'Is this for large commercial contractors?',
    a: 'Not right now. CP360 is built first for small residential contractors who need daily project clarity without enterprise complexity.',
  },
  {
    q: 'What happens after 90 days?',
    a: 'Founding customers can continue with locked founder pricing for 12 months, and we can expand CP360 to more projects if it is helping your workflow.',
  },
];

// ── Shared form utilities ────────────────────────────────────────────────────

const INP = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-colors';
const LBL = 'block text-sm font-medium text-slate-700 mb-1.5';

async function saveLead(payload: Record<string, string>): Promise<{ id?: string; error?: string }> {
  console.log('[CP360 Lead Capture] lead_type submitted:', payload.lead_type);
  console.log('[CP360 Lead Capture] payload:', payload);

  // Do not chain .select() — the landing page is unauthenticated (anon) and the
  // SELECT RLS policy only allows authenticated users. A plain insert is sufficient.
  const { error } = await supabase
    .from('cp360_leads')
    .insert(payload);

  if (error) {
    console.error('[CP360 Lead Capture] save error:', error.message);
    return { error: error.message };
  }

  console.log('[CP360 Lead Capture] Lead submitted successfully.');
  return {};
}

// ── SuccessView ───────────────────────────────────────────────────────────────

function SuccessView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="p-8 text-center">
      <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <Check className="w-7 h-7 text-emerald-600" />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">Application Received</h3>
      <p className="text-slate-600 text-sm leading-relaxed mb-6">{message}</p>
      <button onClick={onClose} className="lp-btn-primary">Close</button>
    </div>
  );
}

// ── Apply Modal (full application) ───────────────────────────────────────────

function ApplyModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    full_name: '', company_name: '', email: '', phone: '',
    website: '', city_state: '', contractor_type: '',
    active_projects: '', biggest_challenge: '', pilot_project_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const { error: err } = await saveLead({
      full_name: form.full_name.trim(),
      company_name: form.company_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      website: form.website.trim(),
      city_state: form.city_state.trim(),
      contractor_type: form.contractor_type,
      active_projects: form.active_projects,
      biggest_challenge: form.biggest_challenge,
      pilot_project_notes: form.pilot_project_notes.trim(),
      lead_type: 'founding_pilot_application',
      source: 'founding-pilot',
    });

    if (err) {
      setError('Something went wrong. Please try again or email us directly.');
      setSaving(false);
      return;
    }

    setSaving(false);
    setSubmitted(true);
  }

  const canSubmit = form.full_name.trim() && form.company_name.trim() && form.email.trim();

  return (
    <ModalShell
      title="Apply for CP360 Founding Pilot"
      subtitle="3 spots available. We'll contact you within 24 hours."
      onClose={onClose}
    >
      {submitted ? (
        <SuccessView
          message="Thank you. We'll contact you to schedule your CP360 walkthrough."
          onClose={onClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Full Name *</label>
              <input required value={form.full_name} onChange={e => set('full_name', e.target.value)} className={INP} placeholder="Jane Smith" />
            </div>
            <div>
              <label className={LBL}>Company Name *</label>
              <input required value={form.company_name} onChange={e => set('company_name', e.target.value)} className={INP} placeholder="Smith Remodeling LLC" />
            </div>
            <div>
              <label className={LBL}>Email *</label>
              <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INP} placeholder="jane@smithremodeling.com" />
            </div>
            <div>
              <label className={LBL}>Phone</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={INP} placeholder="(704) 555-0100" />
            </div>
            <div>
              <label className={LBL}>Website</label>
              <input value={form.website} onChange={e => set('website', e.target.value)} className={INP} placeholder="www.smithremodeling.com" />
            </div>
            <div>
              <label className={LBL}>City / State</label>
              <input value={form.city_state} onChange={e => set('city_state', e.target.value)} className={INP} placeholder="Charlotte, NC" />
            </div>
            <div>
              <label className={LBL}>Contractor Type</label>
              <select value={form.contractor_type} onChange={e => set('contractor_type', e.target.value)} className={INP}>
                <option value="">Select...</option>
                {CONTRACTOR_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LBL}>Number of Active Projects</label>
              <select value={form.active_projects} onChange={e => set('active_projects', e.target.value)} className={INP}>
                <option value="">Select range...</option>
                {ACTIVE_PROJECT_RANGES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>Biggest Coordination Challenge</label>
              <select value={form.biggest_challenge} onChange={e => set('biggest_challenge', e.target.value)} className={INP}>
                <option value="">Select...</option>
                {CHALLENGES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>One live project you may want to test CP360 on</label>
              <textarea
                rows={3}
                value={form.pilot_project_notes}
                onChange={e => set('pilot_project_notes', e.target.value)}
                className={`${INP} resize-none`}
                placeholder="e.g. 1,200 sq ft addition in Concord, NC — currently in framing phase..."
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="lp-btn-ghost">Cancel</button>
            <button type="submit" disabled={saving || !canSubmit} className="lp-btn-primary">
              {saving ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ── Walkthrough Modal (shorter) ───────────────────────────────────────────────

function WalkthroughModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    full_name: '', company_name: '', email: '', phone: '',
    website: '', active_projects: '', biggest_challenge: '', preferred_time: '',
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const { error: err } = await saveLead({
      full_name: form.full_name.trim(),
      company_name: form.company_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      website: form.website.trim(),
      active_projects: form.active_projects,
      biggest_challenge: form.biggest_challenge,
      preferred_time: form.preferred_time.trim(),
      lead_type: 'walkthrough_request',
      source: 'founding-pilot',
    });

    if (err) {
      setError('Something went wrong. Please try again or email us directly.');
      setSaving(false);
      return;
    }

    setSaving(false);
    setSubmitted(true);
  }

  const canSubmit = form.full_name.trim() && form.company_name.trim() && form.email.trim();

  return (
    <ModalShell
      title="Book a 10-Minute CP360 Walkthrough"
      subtitle="We'll show you how CP360 works on one live project."
      onClose={onClose}
    >
      {submitted ? (
        <SuccessView
          message="Thank you. We'll contact you to schedule your 10-minute CP360 walkthrough."
          onClose={onClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Full Name *</label>
              <input required value={form.full_name} onChange={e => set('full_name', e.target.value)} className={INP} placeholder="Jane Smith" />
            </div>
            <div>
              <label className={LBL}>Company Name *</label>
              <input required value={form.company_name} onChange={e => set('company_name', e.target.value)} className={INP} placeholder="Smith Remodeling LLC" />
            </div>
            <div>
              <label className={LBL}>Email *</label>
              <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INP} placeholder="jane@smithremodeling.com" />
            </div>
            <div>
              <label className={LBL}>Phone</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={INP} placeholder="(704) 555-0100" />
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>Website</label>
              <input value={form.website} onChange={e => set('website', e.target.value)} className={INP} placeholder="www.smithremodeling.com (optional)" />
            </div>
            <div>
              <label className={LBL}>Number of Active Projects</label>
              <select value={form.active_projects} onChange={e => set('active_projects', e.target.value)} className={INP}>
                <option value="">Select range...</option>
                {ACTIVE_PROJECT_RANGES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={LBL}>Biggest Coordination Challenge</label>
              <select value={form.biggest_challenge} onChange={e => set('biggest_challenge', e.target.value)} className={INP}>
                <option value="">Select...</option>
                {CHALLENGES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>Preferred Time / Availability</label>
              <input
                value={form.preferred_time}
                onChange={e => set('preferred_time', e.target.value)}
                className={INP}
                placeholder="e.g. Weekday mornings, Tuesday afternoons..."
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="lp-btn-ghost">Cancel</button>
            <button type="submit" disabled={saving || !canSubmit} className="lp-btn-primary">
              {saving ? 'Submitting...' : 'Request Walkthrough'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────

function ModalShell({
  title, subtitle, onClose, children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-2xl shadow-elevated w-full max-w-xl my-8">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ml-4 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── FAQ Item ──────────────────────────────────────────────────────────────────

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group hover:bg-slate-50/60 transition-colors rounded-lg px-1 -mx-1"
      >
        <span className="text-slate-800 font-medium text-[15px] leading-snug group-hover:text-slate-900 transition-colors">
          {q}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        }
      </button>
      {open && (
        <p className="pb-5 text-slate-600 text-[14px] leading-relaxed -mt-1 px-1">{a}</p>
      )}
    </div>
  );
}

// ── Product Mockup ────────────────────────────────────────────────────────────

function ProductMockup() {
  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="bg-white rounded-2xl shadow-elevated border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-4 py-2.5 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex-1 mx-3">
            <div className="bg-slate-700 rounded-md px-3 py-1 text-slate-400 text-[11px] text-center">
              CP360 — Daily Command Center
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3 bg-slate-50">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Yesterday', color: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400', items: ['3 updates logged', '2 photos added', '1 permit update'] },
              { label: 'Today', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', items: ['2 blockers open', '1 client question', 'Inspection @ 2pm'] },
              { label: 'Tomorrow', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', items: ['Framing crew', 'Materials on-site?', 'Client milestone'] },
            ].map(col => (
              <div key={col.label} className={`${col.color} border rounded-xl p-2.5`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                  <span className="text-[10px] font-semibold text-slate-700">{col.label}</span>
                </div>
                <div className="space-y-1">
                  {col.items.map(item => (
                    <div key={item} className="text-[9px] text-slate-600 bg-white/70 rounded px-1.5 py-0.5">{item}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" /> Action Board
              </span>
              <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">3 items</span>
            </div>
            <div className="space-y-1">
              {['Subfloor inspection blocked — waiting on permit', 'Client decision needed: tile selection', 'Material delivery delayed 2 days'].map(item => (
                <div key={item} className="flex items-start gap-1.5 text-[9px] text-slate-600">
                  <div className="w-1 h-1 rounded-full bg-red-400 mt-1 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Home className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-700">Client Portal</span>
              </div>
              <div className="text-[9px] text-emerald-600 font-medium">Live — 2 updates today</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Clean, client-safe view</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-700">Tomorrow's Plan</span>
              </div>
              <div className="text-[9px] text-slate-600">Crew arrives 7am</div>
              <div className="text-[9px] text-slate-500 mt-0.5">2 tasks need prep</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ModalMode = 'apply' | 'walkthrough' | null;

export default function FoundingPilotPage() {
  const [modal, setModal] = useState<ModalMode>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function openApply() { setModal('apply'); setMobileMenuOpen(false); }
  function openWalkthrough() { setModal('walkthrough'); setMobileMenuOpen(false); }
  function closeModal() { setModal(null); }

  const navLinks = [
    { label: 'How it Works', id: 'how-it-works' },
    { label: 'Founding Pilot', id: 'founding-pilot-offer' },
    { label: 'FAQ', id: 'faq' },
  ];

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800">
      <style>{`
        .lp-btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          background: #1e293b; color: #fff; font-weight: 600; font-size: 15px;
          padding: 12px 24px; border-radius: 12px; border: none; cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          white-space: nowrap; min-width: 0; line-height: 1.3;
        }
        .lp-btn-primary:hover { background: #0f172a; }
        .lp-btn-primary:active { transform: scale(0.98); }
        .lp-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .lp-btn-outline {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          background: transparent; color: #1e293b; font-weight: 600; font-size: 15px;
          padding: 11px 22px; border-radius: 12px; border: 2px solid #e2e8f0; cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          white-space: nowrap; min-width: 0; line-height: 1.3;
        }
        .lp-btn-outline:hover { border-color: #94a3b8; background: #f8fafc; }
        .lp-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center;
          background: transparent; color: #64748b; font-weight: 500; font-size: 14px;
          padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer;
          transition: background 0.15s, color 0.15s; white-space: nowrap;
        }
        .lp-btn-ghost:hover { background: #f1f5f9; color: #1e293b; }
        .lp-gold { color: #d97706; }
        .lp-section { padding: 80px 24px; }
        @media (min-width: 768px) { .lp-section { padding: 96px 32px; } }
        .lp-container { max-width: 1100px; margin: 0 auto; }
        .lp-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
          padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          transition: box-shadow 0.2s;
        }
        .lp-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); }
        .check-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
        .check-icon { width: 18px; height: 18px; background: #fef3c7; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
        /* CTA group: stacks on mobile, row on sm+ */
        .lp-cta-group { display: flex; flex-direction: column; gap: 12px; }
        .lp-cta-group .lp-btn-primary,
        .lp-cta-group .lp-btn-outline { width: 100%; justify-content: center; }
        @media (min-width: 640px) {
          .lp-cta-group { flex-direction: row; flex-wrap: wrap; }
          .lp-cta-group .lp-btn-primary,
          .lp-cta-group .lp-btn-outline { width: auto; }
        }
        .lp-cta-group-center { justify-content: center; }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="lp-container flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <span className="font-bold text-slate-900 text-[15px] tracking-tight">CP360</span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                {l.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center">
            <button onClick={openWalkthrough} className="lp-btn-primary" style={{ padding: '9px 18px', fontSize: '13px' }}>
              Book Walkthrough
            </button>
          </div>

          <button onClick={() => setMobileMenuOpen(o => !o)} className="md:hidden p-2 text-slate-600 hover:text-slate-900">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-2">
            {navLinks.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)} className="block w-full text-left py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                {l.label}
              </button>
            ))}
            <div className="pt-2 lp-cta-group">
              <button onClick={openWalkthrough} className="lp-btn-primary">Book a 10-Minute Walkthrough</button>
              <button onClick={openApply} className="lp-btn-outline">Apply for Founding Pilot</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ background: 'linear-gradient(160deg, #f8fafc 0%, #fff 60%)' }}>
        <div className="lp-container">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left max-w-xl">
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 mb-6">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[12px] font-semibold text-amber-700 uppercase tracking-wider">
                  Now accepting 3 founding pilot contractors
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold text-slate-900 leading-[1.1] tracking-tight mb-5">
                Turn today's chaos<br />
                into <span className="lp-gold">tomorrow's plan.</span>
              </h1>

              <p className="text-lg text-slate-600 leading-relaxed mb-3">
                CP360 helps owner-led remodelers and addition contractors stop chasing field updates,
                homeowner questions, schedule risks, and tomorrow's work across texts, calls, and memory.
              </p>

              <p className="text-[15px] text-slate-500 leading-relaxed mb-4">
                So you stop being the middleman between the field and the homeowner.
              </p>

              <p className="text-[14px] text-slate-500 italic mb-8 border-l-2 border-amber-300 pl-4">
                Know what changed yesterday, what needs attention today, and what could delay
                tomorrow — before your phone starts ringing.
              </p>

              <div className="lp-cta-group lg:justify-start">
                <button onClick={openWalkthrough} className="lp-btn-primary">
                  Book a 10-Minute Walkthrough <ArrowRight className="w-4 h-4 flex-shrink-0" />
                </button>
                <button onClick={openApply} className="lp-btn-outline">
                  Apply for Founding Pilot
                </button>
              </div>

              <p className="text-xs text-slate-400 mt-4">
                3 founding pilot spots. No setup fee. $199/month for 90 days.
              </p>
            </div>

            <div className="flex-1 w-full max-w-lg lg:max-w-none">
              <ProductMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN ─────────────────────────────────────────────────────────────── */}
      <section className="lp-section bg-slate-900 text-white">
        <div className="lp-container max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6 text-center">
            Every job runs through you.
          </h2>
          <p className="text-slate-300 text-[16px] leading-relaxed mb-6 text-center">
            Your field team texts you. Homeowners ask you for updates. Subs send photos to your phone.
            Permits, inspections, schedule changes, and tomorrow's work all depend on someone
            remembering what happened today.
          </p>
          <p className="text-slate-300 text-[16px] leading-relaxed mb-8 text-center">
            If you manage 3–15 active projects, your day can disappear into follow-ups, reminders,
            and "what's happening next?" conversations.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
            {[
              'Updates are scattered across texts, calls, and photos.',
              'Homeowners ask for answers before your team has reported back.',
              "Tomorrow's work depends on what happened today.",
              'Blockers get noticed too late.',
              'The owner becomes the human router for every project update.',
            ].map(pain => (
              <div key={pain} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                </div>
                <span className="text-slate-300 text-[14px] leading-snug">{pain}</span>
              </div>
            ))}
          </div>

          <div className="bg-white/5 border border-amber-400/30 rounded-2xl p-6 sm:p-8 text-center">
            <p className="text-slate-200 text-[17px] sm:text-xl font-medium leading-relaxed">
              Most small contractors do not need more software.
            </p>
            <p className="text-amber-300 text-[17px] sm:text-xl font-semibold leading-relaxed mt-1">
              They need fewer interruptions, fewer surprises,<br className="hidden sm:block" /> and a clearer plan for tomorrow.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="lp-section bg-white">
        <div className="lp-container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Start every morning with the answer.
            </h2>
            <p className="text-slate-600 text-[16px] leading-relaxed">
              CP360 gives you one clear daily view of every active project so you know what happened,
              what needs action, and what could block tomorrow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Clock, label: 'Yesterday', accent: 'bg-slate-50 border-slate-200',
                iconBg: 'bg-slate-100', iconColor: 'text-slate-600',
                title: 'What changed?',
                desc: 'Track completed work, updates, photos, and jobsite progress without digging through messages.',
              },
              {
                icon: AlertTriangle, label: 'Today', accent: 'bg-amber-50 border-amber-200',
                iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
                title: 'What needs attention?',
                desc: 'See blockers, client questions, urgent tasks, permits, inspections, and schedule risks.',
              },
              {
                icon: Calendar, label: 'Tomorrow', accent: 'bg-emerald-50 border-emerald-200',
                iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
                title: 'What could delay work?',
                desc: "Turn today's updates into tomorrow's plan before crews, clients, or subs are waiting on you.",
              },
            ].map(card => (
              <div key={card.label} className={`lp-card border ${card.accent}`}>
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center mb-4`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{card.label}</div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{card.title}</h3>
                <p className="text-slate-600 text-[14px] leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROLES ────────────────────────────────────────────────────────────── */}
      <section className="lp-section bg-slate-50">
        <div className="lp-container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              One command center for every role.
            </h2>
            <p className="text-slate-600 text-[16px] leading-relaxed">
              CP360 turns scattered project information into role-safe daily clarity for the owner,
              field team, subcontractors, and homeowner.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Shield, title: 'Owner / Admin', desc: "Sees project risks, blockers, client questions, schedule impact, and tomorrow's plan across active jobs.", accent: '#1e293b' },
              { icon: HardHatIcon, title: 'GC / Project Manager', desc: 'Sees field priorities, assigned tasks, inspections, photos, and what needs to be ready next.', accent: '#d97706' },
              { icon: Users, title: 'Subcontractor', desc: 'Sees assigned work, due dates, notes, and simple updates without unnecessary admin complexity.', accent: '#059669' },
              { icon: Home, title: 'Homeowner / Client', desc: 'Sees clean, client-safe updates, milestones, decisions, files, photos, and messages without internal jobsite chaos.', accent: '#2563eb' },
            ].map(role => (
              <div key={role.title} className="lp-card flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: role.accent + '15' }}>
                  <role.icon className="w-5 h-5" style={{ color: role.accent }} />
                </div>
                <h3 className="font-bold text-slate-900 text-[15px]">{role.title}</h3>
                <p className="text-slate-600 text-[13px] leading-relaxed flex-1">{role.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEMO VIDEO ───────────────────────────────────────────────────────── */}
      <section className="lp-section bg-white">
        <div className="lp-container max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              See CP360 in 90 seconds.
            </h2>
            <p className="text-slate-600 text-[16px]">
              Watch how CP360 shows what changed yesterday, what needs attention today, what could
              delay tomorrow, and what the homeowner can safely see.
            </p>
          </div>

          {/* Video placeholder — ready for Loom/YouTube/Vimeo embed */}
          <div
            className="relative bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center group cursor-pointer shadow-elevated mb-5"
            style={{ aspectRatio: '16/9', maxHeight: '360px' }}
            onClick={openWalkthrough}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
            <div
              className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
            />
            <div className="relative text-center px-8">
              <div className="w-14 h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-white/20 transition-colors">
                <Play className="w-6 h-6 text-white ml-1" />
              </div>
              <p className="text-white font-semibold text-[16px] mb-2">Live walkthrough available now.</p>
              <p className="text-slate-400 text-sm">Book a 10-minute walkthrough and we'll show CP360 using one sample project.</p>
            </div>
          </div>

          <div className="text-center">
            <button onClick={openWalkthrough} className="lp-btn-primary">
              Book a 10-Minute Walkthrough <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="lp-section bg-slate-50">
        <div className="lp-container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Built for how residential contractors actually work.
            </h2>
            <p className="text-slate-600 text-[15px]">
              CP360 is focused on the daily operating rhythm of a residential job, not a complicated
              enterprise system.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Clock,         title: 'Yesterday / Today / Tomorrow Pulse',  desc: 'Start every morning knowing what changed, what needs attention, and what could delay tomorrow.' },
              { icon: AlertTriangle, title: 'Action Board',                        desc: 'Keep blockers, client questions, urgent items, and schedule risks from getting buried in texts.' },
              { icon: Calendar,      title: "Tomorrow's Plan",                     desc: "Turn today's updates into the next workday's plan before crews or clients are waiting." },
              { icon: Zap,           title: 'Schedule Impact Tracking',            desc: 'See which delays affect tomorrow and what needs a decision.' },
              { icon: Shield,        title: 'Permits & Inspections',               desc: 'Avoid last-minute surprises from permit or inspection issues.' },
              { icon: Image,         title: 'Files, Photos & Documents',           desc: 'Stop digging through phone photos, messages, and scattered folders.' },
              { icon: Home,          title: 'Client-Safe Portal',                  desc: 'Keep homeowners informed without exposing internal notes or jobsite chaos.' },
              { icon: Zap,           title: 'AI-Assisted Updates',                 desc: 'Draft project summaries, blockers, risks, and homeowner updates faster.' },
              { icon: FileText,      title: 'Role-Based SOP Guidance',             desc: 'Help each role understand what to do next without adding more confusion.' },
            ].map(f => (
              <div key={f.title} className="lp-card flex gap-4">
                <div className="w-9 h-9 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <f.icon className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-[14px] mb-1">{f.title}</h3>
                  <p className="text-slate-500 text-[13px] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHO IT'S FOR ─────────────────────────────────────────────────────── */}
      <section className="lp-section bg-white">
        <div className="lp-container">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Best for owner-led remodelers and addition contractors managing 3–15 active projects.
            </h2>
            <p className="text-slate-600 text-[16px] leading-relaxed">
              CP360 is designed for contractors who have outgrown texts and memory, but do not want
              a heavy enterprise system.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {[
              'Owner-led remodelers', 'Room addition contractors', 'Kitchen and bath remodelers',
              'Design-build firms', 'Deck and porch builders', 'Outdoor living contractors',
              'Small custom builders',
            ].map(tag => (
              <div key={tag} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-2">
                <Check className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-slate-700 text-[13px] font-medium">{tag}</span>
              </div>
            ))}
          </div>

          <div className="text-center max-w-lg mx-auto">
            <p className="text-[15px] text-slate-700 font-medium mb-2">
              Best fit: teams managing 3–15 active projects where the owner is still the main
              communication hub.
            </p>
            <p className="text-[12px] text-slate-400">
              Not built for large enterprise commercial contractors or one-person handyman operations
              at this stage.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOUNDING PILOT OFFER ─────────────────────────────────────────────── */}
      <section id="founding-pilot-offer" className="lp-section bg-slate-900 text-white">
        <div className="lp-container max-w-3xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-400/30 rounded-full px-4 py-1.5 mb-3">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[12px] font-bold text-amber-300 uppercase tracking-wider">Limited to 3 founding customers</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              CP360 Founding Pilot
            </h2>
            <p className="text-slate-300 text-[16px] leading-relaxed mb-2">
              We are opening CP360 to a limited number of founding contractors before public launch.
            </p>
            <p className="text-slate-400 text-[14px] leading-relaxed">
              We are personally onboarding the first 3 contractors so we can set up one live project
              with them directly.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
              <div>
                <div className="text-3xl font-extrabold text-white">$199<span className="text-xl font-medium text-slate-400">/month</span></div>
                <div className="text-slate-400 text-sm mt-1">For 90 days · No setup fee</div>
              </div>
              <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-2 text-center">
                <div className="text-amber-300 font-bold text-sm">Founder pricing locked</div>
                <div className="text-slate-400 text-xs">for 12 months after pilot</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                'Done-for-you setup for 1 live project',
                'Admin + GC + client portal',
                'Unlimited homeowner and subcontractor access',
                'Weekly founder support for 90 days',
                'Founder pricing locked for 12 months',
                "One active project configured around updates, blockers, and Tomorrow's Plan",
              ].map(item => (
                <div key={item} className="check-item">
                  <div className="check-icon">
                    <Check className="w-3 h-3 text-amber-600" />
                  </div>
                  <span className="text-slate-300 text-[13px] leading-snug">{item}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4 mb-6">
              <p className="text-amber-200 text-[14px] font-medium mb-1">30-day promise</p>
              <p className="text-slate-300 text-[13px] leading-relaxed">
                In 30 days, you will have one live project running through CP360 with homeowner updates,
                blocker tracking, and Tomorrow's Plan in one place.
              </p>
            </div>

            <p className="text-slate-400 text-[13px] text-center italic">
              Start with one project. No need to move your whole business at once.
            </p>
          </div>

          <div className="lp-cta-group lp-cta-group-center">
            <button onClick={openApply} className="lp-btn-primary" style={{ background: '#d97706', fontSize: '16px', padding: '14px 32px' }}>
              Apply for Founding Pilot <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </button>
            <button onClick={openWalkthrough} className="lp-btn-outline" style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '15px', padding: '13px 28px' }}>
              Book a 10-Minute Walkthrough
            </button>
          </div>
        </div>
      </section>

      {/* ── PILOT PROCESS ────────────────────────────────────────────────────── */}
      <section className="lp-section bg-white">
        <div className="lp-container max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Simple pilot. One live project. Real feedback.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { step: '01', title: 'Apply', desc: 'Tell us about your company, active projects, and current coordination challenges.' },
              { step: '02', title: 'Walkthrough', desc: "We show CP360 using one live-project workflow: yesterday, today, tomorrow, blockers, and client-safe updates." },
              { step: '03', title: 'Setup', desc: 'We help set up one active project with your team, GC, and client-safe portal.' },
              { step: '04', title: 'Run the project', desc: 'Use CP360 for 90 days with weekly founder support and decide whether to expand.' },
            ].map(s => (
              <div key={s.step} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 font-bold text-slate-500 text-sm">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">{s.title}</h3>
                  <p className="text-slate-600 text-[14px] leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section id="faq" className="lp-section bg-slate-50">
        <div className="lp-container max-w-2xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">
              Frequently asked questions
            </h2>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl px-6 divide-y-0">
            {FAQS.map((faq, i) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="lp-section bg-white">
        <div className="lp-container max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
            Ready to stop being the bottleneck?
          </h2>
          <p className="text-slate-600 text-[16px] leading-relaxed mb-8">
            See how CP360 turns today's project chaos into tomorrow's plan on one live project.
          </p>
          <div className="lp-cta-group lp-cta-group-center">
            <button onClick={openWalkthrough} className="lp-btn-primary" style={{ fontSize: '16px', padding: '14px 32px' }}>
              Book a 10-Minute Walkthrough <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </button>
            <button onClick={openApply} className="lp-btn-outline" style={{ fontSize: '15px', padding: '13px 28px' }}>
              Apply for Founding Pilot
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-5">
            3 founding pilot spots. No setup fee. Start with one live project.
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-10 px-6">
        <div className="lp-container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <div className="text-slate-300 font-semibold text-sm leading-tight">CP360 / ConstructionProgress360</div>
              <div className="text-slate-500 text-[11px] leading-tight">A CONVAZANT product</div>
            </div>
          </div>
          <p className="text-slate-500 text-xs text-center">
            Built from real residential construction operations. · {new Date().getFullYear()}
          </p>
        </div>
      </footer>

      {/* ── MODALS ───────────────────────────────────────────────────────────── */}
      {modal === 'apply' && <ApplyModal onClose={closeModal} />}
      {modal === 'walkthrough' && <WalkthroughModal onClose={closeModal} />}
    </div>
  );
}
