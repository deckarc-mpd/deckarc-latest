// ── Customer Discovery module: types and constants ──────────────────────────

export interface ObservationTask {
  id: string;
  session_id: string;
  sort_order: number;
  task_name: string;
  completed: 'Yes' | 'No' | 'Partially';
  needed_help: 'Yes' | 'No';
  time_taken: string;
  confusion_level: 'None' | 'Low' | 'Medium' | 'High';
  observer_notes: string;
  created_at: string;
}

export interface FeatureRequest {
  id: string;
  session_id: string;
  sort_order: number;
  request_text: string;
  underlying_problem: string;
  product_area: string;
  importance: 'Critical' | 'Important' | 'Nice to Have' | '';
  frequency: 'Daily' | 'Weekly' | 'Occasionally' | 'Rarely' | '';
  admin_notes: string;
  created_at: string;
}

export interface DiscoveryActivity {
  id: string;
  session_id: string;
  activity_type: string;
  description: string;
  created_at: string;
  created_by: string | null;
}

export interface DiscoverySession {
  id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  status: 'Draft' | 'Completed' | 'Archived';

  // A. Company Information
  company_name: string;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string;
  company_size: string;
  active_projects: number;
  annual_revenue_range: string;
  primary_service_type: string;
  current_software: string[];
  referral_source: string;

  // B. Demo Information
  demo_date: string | null;
  presenter: string;
  demo_duration_minutes: number;
  demo_type: string;
  product_version: string;
  demo_environment: string;
  demo_goals: string;

  // C. Live Observation
  task_completion_rate: number;
  tasks_needing_help: number;
  average_confusion_level: string;

  // D. Customer Feedback
  overall_rating: number;
  attention_clarity: string;
  valuable_feature: string;
  main_frustration: string;
  missing_information: string;
  morning_usage_likelihood: string;
  value_moment: string;
  single_change: string;
  recommendation_score: number;

  // E. Commercial Interest
  estimated_time_saved: string;
  expected_monthly_price: string;
  preferred_plan: string;
  purchase_readiness: string;
  main_buying_concern: string;
  beta_interest: string;
  testimonial_permission: string;

  // F. Demo Outcome
  outcome: string;
  outcome_reason: string;
  top_positive_signal: string;
  top_concern: string;
  recommended_next_step: string;

  // G. Follow-up
  follow_up_required: boolean;
  follow_up_date: string | null;
  follow_up_owner: string;
  follow_up_type: string;
  follow_up_notes: string;
  follow_up_completed: boolean;

  // H. Internal Notes
  internal_summary: string;
  what_we_learned: string;
  product_changes: string;
  sales_notes: string;
  marketing_language: string;

  // AI Summary
  ai_summary: string;

  created_by: string | null;
}

export interface DiscoverySessionWithRelations extends DiscoverySession {
  observations: ObservationTask[];
  feature_requests: FeatureRequest[];
  activities: DiscoveryActivity[];
}

// ── Option lists ──────────────────────────────────────────────────────────────

export const CONTACT_ROLES = [
  'Owner', 'General Contractor', 'Project Manager',
  'Superintendent', 'Office Administrator', 'Sales', 'Other',
] as const;

export const COMPANY_SIZES = [
  '1–5 employees', '6–10 employees', '11–25 employees',
  '26–50 employees', '51+ employees',
] as const;

export const ANNUAL_REVENUE_RANGES = [
  'Under $500K', '$500K–$1M', '$1M–$3M', '$3M–$5M',
  '$5M–$10M', '$10M+',
] as const;

export const PRIMARY_SERVICE_TYPES = [
  'Remodeling', 'Custom Home Building', 'General Contracting',
  'Roofing', 'Restoration', 'Specialty Contractor', 'Other',
] as const;

export const CURRENT_SOFTWARE_OPTIONS = [
  'None', 'Excel / Spreadsheets', 'WhatsApp / Text Messages',
  'Buildertrend', 'JobTread', 'Houzz Pro', 'Procore',
  'CoConstruct', 'Monday.com', 'Other',
] as const;

export const DEMO_TYPES = [
  'In Person', 'Video Call', 'Phone Call', 'Self-Guided', 'Follow-up Demo',
] as const;

export const DEMO_ENVIRONMENTS = [
  'Production', 'Beta', 'Prototype', 'Recorded Demo',
] as const;

export const ATTENTION_CLARITY_OPTIONS = [
  'Yes', 'Mostly', 'Somewhat', 'No',
] as const;

export const MORNING_USAGE_OPTIONS = [
  'Definitely', 'Probably', 'Maybe', 'Probably Not',
] as const;

export const TIME_SAVED_OPTIONS = [
  'None', 'Less than 1 hour', '1–2 hours', '3–5 hours',
  '5–10 hours', 'More than 10 hours',
] as const;

export const EXPECTED_PRICE_OPTIONS = [
  'Under $100', '$100–$199', '$200–$399', '$400–$699',
  '$700+', 'Unsure',
] as const;

