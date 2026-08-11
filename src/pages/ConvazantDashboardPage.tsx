import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ProjectPulse from '../components/ProjectPulse';
import {
  Building2, Users, ShieldCheck, Globe, Settings, AlertTriangle,
  CheckCircle, Clock, Database, Mail, MessageSquare, Cpu, Cloud,
  CreditCard, Calendar, Zap, RefreshCw, Eye, ArrowRight,
  Activity, Lock, FileText, HardHat, Sparkles
} from 'lucide-react';

interface WorkspaceSummary {
  name: string;
  status: 'Active' | 'Trial' | 'Suspended' | 'Archived';
  projectCount: number;
  userCount: number;
  alertCount: number;
  plan: string;
}

interface IntegrationStatus {
  name: string;
  icon: React.ElementType;
  status: 'Connected' | 'Simulated' | 'Not Connected' | 'Placeholder';
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

const INTEGRATIONS: IntegrationStatus[] = [
  { name: 'Email Delivery',   icon: Mail,           status: 'Simulated' },
  { name: 'SMS / Text',       icon: MessageSquare,  status: 'Simulated' },
  { name: 'AI Assistant',     icon: Sparkles,       status: 'Simulated' },
  { name: 'File Storage',     icon: Database,       status: 'Simulated' },
  { name: 'Weather API',      icon: Cloud,          status: 'Simulated' },
  { name: 'QuickBooks',       icon: FileText,       status: 'Placeholder' },
  { name: 'Payments',         icon: CreditCard,     status: 'Placeholder' },
  { name: 'Calendar Sync',    icon: Calendar,       status: 'Placeholder' },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: '1', action: 'Viewed workspace', actor: 'convazant.admin@test.com', target: 'DECKARC LLC', timestamp: '2026-05-23 09:14', severity: 'info' },
  { id: '2', action: 'Role changed: GC → Admin', actor: 'convazant.admin@test.com', target: 'gc@test.com', timestamp: '2026-05-22 15:30', severity: 'warning' },
  { id: '3', action: 'Workspace settings updated', actor: 'deckarc.admin@test.com', target: 'DECKARC LLC', timestamp: '2026-05-22 11:00', severity: 'info' },
  { id: '4', action: 'Client preview accessed', actor: 'convazant.admin@test.com', target: 'client@test.com', timestamp: '2026-05-21 16:45', severity: 'info' },
];

const INTEGRATION_STATUS_STYLES: Record<IntegrationStatus['status'], string> = {
  'Connected':     'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Simulated':     'bg-amber-50 text-amber-700 border-amber-200',
  'Not Connected': 'bg-red-50 text-red-700 border-red-200',
  'Placeholder':   'bg-slate-100 text-slate-500 border-slate-200',
};

const WORKSPACE_STATUS_STYLES: Record<WorkspaceSummary['status'], string> = {
  'Active':    'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Trial':     'bg-amber-50 text-amber-700 border-amber-200',
  'Suspended': 'bg-red-50 text-red-700 border-red-200',
  'Archived':  'bg-slate-100 text-slate-500 border-slate-200',
};

function SectionLabel({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      <span className="section-label">{title}</span>
      {description && <span className="text-xs text-slate-400 font-normal normal-case tracking-normal">— {description}</span>}
    </div>
  );
}

