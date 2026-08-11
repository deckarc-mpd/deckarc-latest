import { Mail, MessageSquare, Cloud, Calendar, BookOpen, CreditCard, Database, Sparkles, MapPin, Shield } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  status: 'Connected' | 'Simulated' | 'Placeholder' | 'Not Connected';
  icon: React.ElementType;
  note?: string;
  lastSync?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'email',
    name: 'Email Notifications',
    description: 'Send project updates, alerts, and reminders via email to team members and clients.',
    status: 'Simulated',
    icon: Mail,
    note: 'Email is simulated in the current environment. Configure SMTP or SendGrid for production.',
  },
  {
    id: 'sms',
    name: 'SMS Notifications',
    description: 'Send urgent field alerts, inspection reminders, and critical notifications via SMS.',
    status: 'Simulated',
    icon: MessageSquare,
    note: 'SMS is simulated. Configure Twilio or a similar provider for production.',
  },
  {
    id: 'ai',
    name: 'AI Assistant',
    description: 'Ask CP360 AI assistant for project summaries, risk detection, and draft communication.',
    status: 'Simulated',
    icon: Sparkles,
    note: 'AI responses are currently simulated. Configure an AI provider (e.g., Anthropic, OpenAI) for live responses.',
  },
  {
    id: 'weather',
    name: 'Weather API',
    description: 'Auto-detect weather risks for outdoor tasks, inspections, and crew scheduling.',
    status: 'Placeholder',
    icon: Cloud,
    note: 'Weather integration is a placeholder. Manual weather entry is available in project tasks.',
  },
  {
    id: 'calendar',
    name: 'Calendar Sync',
    description: 'Sync inspections, milestones, crew schedules, and client walkthroughs to calendar apps.',
    status: 'Placeholder',
    icon: Calendar,
    note: 'Calendar sync is a placeholder. Configure Google Calendar or Outlook Calendar for production.',
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    description: 'Sync project payments, invoices, and financial records with QuickBooks.',
    status: 'Placeholder',
    icon: BookOpen,
    note: 'QuickBooks integration is a placeholder for future SaaS readiness.',
  },
  {
    id: 'payments',
    name: 'Payment Processing',
    description: 'Accept client payments, track payment milestones, and send payment reminders.',
    status: 'Placeholder',
    icon: CreditCard,
    note: 'Payment processing is a placeholder. Configure Stripe or similar for production.',
  },
  {
    id: 'storage',
    name: 'File Storage',
    description: 'Store permits, plans, photos, receipts, and project documents securely.',
    status: 'Simulated',
    icon: Database,
    note: 'File metadata is saved. Configure Supabase Storage or AWS S3 for actual file uploads.',
  },
  {
    id: 'permits',
    name: 'Permit / Inspection Portal',
    description: 'Auto-lookup permit status from county/city permit portals by permit number.',
    status: 'Placeholder',
    icon: MapPin,
    note: 'Permit portal integration is a placeholder. Manual entry and portal link tracking are available.',
  },
];

const statusColors = {
  Connected: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Simulated: 'bg-amber-100 text-amber-700 border-amber-200',
  Placeholder: 'bg-concrete-100 text-concrete-600 border-concrete-200',
  'Not Connected': 'bg-hazard-50 text-hazard-600 border-hazard-200',
};

const statusDots = {
  Connected: 'bg-emerald-500',
  Simulated: 'bg-amber-400',
  Placeholder: 'bg-concrete-400',
  'Not Connected': 'bg-hazard-500',
};

export default function IntegrationSettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 bg-steel-800 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-concrete-900">Integration Settings</h1>
          <p className="text-sm text-concrete-500 mt-0.5">
            Admin-only view of all CP360 integrations. Configure connections for production use.
          </p>
        </div>
      </div>

      {/* Admin notice */}
      <div className="bg-steel-50 border border-steel-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <Shield className="w-4 h-4 text-steel-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-steel-800">Admin Access Only</p>
          <p className="text-xs text-steel-600 mt-0.5">
            Integration settings are visible to CONVAZANT Super Admin and Company Admin only.
            Do not share API keys, tokens, or credentials here. All secrets are managed through
            secure environment configuration.
          </p>
        </div>
      </div>

      {/* Integration grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATIONS.map(integration => {
          const Icon = integration.icon;
          return (
            <div
              key={integration.id}
              className="bg-white border border-concrete-200 rounded-2xl shadow-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 bg-concrete-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-steel-600" />
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide whitespace-nowrap ${statusColors[integration.status]}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusDots[integration.status]}`} />
                  {integration.status}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-concrete-900 mb-1">{integration.name}</h3>
                <p className="text-xs text-concrete-500 leading-relaxed">{integration.description}</p>
              </div>

              {integration.lastSync && (
                <p className="text-[10px] text-concrete-400 font-medium">
                  Last sync: {integration.lastSync}
                </p>
              )}

              {integration.note && (
                <div className="bg-concrete-50 border border-concrete-100 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-concrete-500 leading-relaxed">{integration.note}</p>
                </div>
              )}

              <button
                disabled
                className="mt-auto text-xs font-semibold px-3 py-2 bg-concrete-100 text-concrete-400 rounded-lg cursor-not-allowed text-center"
              >
                Configure — Admin Only
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-concrete-400 text-center">
        All API keys, tokens, and credentials must be configured securely through environment variables.
        Never expose secrets in the frontend. Contact CONVAZANT for integration setup assistance.
      </p>
    </div>
  );
}
