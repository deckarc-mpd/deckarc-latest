import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Edit3, Calendar, User, Mail, Phone, Building2, Users,
  DollarSign, Briefcase, Star, CheckCircle2, AlertCircle, Loader2,
  Archive, Clock, Sparkles, RefreshCw, MessageSquare,
} from 'lucide-react';
import {
  ACTIVITY_TYPE_LABELS, OUTCOME_BADGE_STYLES, STATUS_BADGE_STYLES,
  PRODUCT_AREAS, IMPORTANCE_OPTIONS, FREQUENCY_OPTIONS,
  type DiscoverySession, type ObservationTask, type FeatureRequest, type DiscoveryActivity,
} from '../components/customerDiscovery/types';
import {
  SectionCard, Badge, fmtDate, fmtDateTime, daysUntil,
  followUpStatusClass, followUpStatusLabel,
} from '../components/customerDiscovery/ui';
import { computeMetrics, observationsToRows } from '../components/customerDiscovery/ObservationTaskTable';
import { generateAiSummary, aiSummaryToText, type AiSummarySections } from '../components/customerDiscovery/aiSummary';
import Modal from '../components/Modal';

type Tab = 'overview' | 'observation' | 'feedback' | 'commercial' | 'requests' | 'follow-up' | 'activity';

export default function DemoSessionDetailPage({ sessionId, onBack, onEdit }: Props) {
  const navigate = { back: onBack, edit: (id: string) => onEdit(id) };
  const { user } = useAuth();
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [observations, setObservations] = useState<ObservationTask[]>([]);
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [activities, setActivities] = useState<DiscoveryActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [showArchive, setShowArchive] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiSummarySections | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    const [{ data: s }, { data: obs }, { data: frs }, { data: acts }] = await Promise.all([
      supabase.from('customer_discovery_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('customer_discovery_observations').select('*').eq('session_id', sessionId).order('sort_order', { ascending: true }),
      supabase.from('customer_discovery_feature_requests').select('*').eq('session_id', sessionId).order('sort_order', { ascending: true }),
      supabase.from('customer_discovery_activities').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }),
    ]);
    if (!s) {
      setLoading(false);
      return;
    }
    setSession(s as DiscoverySession);
    setObservations((obs ?? []) as ObservationTask[]);
    setFeatureRequests((frs ?? []) as FeatureRequest[]);
    setActivities((acts ?? []) as DiscoveryActivity[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Generate AI summary from current data
  useEffect(() => {
    if (session && observations.length >= 0) {
      setAiSummary(generateAiSummary(session, observations, featureRequests));
    }
  }, [session, observations, featureRequests]);

  async function regenerateSummary() {
    if (!session || !sessionId) return;
    setRegenerating(true);
    const summary = generateAiSummary(session, observations, featureRequests);
    const text = aiSummaryToText(summary);
    await supabase.from('customer_discovery_sessions').update({ ai_summary: text }).eq('id', sessionId);
    setAiSummary(summary);
    setRegenerating(false);
  }

  async function archive() {
    if (!sessionId) return;
    await supabase.from('customer_discovery_sessions').update({ archived_at: new Date().toISOString(), status: 'Archived' }).eq('id', sessionId);
    await supabase.from('customer_discovery_activities').insert({
      session_id: sessionId,
      activity_type: 'archived',
      description: 'Session archived',
      created_by: user?.id ?? null,
    });
    setShowArchive(false);
    load();
  }

  async function completeFollowUp() {
    if (!sessionId) return;
    await supabase.from('customer_discovery_sessions').update({ follow_up_completed: true }).eq('id', sessionId);
    await supabase.from('customer_discovery_activities').insert({
      session_id: sessionId,
      activity_type: 'follow_up_completed',
      description: 'Follow-up completed',
      created_by: user?.id ?? null,
    });
    load();
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Demo session not found.</p>
          <button onClick={() => navigate.back} className="text-sm text-amber-600 hover:text-amber-700 mt-2">
            Back to Customer Discovery
          </button>
        </div>
      </div>
    );
  }

  const obsRows = observationsToRows(observations);
  const metrics = computeMetrics(obsRows);
  const fuStatus = followUpStatusLabel(session.follow_up_required, session.follow_up_completed, session.follow_up_date);
  const fuClass = followUpStatusClass(session.follow_up_required, session.follow_up_completed, session.follow_up_date);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'observation', label: 'Observation' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'commercial', label: 'Commercial' },
    { id: 'requests', label: 'Requests' },
    { id: 'follow-up', label: 'Follow-up' },
    { id: 'activity', label: 'Activity' },
  ];

  const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) =>
    value ? (
      <div className="flex items-start gap-2.5">
        <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-sm text-slate-800">{value}</p>
        </div>
      </div>
    ) : null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <button
              onClick={() => onBack}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0 mt-0.5"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900 truncate">{session.company_name}</h1>
                <Badge label={session.outcome || 'No Outcome'} className={OUTCOME_BADGE_STYLES[session.outcome] ?? 'bg-slate-100 text-slate-500 border-slate-200'} />
                <Badge label={session.status} className={STATUS_BADGE_STYLES[session.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'} />
              </div>
              <p className="text-sm text-slate-500">
                {session.contact_name}{session.contact_role ? ` • ${session.contact_role}` : ''} • {fmtDate(session.demo_date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onEdit(sessionId)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={() => setTab('follow-up')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" />
              Follow-up
            </button>
            {!session.archived_at && (
              <button
                onClick={() => setShowArchive(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Usability Rating', value: session.overall_rating ? `${session.overall_rating}/5` : '—', icon: Star, color: 'text-amber-600' },
            { label: 'Task Completion', value: `${metrics.completionRate}%`, icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'Tasks Needing Help', value: metrics.needingHelp, icon: AlertCircle, color: 'text-amber-600' },
            { label: 'Purchase Readiness', value: session.purchase_readiness || '—', icon: Briefcase, color: 'text-slate-700' },
            { label: 'Expected Price', value: session.expected_monthly_price || '—', icon: DollarSign, color: 'text-slate-700' },
            { label: 'Follow-up Status', value: fuStatus, icon: Clock, color: fuClass.includes('red') ? 'text-red-600' : fuClass.includes('amber') ? 'text-amber-600' : 'text-slate-700' },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${card.color}`} />
                  <span className="text-[11px] text-slate-500 leading-tight">{card.label}</span>
                </div>
                <div className={`text-base font-bold ${card.color}`}>{card.value}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 mt-4 border-b border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-amber-500 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1000px] mx-auto px-5 py-6 pb-12 space-y-5">
          {tab === 'overview' && (
            <>
              {/* AI Summary */}
              <SectionCard
                title="AI-Assisted Summary"
                subtitle="Generated from session responses."
                right={
                  <button
                    onClick={regenerateSummary}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Regenerate
                  </button>
                }
              >
                <div className="flex items-center gap-1.5 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI-Assisted Summary</span>
                </div>
                <div className="bg-amber-50/40 border border-amber-100 rounded-lg p-4 mb-4">
                  <p className="text-sm text-slate-700 leading-relaxed">{aiSummary?.narrative}</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Customer Need', value: aiSummary?.customerNeed },
                    { label: 'Strongest Value Signal', value: aiSummary?.strongestValueSignal },
                    { label: 'Main Friction', value: aiSummary?.mainFriction },
                    { label: 'Commercial Signal', value: aiSummary?.commercialSignal },
                    { label: 'Recommended Next Step', value: aiSummary?.recommendedNextStep },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{item.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">
                  Review this summary before using it for product or sales decisions.
                </p>
              </SectionCard>

              {/* Key signals */}
              <SectionCard title="Key Signals">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Strongest Value Signal</p>
                    <p className="text-sm text-slate-700">{session.top_positive_signal || session.valuable_feature || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Main Friction</p>
                    <p className="text-sm text-slate-700">{session.top_concern || session.main_frustration || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recommended Next Step</p>
                    <p className="text-sm text-slate-700">{session.recommended_next_step || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Value Moment</p>
                    <p className="text-sm text-slate-700 italic">{session.value_moment || '—'}</p>
                  </div>
                </div>
              </SectionCard>

              {/* Company info */}
              <SectionCard title="Company Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoRow icon={Building2} label="Company" value={session.company_name} />
                  <InfoRow icon={User} label="Contact" value={`${session.contact_name}${session.contact_role ? ` (${session.contact_role})` : ''}`} />
                  <InfoRow icon={Mail} label="Email" value={session.email} />
                  <InfoRow icon={Phone} label="Phone" value={session.phone} />
                  <InfoRow icon={Users} label="Company Size" value={session.company_size} />
                  <InfoRow icon={Briefcase} label="Active Projects" value={String(session.active_projects)} />
                  <InfoRow icon={DollarSign} label="Annual Revenue" value={session.annual_revenue_range} />
                  <InfoRow icon={Briefcase} label="Service Type" value={session.primary_service_type} />
                </div>
                {session.current_software.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Software</p>
                    <div className="flex flex-wrap gap-1.5">
                      {session.current_software.map(s => (
                        <Badge key={s} label={s} className="bg-slate-100 text-slate-600 border-slate-200" />
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {tab === 'observation' && (
            <SectionCard title="Live Observation" subtitle={`${metrics.completed}/${metrics.total} tasks completed • ${metrics.needingHelp} needed help • Avg confusion: ${metrics.avgConfusionLabel}`}>
              <div className="space-y-2">
                {obsRows.map((row, i) => (
                  <div key={row.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-slate-400 flex-shrink-0">{i + 1}</span>
                        <span className="text-sm font-medium text-slate-900 truncate">{row.task_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge label={row.completed} className={row.completed === 'Yes' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : row.completed === 'Partially' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'} />
                        {row.needed_help === 'Yes' && <Badge label="Needed Help" className="bg-red-50 text-red-700 border-red-200" />}
                        <Badge label={row.confusion_level} className={row.confusion_level === 'High' ? 'bg-red-50 text-red-700 border-red-200' : row.confusion_level === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' : row.confusion_level === 'Low' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'} />
                      </div>
                    </div>
                    {row.time_taken && <p className="text-xs text-slate-500">Time: {row.time_taken}</p>}
                    {row.observer_notes && <p className="text-sm text-slate-600 mt-1">{row.observer_notes}</p>}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {tab === 'feedback' && (
            <SectionCard title="Customer Feedback">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Usability Rating</p>
                  <p className="text-sm text-slate-700">{session.overall_rating ? `${session.overall_rating}/5` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Attention Clarity</p>
                  <p className="text-sm text-slate-700">{session.attention_clarity || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Most Valuable Part</p>
                  <p className="text-sm text-slate-700">{session.valuable_feature || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Main Frustration</p>
                  <p className="text-sm text-slate-700">{session.main_frustration || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Missing Information</p>
                  <p className="text-sm text-slate-700">{session.missing_information || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Morning Usage Likelihood</p>
                  <p className="text-sm text-slate-700">{session.morning_usage_likelihood || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Value Moment</p>
                  <p className="text-sm text-slate-700 italic bg-amber-50/40 border border-amber-100 rounded-lg p-3">{session.value_moment || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">One Change Before Launch</p>
                  <p className="text-sm text-slate-700">{session.single_change || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recommendation Score</p>
                  <p className="text-sm text-slate-700">{session.recommendation_score >= 0 ? `${session.recommendation_score}/10` : '—'}</p>
                </div>
              </div>
            </SectionCard>
          )}

          {tab === 'commercial' && (
            <SectionCard title="Commercial Interest">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Estimated Time Saved', value: session.estimated_time_saved },
                  { label: 'Expected Monthly Price', value: session.expected_monthly_price },
                  { label: 'Preferred Plan', value: session.preferred_plan },
                  { label: 'Purchase Readiness', value: session.purchase_readiness },
                  { label: 'Main Buying Concern', value: session.main_buying_concern },
                  { label: 'Beta Interest', value: session.beta_interest },
                  { label: 'Testimonial Permission', value: session.testimonial_permission },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className="text-sm text-slate-700">{item.value || '—'}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {tab === 'requests' && (
            <SectionCard title="Feature Requests">
              {featureRequests.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No feature requests captured.</p>
              ) : (
                <div className="space-y-3">
                  {featureRequests.map((r, i) => (
                    <div key={r.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">Request {i + 1}</span>
                        <div className="flex items-center gap-1.5">
                          {r.importance && <Badge label={r.importance} className={r.importance === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' : r.importance === 'Important' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'} />}
                          {r.frequency && <Badge label={r.frequency} className="bg-blue-50 text-blue-700 border-blue-200" />}
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-900 mb-1">{r.request_text}</p>
                      {r.underlying_problem && <p className="text-sm text-slate-600 mb-2">Problem: {r.underlying_problem}</p>}
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {r.product_area && <Badge label={r.product_area} className="bg-slate-100 text-slate-600 border-slate-200" />}
                      </div>
                      {r.admin_notes && <p className="text-xs text-slate-500 mt-2 italic">Admin notes: {r.admin_notes}</p>}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-800">Customer requests are evidence, not automatic commitments.</p>
              </div>
            </SectionCard>
          )}

          {tab === 'follow-up' && (
            <SectionCard title="Follow-up">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Required</p>
                  <p className="text-sm text-slate-700">{session.follow_up_required ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                  <Badge label={fuStatus} className={fuClass} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</p>
                  <p className="text-sm text-slate-700">{fmtDate(session.follow_up_date)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Owner</p>
                  <p className="text-sm text-slate-700">{session.follow_up_owner || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</p>
                  <p className="text-sm text-slate-700">{session.follow_up_type || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                  <p className="text-sm text-slate-700">{session.follow_up_completed ? 'Yes' : 'No'}</p>
                </div>
                {session.follow_up_notes && (
                  <div className="md:col-span-2">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</p>
                    <p className="text-sm text-slate-700">{session.follow_up_notes}</p>
                  </div>
                )}
              </div>
              {session.follow_up_required && !session.follow_up_completed && (
                <button
                  onClick={completeFollowUp}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-lg transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Follow-up Complete
                </button>
              )}
            </SectionCard>
          )}

          {tab === 'activity' && (
            <SectionCard title="Activity Log">
              {activities.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No activity recorded.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map(a => (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type}</p>
                        {a.description && <p className="text-xs text-slate-500">{a.description}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">{fmtDateTime(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      {/* Archive confirmation */}
      {showArchive && (
        <Modal title="Archive Demo Session" onClose={() => setShowArchive(false)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Archive this demo session?
            </p>
            <p className="text-sm text-slate-500">
              The record will remain available in Customer Discovery history.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowArchive(false)}
                className="text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={archive}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 px-3.5 py-2 rounded-lg transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
