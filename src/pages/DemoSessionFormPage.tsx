import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Save, CheckCircle2, AlertCircle, Loader2, Sparkles, X,
} from 'lucide-react';
import {
  emptySession, defaultObservations,
  CONTACT_ROLES, COMPANY_SIZES, ANNUAL_REVENUE_RANGES, PRIMARY_SERVICE_TYPES,
  CURRENT_SOFTWARE_OPTIONS, DEMO_TYPES, DEMO_ENVIRONMENTS,
  ATTENTION_CLARITY_OPTIONS, MORNING_USAGE_OPTIONS, TIME_SAVED_OPTIONS,
  EXPECTED_PRICE_OPTIONS, PREFERRED_PLAN_OPTIONS, PURCHASE_READINESS_OPTIONS,
  MAIN_BUYING_CONCERN_OPTIONS, YES_MAYBE_NO, OUTCOMES, NEXT_STEP_OPTIONS,
  FOLLOW_UP_TYPES,
  type DiscoverySession,
} from '../components/customerDiscovery/types';
import { SectionCard, Field, TextInput, TextArea, Select, Badge } from '../components/customerDiscovery/ui';
import { StarRating, NpsRating } from '../components/customerDiscovery/RatingControls';
import {
  ObservationTaskTable, observationsToRows, rowsToObservations,
  computeMetrics, type ObservationRow,
} from '../components/customerDiscovery/ObservationTaskTable';
import {
  FeatureRequestsEditor, featureRequestsToRows, type FeatureRequestRow,
} from '../components/customerDiscovery/FeatureRequestsEditor';
import { generateAiSummary, aiSummaryToText } from '../components/customerDiscovery/aiSummary';

interface Props {
  sessionId?: string; // if provided, edit mode
  onBack: () => void;
  onViewSession: (id: string) => void;
}

