import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { HardHat, Shield, AlertTriangle, FileText, CheckCircle, X } from 'lucide-react';

const CONSENT_VERSION = '1.0';

interface ConsentPageProps {
  onAccepted: () => void;
}

export default function ConsentPage({ onAccepted }: ConsentPageProps) {
  const { profile } = useAuth();
  const [checks, setChecks] = useState({
    terms: false,
    aiAssistive: false,
    aiNoAdvice: false,
    electronic: false,
    noSecrets: false,
    responsibility: false,
    clientContracts: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isClient = profile?.role === 'CLIENT';
  const isAdmin = profile?.role === 'DECKARC_ADMIN' || profile?.role === 'CONVAZANT_SUPER_ADMIN';

  const requiredChecks = isClient
    ? ['terms', 'aiAssistive', 'aiNoAdvice', 'electronic', 'noSecrets', 'responsibility', 'clientContracts']
    : ['terms', 'aiAssistive', 'aiNoAdvice', 'electronic', 'noSecrets', 'responsibility'];

  const allChecked = requiredChecks.every(k => checks[k as keyof typeof checks]);

  function toggle(key: keyof typeof checks) {
    setChecks(c => ({ ...c, [key]: !c[key] }));
  }

  async function handleAccept() {
    if (!allChecked || !profile) return;
    setSaving(true);
    setError('');
    try {
      const { error: insertErr } = await supabase.from('user_consents').insert({
        user_id: profile.id,
        organization_id: profile.organization_id,
        role_at_acceptance: profile.role,
        consent_version: CONSENT_VERSION,
        terms_version: CONSENT_VERSION,
        privacy_version: CONSENT_VERSION,
        ai_consent_version: CONSENT_VERSION,
        electronic_records_consent_version: CONSENT_VERSION,
        accepted_terms: true,
        accepted_ai_consent: true,
        accepted_electronic_records: true,
        accepted_privacy_notice: true,
        accepted_at: new Date().toISOString(),
        is_current: true,
        consent_text_snapshot: `CP360 Terms & AI Consent v${CONSENT_VERSION} accepted by ${profile.full_name} (${profile.role})`,
        user_agent_placeholder: navigator.userAgent,
      });
      if (insertErr) throw insertErr;
      onAccepted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save consent. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-concrete-50 flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-steel-800 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
            <HardHat className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-concrete-900 tracking-tight">Terms, Conditions &amp; AI Consent</h1>
            <p className="text-sm text-concrete-500">Please review and accept before accessing CP360</p>
          </div>
        </div>

        <div className="bg-white border border-concrete-200 rounded-2xl shadow-card overflow-hidden">
          {/* Sections */}
          <div className="divide-y divide-concrete-100 max-h-[52vh] overflow-y-auto">

            {/* A. Use Disclaimer */}
            <Section icon={<FileText className="w-4 h-4 text-steel-500" />} title="CP360 Use Disclaimer">
              <p className="text-sm text-concrete-600 leading-relaxed">
                CP360 is a project operations, communication, and progress tracking tool. It does not replace
                signed construction contracts, licensed contractor judgment, legal advice, engineering advice,
                architectural advice, code official decisions, permit authority approvals, inspection authority
                decisions, accounting advice, or tax advice.
              </p>
            </Section>

            {/* B. AI Chat Consent */}
            <Section icon={<Shield className="w-4 h-4 text-steel-500" />} title="AI Chat Consent">
              <p className="text-sm text-concrete-600 leading-relaxed">
                CP360 includes AI-assisted features such as Ask CP360, project summaries, risk detection,
                draft messages, and operational recommendations. AI responses may be incomplete or incorrect
                if project data is missing, outdated, or inaccurate. AI output is assistive only and requires
                human review for official decisions.
              </p>
            </Section>

            {/* C. AI Limitations */}
            <Section icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} title="AI Limitations">
              <p className="text-sm text-concrete-600 leading-relaxed">
                AI cannot approve change orders, approve schedule changes, send client messages, mark payments
                paid, mark inspections passed, close projects, provide legal advice, provide engineering/code
                approval, or make official business decisions without authorized Admin review.
              </p>
            </Section>

            {/* D. Data Use for AI */}
            <Section icon={<Shield className="w-4 h-4 text-steel-500" />} title="Data Use for AI">
              <p className="text-sm text-concrete-600 leading-relaxed">
                AI features may use project information available to your role — such as tasks, updates,
                communications, client inputs, schedules, inspections, permits, materials, payments, and
                reports — to generate summaries and recommendations. AI access is limited by your assigned
                role and organization permissions.
              </p>
            </Section>

            {/* E. Privacy and Confidentiality */}
            <Section icon={<Shield className="w-4 h-4 text-steel-500" />} title="Privacy &amp; Confidentiality">
              <p className="text-sm text-concrete-600 leading-relaxed">
                You agree not to enter information into CP360 that you are not authorized to share. Do not
                paste passwords, API keys, private credentials, Social Security numbers, bank account numbers,
                protected health information, or other highly sensitive information into AI chat or project notes.
              </p>
            </Section>

            {/* F. Electronic Records */}
            <Section icon={<FileText className="w-4 h-4 text-steel-500" />} title="Electronic Records &amp; Communications">
              <p className="text-sm text-concrete-600 leading-relaxed">
                You consent to receive and use electronic records and communications through CP360, including
                project updates, acknowledgements, approvals, messages, reminders, reports, and notifications.
              </p>
            </Section>

            {/* G. User Responsibility */}
            <Section icon={<CheckCircle className="w-4 h-4 text-emerald-500" />} title="User Responsibility">
              <p className="text-sm text-concrete-600 leading-relaxed">
                You are responsible for submitting accurate updates and using CP360 only for projects,
                companies, and information you are authorized to access.
              </p>
            </Section>

            {/* H. Client-specific */}
            {isClient && (
              <Section icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} title="Client Notice">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-800 leading-relaxed">
                    Project updates in CP360 are for communication and tracking. Signed contracts, approved
                    change orders, invoices, and written agreements control official project scope, pricing,
                    payment obligations, and legal responsibilities.
                  </p>
                </div>
              </Section>
            )}

            {/* I. Admin-specific */}
            {isAdmin && (
              <Section icon={<Shield className="w-4 h-4 text-steel-500" />} title="Admin Responsibility">
                <div className="bg-steel-50 border border-steel-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-steel-700 leading-relaxed">
                    Admins are responsible for approving client-visible messages, user roles, project access,
                    schedule changes, and official communications before they are shared or acted on.
                  </p>
                </div>
              </Section>
            )}

            {/* J. No Emergency Use */}
            <Section icon={<AlertTriangle className="w-4 h-4 text-hazard-500" />} title="No Emergency Use">
              <p className="text-sm text-concrete-600 leading-relaxed">
                CP360 should not be used as the only method for emergency, safety-critical, or urgent
                jobsite communication.
              </p>
            </Section>

          </div>

          {/* Checkboxes */}
          <div className="px-6 py-5 bg-concrete-50 border-t border-concrete-200 space-y-3">
            <p className="text-xs font-semibold text-concrete-500 uppercase tracking-wider mb-4">
              Required Acknowledgements
            </p>

            <Checkbox
              checked={checks.terms}
              onChange={() => toggle('terms')}
              label="I agree to CP360 Terms and Conditions."
            />
            <Checkbox
              checked={checks.aiAssistive}
              onChange={() => toggle('aiAssistive')}
              label="I understand CP360 AI is assistive only and may be incomplete or incorrect."
            />
            <Checkbox
              checked={checks.aiNoAdvice}
              onChange={() => toggle('aiNoAdvice')}
              label="I understand AI does not provide legal, engineering, code, tax, accounting, or professional advice."
            />
            <Checkbox
              checked={checks.electronic}
              onChange={() => toggle('electronic')}
              label="I consent to electronic records and communications through CP360."
            />
            <Checkbox
              checked={checks.noSecrets}
              onChange={() => toggle('noSecrets')}
              label="I agree not to enter passwords, API keys, credentials, or highly sensitive personal information into CP360 AI chat."
            />
            <Checkbox
              checked={checks.responsibility}
              onChange={() => toggle('responsibility')}
              label="I understand I am responsible for accurate updates and authorized use."
            />
            {isClient && (
              <Checkbox
                checked={checks.clientContracts}
                onChange={() => toggle('clientContracts')}
                label="I understand signed contracts, approved change orders, invoices, and written agreements control official scope, pricing, payment, and obligations."
              />
            )}

            {error && (
              <div className="flex items-center gap-2 bg-hazard-50 border border-hazard-200 text-hazard-700 text-sm rounded-xl px-4 py-3 mt-2">
                <X className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <p className="text-[11px] text-concrete-400 pt-1">
              Final legal documents should be reviewed by qualified legal counsel before production launch.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-concrete-200 flex items-center gap-3 justify-end bg-white">
            <DeclineButton />
            <button
              onClick={handleAccept}
              disabled={!allChecked || saving}
              className={`btn-primary px-6 py-2.5 text-sm font-semibold transition-all ${
                !allChecked ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              {saving ? 'Saving...' : 'Accept & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-concrete-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        onClick={onChange}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
          checked
            ? 'bg-steel-600 border-steel-600'
            : 'border-concrete-300 bg-white group-hover:border-steel-400'
        }`}
      >
        {checked && <CheckCircle className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-concrete-700 leading-relaxed select-none" onClick={onChange}>
        {label}
      </span>
    </label>
  );
}

function DeclineButton() {
  const { signOut } = useAuth();
  return (
    <button
      onClick={() => signOut()}
      className="px-5 py-2.5 text-sm font-semibold text-concrete-500 hover:text-concrete-800 hover:bg-concrete-100 rounded-xl transition-colors"
    >
      Decline
    </button>
  );
}