export default function ConvazantDashboardPage({ onEnterWorkspace }: { onEnterWorkspace?: () => void }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [projectCount, setProjectCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [userAlertCount, setUserAlertCount] = useState(0);

  const workspaces: WorkspaceSummary[] = [
    { name: 'DECKARC LLC', status: 'Active', projectCount, userCount: totalUsers, alertCount, plan: 'Professional' },
  ];

  useEffect(() => { loadPlatformData(); }, []);

  async function loadPlatformData() {
    setLoading(true);
    const [usersRes, projectsRes, alertsRes] = await Promise.all([
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('alert_status', 'red'),
    ]);
    const missingConsent = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false);

    setTotalUsers(usersRes.count || 0);
    setProjectCount(projectsRes.count || 0);
    setAlertCount(alertsRes.count || 0);
    setUserAlertCount(missingConsent.count || 0);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm font-medium">Loading platform overview...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <Globe className="w-4.5 h-4.5 text-amber-400" style={{ width: '18px', height: '18px' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Platform Dashboard</h1>
                <span className="text-[10px] font-bold bg-slate-900 text-amber-400 px-2 py-0.5 rounded-lg uppercase tracking-wider">CONVAZANT</span>
              </div>
              <p className="text-xs text-slate-400">
                Welcome, {profile?.full_name?.split(' ')[0] || 'Platform Admin'}&nbsp;&mdash;&nbsp;{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
        <button onClick={loadPlatformData} className="btn-ghost">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Platform Pulse ── */}
      <ProjectPulse />

      {/* ── Platform Overview Stats ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <SectionLabel icon={Activity} title="Platform Overview" description="High-level metrics across all workspaces" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Workspaces',    value: 1,           icon: Building2,    color: 'blue'    as const },
            { label: 'Total Platform Users', value: totalUsers,  icon: Users,        color: 'blue'    as const },
            { label: 'Workspace Requests',   value: 0,           icon: Clock,        color: 'neutral' as const },
            { label: 'Workspace Alerts',     value: alertCount,  icon: AlertTriangle,color: alertCount > 0 ? 'red' as const : 'green' as const },
          ].map(({ label, value, icon: Icon, color }) => {
            const c = {
              blue:    { bg: 'bg-blue-50 border-blue-200',       icon: 'text-blue-600 bg-blue-100',       val: 'text-blue-800' },
              green:   { bg: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600 bg-emerald-50',  val: 'text-emerald-700' },
              red:     { bg: 'bg-red-50 border-red-200',         icon: 'text-red-600 bg-red-100',         val: 'text-red-700' },
              neutral: { bg: 'bg-slate-50 border-slate-200',     icon: 'text-slate-500 bg-slate-100',     val: 'text-slate-700' },
            }[color];
            return (
              <div key={label} className={`rounded-xl border p-4 hover:shadow-md transition-shadow ${c.bg}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${c.icon}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className={`text-2xl font-bold mb-0.5 leading-none ${c.val}`}>{value}</p>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Workspace Management + Security ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Workspace Management */}
        <div className="lg:col-span-2 space-y-4">

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <SectionLabel icon={Building2} title="Workspace Management" description="Manage active company workspaces" />
            {workspaces.map(ws => (
              <div key={ws.name} className="border border-slate-100 rounded-xl p-4 mb-3 last:mb-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <HardHat className="w-5 h-5 text-slate-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{ws.name}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${WORKSPACE_STATUS_STYLES[ws.status]}`}>
                          {ws.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{ws.plan} Plan</p>
                    </div>
                  </div>
                  <button onClick={onEnterWorkspace} className="btn-secondary text-xs py-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Enter Workspace
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Projects', value: ws.projectCount, warn: false },
                    { label: 'Users',    value: ws.userCount,    warn: false },
                    { label: 'Alerts',   value: ws.alertCount,   warn: ws.alertCount > 0 },
                  ].map(({ label, value, warn }) => (
                    <div key={label} className={`rounded-lg p-3 text-center ${warn ? 'bg-red-50' : 'bg-slate-50'}`}>
                      <p className={`text-lg font-bold ${warn ? 'text-red-700' : 'text-slate-800'}`}>{value}</p>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Pending Requests */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <SectionLabel icon={Clock} title="Workspace Requests" description="New company onboarding and access requests" />
            <div className="border border-dashed border-slate-200 rounded-xl p-5 flex items-center justify-between bg-slate-50/30">
              <div>
                <p className="text-sm font-semibold text-slate-600">No Pending Requests</p>
                <p className="text-xs text-slate-400 mt-0.5">New workspace requests will appear here for review.</p>
              </div>
              <button className="btn-primary text-xs opacity-40 cursor-not-allowed" disabled>
                Review Requests
              </button>
            </div>
          </div>
        </div>

        {/* Security + Users */}
        <div className="space-y-4">

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <SectionLabel icon={ShieldCheck} title="Security &amp; Consent" description="Platform compliance status" />
            <div className="divide-y divide-slate-50">
              {[
                { icon: ShieldCheck,   label: 'Missing AI Consent',  value: userAlertCount, warn: userAlertCount > 0 },
                { icon: FileText,      label: 'Terms Version',        value: 'v1.0',         warn: false, isText: true },
                { icon: Lock,          label: 'Access Requests',      value: 0,              warn: false },
                { icon: AlertTriangle, label: 'Cross-Workspace Flags',value: 0,              warn: false },
              ].map(({ icon: Icon, label, value, warn, isText }) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600">{label}</span>
                  </div>
                  {isText
                    ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">{value}</span>
                    : <span className={`text-sm font-bold ${warn ? 'text-amber-600' : 'text-slate-500'}`}>{value}</span>
                  }
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <SectionLabel icon={Users} title="Platform Users" description="Breakdown by role" />
            <div className="divide-y divide-slate-50">
              {[
                { label: 'CONVAZANT Admins',    count: 1 },
                { label: 'Company Admins',       count: 1 },
                { label: 'Field Users (GC/Sub)', count: 2 },
                { label: 'Clients',              count: 1 },
              ].map(({ label, count }) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-slate-600">{label}</span>
                  <span className="text-sm font-bold text-slate-700">{count}</span>
                </div>
              ))}
            </div>
            <button className="btn-secondary w-full text-xs mt-3">
              <Users className="w-3.5 h-3.5" />
              Manage Platform Users
            </button>
          </div>
        </div>
      </div>

      {/* ── Integration Status ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <SectionLabel icon={Cpu} title="Integration Status" description="Live status of all platform integrations" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {INTEGRATIONS.map(({ name, icon: Icon, status }) => (
            <div key={name} className="flex items-center justify-between gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/30 hover:bg-white hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0 ${INTEGRATION_STATUS_STYLES[status]}`}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Audit Log + Developer Tools ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Audit Log */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <SectionLabel icon={Lock} title="Support &amp; Audit Log" description="Recent admin access and changes" />
          <div className="divide-y divide-slate-50">
            {MOCK_AUDIT.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 py-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                  entry.severity === 'critical' ? 'bg-red-500' :
                  entry.severity === 'warning'  ? 'bg-amber-500' : 'bg-blue-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800">{entry.action}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-slate-500">{entry.actor}</span>
                    <span className="text-slate-300 text-[11px]">→</span>
                    <span className="text-[11px] text-slate-600 font-medium">{entry.target}</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{entry.timestamp.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          <button className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-colors">
            View full audit log <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Developer Tools */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <SectionLabel icon={Sparkles} title="Developer Tools" description="Platform health and debug tools" />

          {/* Dark developer panel */}
          <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl mb-4">
            <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">CP360 Developer Assistant</p>
              <p className="text-xs text-slate-400">AI-powered platform debugging and analysis</p>
            </div>
            <span className="text-[10px] font-bold bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0">Beta</span>
          </div>

          <div className="divide-y divide-slate-50">
            {[
              { label: 'App Health / Build Status', icon: Activity,       value: 'Healthy',       ok: true },
              { label: 'Database Tables',           icon: Database,       value: 'All Reachable', ok: true },
              { label: 'Error Log',                 icon: AlertTriangle,  value: '0 Errors',      ok: true },
              { label: 'API Response Time',         icon: Zap,            value: '~120ms avg',    ok: true },
            ].map(({ label, icon: Icon, value, ok }) => (
              <div key={label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-700">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                  <span className={`text-xs font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="btn-secondary w-full text-xs mt-3">
            <Settings className="w-3.5 h-3.5" />
            Platform Settings &amp; Config
          </button>
        </div>

      </div>
    </div>
  );
}