export default function DemoSessionForm({ sessionId, onBack, onViewSession }: Props) {
  const { user } = useAuth();
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [obsRows, setObsRows] = useState<ObservationRow[]>([]);
  const [frRows, setFrRows] = useState<FeatureRequestRow[]>([]);
  const [loading, setLoading] = useState(!sessionId ? false : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedToast, setSavedToast] = useState('');
  const initialLoadRef = useRef(false);

  // Load existing session for edit mode
  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('customer_discovery_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (err || !data) {
      setError('Unable to load demo session.');
      setLoading(false);
      return;
    }
    const s = data as DiscoverySession;
    setSession(s);
    // load observations
    const { data: obs } = await supabase
      .from('customer_discovery_observations')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true });
    setObsRows(observationsToRows((obs ?? []) as any));
    // load feature requests
    const { data: frs } = await supabase
      .from('customer_discovery_feature_requests')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true });
    setFrRows(featureRequestsToRows((frs ?? []) as any));
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadSession();
  }, [sessionId, loadSession]);

  // Initialize new session
  useEffect(() => {
    if (!sessionId && !initialLoadRef.current) {
      initialLoadRef.current = true;
      const empty = emptySession();
      empty.presenter = user?.email ?? '';
      empty.demo_date = new Date().toISOString().slice(0, 10);
      setSession(empty as DiscoverySession);
      // default observation tasks
      const defaults = defaultObservations();
      setObsRows(
        defaults.map((d, i) => ({
          id: `temp-${i}`,
          task_name: d.task_name,
          completed: 'No' as const,
          needed_help: 'No' as const,
          time_taken: '',
          confusion_level: 'None' as const,
          observer_notes: '',
        })),
      );
    }
  }, [sessionId, user]);

  // Unsaved-change warning
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function update<K extends keyof DiscoverySession>(key: K, value: DiscoverySession[K]) {
    setSession(prev => prev ? { ...prev, [key]: value } : prev);
    setDirty(true);
  }

  function toggleSoftware(software: string) {
    setSession(prev => {
      if (!prev) return prev;
      const has = prev.current_software.includes(software);
      const next = has
        ? prev.current_software.filter(s => s !== software)
        : [...prev.current_software, software];
      return { ...prev, current_software: next };
    });
    setDirty(true);
  }

  // Validation
  function validate(): string | null {
    if (!session) return 'No session data.';
    if (!session.company_name.trim()) return 'Company Name is required.';
    if (!session.contact_name.trim()) return 'Contact Name is required.';
    if (!session.demo_date) return 'Demo Date is required.';
    if (session.follow_up_required) {
      if (!session.follow_up_date) return 'Follow-up Date is required when Follow-up Required is Yes.';
      if (!session.follow_up_owner.trim()) return 'Follow-up Owner is required when Follow-up Required is Yes.';
    }
    if (session.status === 'Completed' && !session.outcome) {
      return 'Outcome is required to mark a session as Completed.';
    }
    return null;
  }

  async function logActivity(sessionId: string, type: string, description: string) {
    await supabase.from('customer_discovery_activities').insert({
      session_id: sessionId,
      activity_type: type,
      description,
      created_by: user?.id ?? null,
    });
  }

  async function save(status: 'Draft' | 'Completed') {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!session) return;

    setSaving(true);
    setError('');

    // Compute observation metrics
    const metrics = computeMetrics(obsRows);
    const avgConfusionLabel = metrics.avgConfusionLabel;

    // Generate AI summary if completed
    let aiSummary = session.ai_summary;
    if (status === 'Completed') {
      const summary = generateAiSummary(
        { ...session, status },
        rowsToObservations(obsRows).map((r, i) => ({ ...r, id: r.id, session_id: sessionId ?? '', sort_order: i, created_at: '' })) as any,
        frRows.map((r, i) => ({ ...r, id: r.id, session_id: sessionId ?? '', sort_order: i, created_at: '' })) as any,
      );
      aiSummary = aiSummaryToText(summary);
    }

    const payload: any = {
      ...session,
      status,
      task_completion_rate: metrics.completionRate,
      tasks_needing_help: metrics.needingHelp,
      average_confusion_level: avgConfusionLabel,
      ai_summary: aiSummary,
      current_software: session.current_software,
      created_by: session.created_by ?? user?.id ?? null,
    };

    let savedId = sessionId;

    if (sessionId) {
      // Update
      const prevOutcome = session.outcome;
      const { error: err } = await supabase
        .from('customer_discovery_sessions')
        .update(payload)
        .eq('id', sessionId);
      if (err) {
        setError('Failed to save session.');
        setSaving(false);
        return;
      }
      // Activities
      await logActivity(sessionId, 'edited', 'Session edited');
      if (status === 'Completed' && session.status !== 'Completed') {
        await logActivity(sessionId, 'edited', 'Session marked as completed');
      }
      if (session.outcome && session.outcome !== prevOutcome) {
        await logActivity(sessionId, 'outcome_changed', `Outcome changed to ${session.outcome}`);
      }
      if (session.follow_up_required && session.follow_up_date && !session.follow_up_completed) {
        await logActivity(sessionId, 'follow_up_scheduled', `Follow-up scheduled for ${session.follow_up_date}`);
      }
    } else {
      // Insert
      const { data, error: err } = await supabase
        .from('customer_discovery_sessions')
        .insert(payload)
        .select('id')
        .single();
      if (err || !data) {
        setError('Failed to create session.');
        setSaving(false);
        return;
      }
      savedId = data.id;
      await logActivity(savedId, 'created', 'Session created');
      if (session.follow_up_required && session.follow_up_date) {
        await logActivity(savedId, 'follow_up_scheduled', `Follow-up scheduled for ${session.follow_up_date}`);
      }
    }

    // Save observations (replace all)
    if (savedId) {
      await supabase.from('customer_discovery_observations').delete().eq('session_id', savedId);
      if (obsRows.length > 0) {
        const obsPayload = rowsToObservations(obsRows).map((r, i) => ({
          session_id: savedId,
          sort_order: i,
          task_name: r.task_name,
          completed: r.completed,
          needed_help: r.needed_help,
          time_taken: r.time_taken,
          confusion_level: r.confusion_level,
          observer_notes: r.observer_notes,
        }));
        await supabase.from('customer_discovery_observations').insert(obsPayload);
      }

      // Save feature requests (replace all)
      await supabase.from('customer_discovery_feature_requests').delete().eq('session_id', savedId);
      if (frRows.length > 0) {
        const frPayload = frRows.map((r, i) => ({
          session_id: savedId,
          sort_order: i,
          request_text: r.request_text,
          underlying_problem: r.underlying_problem,
          product_area: r.product_area,
          importance: r.importance,
          frequency: r.frequency,
          admin_notes: r.admin_notes,
        }));
        await supabase.from('customer_discovery_feature_requests').insert(frPayload);
      }
    }

    setSaving(false);
    setDirty(false);
    setSavedToast(status === 'Completed' ? 'Session completed and saved.' : 'Draft saved.');
    setTimeout(() => {
      onViewSession(savedId!);
    }, 600);
  }

  if (loading || !session) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-colors';

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">
              {sessionId ? 'Edit Demo Session' : 'New Demo Session'}
            </h1>
            <p className="text-xs text-slate-500 truncate">
              {session.company_name || 'Untitled demo'} {dirty && <span className="text-amber-600">• Unsaved changes</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => save('Draft')}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Draft
          </button>
          <button
            onClick={() => save('Completed')}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3.5 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Save & Complete
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError('')} className="ml-auto p-0.5 text-red-400 hover:text-red-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1000px] mx-auto px-5 py-6 space-y-5 pb-24">
          {/* A. Company Information */}
          <SectionCard title="A. Company Information" subtitle="Who you demoed to.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Company Name" required>
                <TextInput value={session.company_name} onChange={e => update('company_name', e.target.value)} placeholder="ABC Remodeling" />
              </Field>
              <Field label="Contact Name" required>
                <TextInput value={session.contact_name} onChange={e => update('contact_name', e.target.value)} placeholder="John Smith" />
              </Field>
              <Field label="Contact Role">
                <Select value={session.contact_role} onChange={v => update('contact_role', v)} options={CONTACT_ROLES} placeholder="Select role" />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={session.email} onChange={e => update('email', e.target.value)} placeholder="john@abcremodeling.com" />
              </Field>
              <Field label="Phone">
                <TextInput value={session.phone} onChange={e => update('phone', e.target.value)} placeholder="(555) 123-4567" />
              </Field>
              <Field label="Company Size">
                <Select value={session.company_size} onChange={v => update('company_size', v)} options={COMPANY_SIZES} placeholder="Select size" />
              </Field>
              <Field label="Number of Active Projects">
                <TextInput type="number" min={0} value={session.active_projects} onChange={e => update('active_projects', parseInt(e.target.value) || 0)} />
              </Field>
              <Field label="Annual Revenue Range">
                <Select value={session.annual_revenue_range} onChange={v => update('annual_revenue_range', v)} options={ANNUAL_REVENUE_RANGES} placeholder="Select range" />
              </Field>
              <Field label="Primary Service Type">
                <Select value={session.primary_service_type} onChange={v => update('primary_service_type', v)} options={PRIMARY_SERVICE_TYPES} placeholder="Select type" />
              </Field>
              <Field label="How They Heard About CP360">
                <TextInput value={session.referral_source} onChange={e => update('referral_source', e.target.value)} placeholder="Referral, LinkedIn, etc." />
              </Field>
            </div>
            {/* Current Software multi-select */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Current Software (select all that apply)</label>
              <div className="flex flex-wrap gap-2">
                {CURRENT_SOFTWARE_OPTIONS.map(s => {
                  const active = session.current_software.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSoftware(s)}
                      className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                        active
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          {/* B. Demo Information */}
          <SectionCard title="B. Demo Information" subtitle="When and how the demo happened.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Demo Date" required>
                <TextInput type="date" value={session.demo_date ?? ''} onChange={e => update('demo_date', e.target.value || null)} />
              </Field>
              <Field label="Presenter">
                <TextInput value={session.presenter} onChange={e => update('presenter', e.target.value)} placeholder="Presenter name" />
              </Field>
              <Field label="Demo Duration (minutes)">
                <TextInput type="number" min={0} value={session.demo_duration_minutes} onChange={e => update('demo_duration_minutes', parseInt(e.target.value) || 0)} />
              </Field>
              <Field label="Demo Type">
                <Select value={session.demo_type} onChange={v => update('demo_type', v)} options={DEMO_TYPES} placeholder="Select type" />
              </Field>
              <Field label="Product Version">
                <TextInput value={session.product_version} onChange={e => update('product_version', e.target.value)} placeholder="e.g. v0.9.2" />
              </Field>
              <Field label="Demo Environment">
                <Select value={session.demo_environment} onChange={v => update('demo_environment', v)} options={DEMO_ENVIRONMENTS} placeholder="Select environment" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Demo Goals">
                  <TextArea value={session.demo_goals} onChange={e => update('demo_goals', e.target.value)} placeholder="What did you want to learn from this demo?" />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* C. Live Observation */}
          <SectionCard title="C. Live Observation" subtitle="Watch them work through CP360. Record what happens.">
            <ObservationTaskTable rows={obsRows} onChange={(r) => { setObsRows(r); setDirty(true); }} />
          </SectionCard>

          {/* D. Customer Feedback */}
          <SectionCard title="D. Customer Feedback" subtitle="What the contractor said about CP360.">
            <div className="space-y-5">
              <Field label="1. How easy was CP360 to use?">
                <StarRating value={session.overall_rating} onChange={v => update('overall_rating', v)} />
              </Field>
              <Field label="2. When you first opened CP360, did you immediately understand what needed your attention?">
                <div className="flex flex-wrap gap-2">
                  {ATTENTION_CLARITY_OPTIONS.map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => update('attention_clarity', o)}
                      className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                        session.attention_clarity === o
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="3. What was the most valuable part of CP360?">
                <TextArea value={session.valuable_feature} onChange={e => update('valuable_feature', e.target.value)} placeholder="Their answer..." />
              </Field>
              <Field label="4. What confused or frustrated you the most?">
                <TextArea value={session.main_frustration} onChange={e => update('main_frustration', e.target.value)} placeholder="Their answer..." />
              </Field>
              <Field label="5. What information did you expect to see but could not find?">
                <TextArea value={session.missing_information} onChange={e => update('missing_information', e.target.value)} placeholder="Their answer..." />
              </Field>
              <Field label="6. Would you open CP360 every morning before work?">
                <div className="flex flex-wrap gap-2">
                  {MORNING_USAGE_OPTIONS.map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => update('morning_usage_likelihood', o)}
                      className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                        session.morning_usage_likelihood === o
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="7. At what point did you first think: &ldquo;This could actually help my business&rdquo;?" helper="Value Moment">
                <TextArea value={session.value_moment} onChange={e => update('value_moment', e.target.value)} placeholder="The moment it clicked..." className="min-h-[100px] bg-amber-50/40 border-amber-200" />
              </Field>
              <Field label="8. If you could change only one thing before launch, what would it be?">
                <TextArea value={session.single_change} onChange={e => update('single_change', e.target.value)} placeholder="Their answer..." />
              </Field>
              <Field label="9. How likely are you to recommend CP360 to another contractor?">
                <NpsRating value={session.recommendation_score} onChange={v => update('recommendation_score', v)} />
              </Field>
            </div>
          </SectionCard>

          {/* E. Commercial Interest */}
          <SectionCard title="E. Commercial Interest" subtitle="What they would pay and when.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Estimated Time Saved Per Week">
                <Select value={session.estimated_time_saved} onChange={v => update('estimated_time_saved', v)} options={TIME_SAVED_OPTIONS} placeholder="Select..." />
              </Field>
              <Field label="Reasonable Monthly Price">
                <Select value={session.expected_monthly_price} onChange={v => update('expected_monthly_price', v)} options={EXPECTED_PRICE_OPTIONS} placeholder="Select..." />
              </Field>
              <Field label="Preferred CP360 Plan">
                <Select value={session.preferred_plan} onChange={v => update('preferred_plan', v)} options={PREFERRED_PLAN_OPTIONS} placeholder="Select..." />
              </Field>
              <Field label="Purchase Readiness">
                <Select value={session.purchase_readiness} onChange={v => update('purchase_readiness', v)} options={PURCHASE_READINESS_OPTIONS} placeholder="Select..." />
              </Field>
              <Field label="Main Buying Concern">
                <Select value={session.main_buying_concern} onChange={v => update('main_buying_concern', v)} options={MAIN_BUYING_CONCERN_OPTIONS} placeholder="Select..." />
              </Field>
              <Field label="Would They Join the Beta?">
                <Select value={session.beta_interest} onChange={v => update('beta_interest', v)} options={YES_MAYBE_NO} placeholder="Select..." />
              </Field>
              <Field label="Would They Permit a Testimonial Later?">
                <Select value={session.testimonial_permission} onChange={v => update('testimonial_permission', v)} options={YES_MAYBE_NO} placeholder="Select..." />
              </Field>
            </div>
          </SectionCard>

          {/* Feature Requests */}
          <SectionCard title="Feature Requests" subtitle="What they asked for.">
            <FeatureRequestsEditor rows={frRows} onChange={(r) => { setFrRows(r); setDirty(true); }} />
          </SectionCard>

          {/* F. Demo Outcome */}
          <SectionCard title="F. Demo Outcome" subtitle="Your assessment of the demo.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Outcome" required={session.status === 'Completed'}>
                <Select value={session.outcome} onChange={v => update('outcome', v)} options={OUTCOMES} placeholder="Select outcome" />
              </Field>
              <Field label="Recommended Next Step">
                <Select value={session.recommended_next_step} onChange={v => update('recommended_next_step', v)} options={NEXT_STEP_OPTIONS} placeholder="Select..." />
              </Field>
              <div className="md:col-span-2">
                <Field label="Outcome Reason">
                  <TextArea value={session.outcome_reason} onChange={e => update('outcome_reason', e.target.value)} placeholder="Why this outcome?" />
                </Field>
              </div>
              <Field label="Top Positive Signal">
                <TextInput value={session.top_positive_signal} onChange={e => update('top_positive_signal', e.target.value)} placeholder="What excited them most?" />
              </Field>
              <Field label="Top Concern">
                <TextInput value={session.top_concern} onChange={e => update('top_concern', e.target.value)} placeholder="What held them back?" />
              </Field>
            </div>
          </SectionCard>

          {/* G. Follow-up */}
          <SectionCard title="G. Follow-up" subtitle="What happens next.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Follow-up Required">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { update('follow_up_required', true); }}
                    className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                      session.follow_up_required
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => { update('follow_up_required', false); update('follow_up_completed', false); }}
                    className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                      !session.follow_up_required
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </Field>
              <Field label="Follow-up Completed">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => update('follow_up_completed', true)}
                    className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                      session.follow_up_completed
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => update('follow_up_completed', false)}
                    className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                      !session.follow_up_completed
                        ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </Field>
              <Field label="Follow-up Date" required={session.follow_up_required}>
                <TextInput type="date" value={session.follow_up_date ?? ''} onChange={e => update('follow_up_date', e.target.value || null)} />
              </Field>
              <Field label="Follow-up Owner" required={session.follow_up_required}>
                <TextInput value={session.follow_up_owner} onChange={e => update('follow_up_owner', e.target.value)} placeholder="Who follows up?" />
              </Field>
              <Field label="Follow-up Type">
                <Select value={session.follow_up_type} onChange={v => update('follow_up_type', v)} options={FOLLOW_UP_TYPES} placeholder="Select..." />
              </Field>
              <div className="md:col-span-2">
                <Field label="Follow-up Notes">
                  <TextArea value={session.follow_up_notes} onChange={e => update('follow_up_notes', e.target.value)} placeholder="Notes..." />
                </Field>
              </div>
            </div>
            {/* Follow-up status preview */}
            {session.follow_up_required && !session.follow_up_completed && session.follow_up_date && (
              <div className="mt-3">
                <Badge label={`Follow-up: ${session.follow_up_date}`} className="bg-blue-50 text-blue-700 border-blue-200" />
              </div>
            )}
          </SectionCard>

          {/* H. Internal Notes */}
          <SectionCard title="H. Internal Notes" subtitle="For the CP360 team only.">
            <div className="space-y-4">
              <Field label="Internal Summary">
                <TextArea value={session.internal_summary} onChange={e => update('internal_summary', e.target.value)} placeholder="Short summary..." />
              </Field>
              <Field label="What We Learned">
                <TextArea value={session.what_we_learned} onChange={e => update('what_we_learned', e.target.value)} placeholder="Key learnings..." />
              </Field>
              <Field label="Product Changes to Consider">
                <TextArea value={session.product_changes} onChange={e => update('product_changes', e.target.value)} placeholder="Potential product changes..." />
              </Field>
              <Field label="Sales Notes">
                <TextArea value={session.sales_notes} onChange={e => update('sales_notes', e.target.value)} placeholder="Notes for sales..." />
              </Field>
              <Field label="Marketing Language Captured" helper="Capture how the contractor describes the problem in their own words.">
                <TextArea value={session.marketing_language} onChange={e => update('marketing_language', e.target.value)} placeholder="Exact phrases the contractor used..." className="bg-blue-50/30 border-blue-100" />
              </Field>
            </div>
          </SectionCard>

          {/* AI Summary preview */}
          {session.ai_summary && (
            <SectionCard
              title="AI-Assisted Summary"
              subtitle="Generated from session responses."
              right={<Sparkles className="w-4 h-4 text-amber-400" />}
            >
              <div className="bg-amber-50/40 border border-amber-100 rounded-lg p-4">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{session.ai_summary}</pre>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Review this summary before using it for product or sales decisions.
              </p>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Toast */}
      {savedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {savedToast}
        </div>
      )}
    </div>
  );
}