export const PREFERRED_PLAN_OPTIONS = [
  'Founder', 'Growth', 'Professional', 'Enterprise', 'Unsure',
] as const;

export const PURCHASE_READINESS_OPTIONS = [
  'Ready Now', 'Within 30 Days', 'Within 3 Months',
  'Interested but Not Ready', 'Not Interested',
] as const;

export const MAIN_BUYING_CONCERN_OPTIONS = [
  'Price', 'Missing Feature', 'Team Adoption', 'Implementation',
  'Data Migration', 'Security', 'Integrations',
  'Product Maturity', 'Other',
] as const;

export const YES_MAYBE_NO = ['Yes', 'Maybe', 'No'] as const;

export const OUTCOMES = [
  'Strong Interest', 'Interested', 'Needs Follow-up', 'Not a Fit',
] as const;

export const NEXT_STEP_OPTIONS = [
  'Start Trial', 'Send Proposal', 'Schedule Follow-up',
  'Invite to Beta', 'Send Product Information', 'No Further Action',
] as const;

export const FOLLOW_UP_TYPES = [
  'Phone Call', 'Email', 'Product Demo', 'Proposal',
  'Beta Invitation', 'Onboarding', 'Other',
] as const;

export const PRODUCT_AREAS = [
  'Dashboard', 'Project Pulse', 'Action Board', 'Projects',
  'Scheduling', 'Client Portal', 'Daily Updates', 'Timeline',
  'Photos', 'Reports', 'Mobile', 'AI', 'Integrations',
  'Pricing', 'Onboarding', 'Other',
] as const;

export const IMPORTANCE_OPTIONS = [
  'Critical', 'Important', 'Nice to Have',
] as const;

export const FREQUENCY_OPTIONS = [
  'Daily', 'Weekly', 'Occasionally', 'Rarely',
] as const;

export const SIGNAL_STATUSES = [
  'Reviewing', 'Planned', 'In Progress', 'Released', 'Not Planned',
] as const;

export const DEFAULT_OBSERVATION_TASKS = [
  'Sign In',
  'Understand Dashboard',
  'Identify What Needs Attention',
  'Create a Project',
  'Review Project Pulse',
  "Find Today's Work",
  'Create an Action Item',
  'Add a Daily Update',
  'Review Timeline',
  'Open Client Portal',
];

export const OUTCOME_BADGE_STYLES: Record<string, string> = {
  'Strong Interest':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Interested':         'bg-blue-50 text-blue-700 border-blue-200',
  'Needs Follow-up':    'bg-amber-50 text-amber-700 border-amber-200',
  'Not a Fit':          'bg-slate-100 text-slate-500 border-slate-200',
};

export const STATUS_BADGE_STYLES: Record<string, string> = {
  'Draft':     'bg-slate-100 text-slate-600 border-slate-200',
  'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Archived':  'bg-slate-200 text-slate-500 border-slate-300',
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  created: 'Session created',
  edited: 'Session edited',
  outcome_changed: 'Outcome changed',
  follow_up_scheduled: 'Follow-up scheduled',
  follow_up_completed: 'Follow-up completed',
  archived: 'Session archived',
};

export function emptySession(): Omit<DiscoverySession, 'id' | 'created_at' | 'updated_at' | 'created_by'> {
  return {
    archived_at: null,
    status: 'Draft',
    company_name: '',
    contact_name: '',
    contact_role: '',
    email: '',
    phone: '',
    company_size: '',
    active_projects: 0,
    annual_revenue_range: '',
    primary_service_type: '',
    current_software: [],
    referral_source: '',
    demo_date: null,
    presenter: '',
    demo_duration_minutes: 0,
    demo_type: '',
    product_version: '',
    demo_environment: '',
    demo_goals: '',
    task_completion_rate: 0,
    tasks_needing_help: 0,
    average_confusion_level: '',
    overall_rating: 0,
    attention_clarity: '',
    valuable_feature: '',
    main_frustration: '',
    missing_information: '',
    morning_usage_likelihood: '',
    value_moment: '',
    single_change: '',
    recommendation_score: 0,
    estimated_time_saved: '',
    expected_monthly_price: '',
    preferred_plan: '',
    purchase_readiness: '',
    main_buying_concern: '',
    beta_interest: '',
    testimonial_permission: '',
    outcome: '',
    outcome_reason: '',
    top_positive_signal: '',
    top_concern: '',
    recommended_next_step: '',
    follow_up_required: false,
    follow_up_date: null,
    follow_up_owner: '',
    follow_up_type: '',
    follow_up_notes: '',
    follow_up_completed: false,
    internal_summary: '',
    what_we_learned: '',
    product_changes: '',
    sales_notes: '',
    marketing_language: '',
    ai_summary: '',
  };
}

export function defaultObservations(): { task_name: string; sort_order: number }[] {
  return DEFAULT_OBSERVATION_TASKS.map((task_name, i) => ({
    task_name,
    sort_order: i,
  }));
}

export const CONFUSION_RANK: Record<string, number> = {
  None: 0, Low: 1, Medium: 2, High: 3,
};
