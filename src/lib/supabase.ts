import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole =
  | 'CONVAZANT_SUPER_ADMIN'
  | 'DECKARC_ADMIN'
  | 'GENERAL_CONTRACTOR'
  | 'SUBCONTRACTOR'
  | 'CLIENT';

export interface UserProfile {
  id: string; full_name: string; email: string; role: UserRole;
  organization_id: string | null; is_active: boolean; created_at: string;
  // contact
  phone_number: string | null; display_name: string | null;
  contact_address: string | null; ein: string | null;
  // business / role
  company_name: string | null; title: string | null; avatar_url: string | null;
  preferred_contact_method: string | null;
  // contractor compliance (GC)
  license_number: string | null; license_state: string | null;
  license_expiration: string | null; insurance_status: string | null;
  coi_expiration: string | null;
  // subcontractor / field
  trade_specialty: string | null; crew_size: number | null;
  // emergency (GC optional)
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
}

export interface ProjectMemberSafe {
  project_id: string; user_id: string; role_on_project: string;
  full_name: string; display_name: string | null; role: UserRole;
  company_name: string | null; trade_specialty: string | null;
}

export interface Project {
  id: string; organization_id: string; project_name: string; client_name: string;
  client_email: string; address: string; city: string; state: string; zip: string;
  county: string; jurisdiction: string; permit_authority: string;
  project_type: string; description: string; start_date: string | null;
  expected_finish_date: string | null; projected_finish_date: string | null;
  actual_finish_date: string | null; status: string; progress_percentage: number;
  alert_status: string; internal_notes: string; client_visible_notes: string; created_at: string;
}

export interface Task {
  id: string; project_id: string; task_name: string; category: string;
  task_type: string; priority: string;
  assigned_role: string; assigned_user_id: string | null;
  created_by_user_id: string | null; created_by_role: string;
  planned_start_date: string | null; planned_finish_date: string | null;
  projected_start_date: string | null; projected_finish_date: string | null;
  actual_start_date: string | null; actual_finish_date: string | null;
  status: string; progress_percentage: number; dependency_task_id: string | null;
  delay_source: string; delay_reason: string; delay_days: number;
  schedule_locked: boolean; weather_sensitive: boolean; weather_risk_type: string;
  blocked_reason: string; is_client_visible: boolean; internal_notes: string;
  client_visible_notes: string; alert_status: string; created_at: string;
}

export const TASK_TYPES = [
  'Project Task', 'Field Task', 'Client Request', 'Subcontractor Request',
  'GC Task', 'Inspection Task', 'Permit Task', 'Material Task',
  'File/Document Request', 'Change Request', 'Issue / Blocker',
  'Follow-Up', 'Internal Admin Task', 'Platform Support Task',
] as const;

export const TASK_STATUSES_EXTENDED = [
  'Draft', 'Needs Review', 'Open', 'Assigned', 'In Progress',
  'Blocked', 'Ready for Review', 'Completed', 'Closed', 'Cancelled',
] as const;

export const TASK_PRIORITIES = ['High', 'Medium', 'Low'] as const;

// Statuses that count as "needs attention" for field team / subcontractors.
// ProjectPulse count, My Tasks "Needs Attention" filter, and SubcontractorDashboard
// all use this same constant so the count and destination list always match.
export const FIELD_NEEDS_ATTENTION_STATUSES = [
  'Blocked',
  'Needs Review',
  'Ready for Review',
  'Waiting Review',
  'Response Needed',
] as const;

// The special filter key sent from the dashboard to TasksPage.
// TasksPage recognises this string and matches against FIELD_NEEDS_ATTENTION_STATUSES
// instead of doing an exact-status comparison.
export const FIELD_NEEDS_ATTENTION_FILTER = 'Needs Attention';

export interface DailyUpdate {
  id: string; project_id: string; task_id: string | null; user_id: string;
  update_date: string; work_completed_today: string; work_planned_tomorrow: string;
  current_status: string; blockers: string; delay_reason: string; delay_days: number;
  materials_delivered: string; materials_pending: string; permit_update: string;
  inspection_update: string; weather_issue: string; client_decision_needed: string;
  internal_note: string; client_visible_note: string; created_at: string;
}

export interface Permit {
  id: string; project_id: string; permit_required: boolean; permit_type: string;
  submitted_date: string | null; permit_number: string; permit_status: string;
  approval_date: string | null; expected_approval_date: string | null;
  actual_approval_date: string | null; revision_requested: boolean; revision_notes: string;
  resubmitted_date: string | null; permit_delay_expected: boolean; delay_reason: string;
  affected_task_ids: string; responsible_user_id: string | null; notes: string;
  alert_status: string; created_at: string;
  // Permit holder / contractor
  permit_pulled_by_name: string; permit_holder_company: string;
  permit_holder_contact_phone: string; permit_holder_contact_email: string;
  license_number: string; license_valid_until: string | null;
  permit_pull_date: string | null; inspection_responsibility: string;
  // Location (auto-filled from project)
  county: string; city: string; jurisdiction: string; permit_authority: string;
}

export interface Inspection {
  id: string; project_id: string; inspection_type: string; related_task_id: string | null;
  permit_number: string; permit_id: string | null; jurisdiction: string; requested_date: string | null;
  scheduled_date: string | null; inspector_name: string; result: string; result_date: string | null;
  correction_required: boolean; correction_notes: string; reinspection_required: boolean;
  reinspection_requested_date: string | null; reinspection_scheduled_date: string | null;
  reinspection_date: string | null; passed_date: string | null; delay_reason: string;
  responsible_party: string; inspection_status: string; notes: string;
  alert_status: string; created_at: string;
  inspection_requirement_id: string | null;
  attention_flag: boolean; sequence_warning: boolean; override_reason: string;
}

export interface ProjectInspectionRequirement {
  id: string; organization_id: string | null; project_id: string;
  permit_id: string | null; inspection_type: string;
  custom_inspection_name: string; custom_inspection_reason: string; is_custom: boolean;
  inspection_order: number; required: boolean; optional: boolean;
  prerequisite_inspection_id: string | null; related_phase: string;
  related_task_id: string | null;
  status: 'Pending' | 'Scheduled' | 'Passed' | 'Failed' | 'Correction Required' | 'Waived' | 'Not Required';
  readiness_status: 'Not Ready' | 'Ready' | 'Needs Attention' | 'Blocked';
  attention_flag: boolean; attention_reasons: string[];
  client_visible: boolean; client_message: string; notes: string;
  created_at: string; updated_at: string;
}

export interface WeatherRisk {
  id: string; project_id: string; risk_date: string; risk_type: string; risk_level: string;
  impacted_task_id: string | null; notes: string; delay_days: number; alert_status: string; created_at: string;
}

export interface ClientDecision {
  id: string; project_id: string; decision_title: string; description: string;
  needed_by_date: string | null; status: string; time_impact_days: number; cost_impact: number;
  client_visible_note: string; alert_status: string; created_at: string;
}

export interface ChangeOrder {
  id: string; project_id: string; change_order_number: string; title: string;
  requested_by: string; description: string; cost_impact: number; time_impact_days: number;
  approval_status: string; affected_task_id: string | null; schedule_update_required: boolean;
  approved_date: string | null; internal_notes: string; client_visible_notes: string; created_at: string;
}

export interface PaymentMilestone {
  id: string; project_id: string; milestone_name: string; amount: number; due_date: string | null;
  related_task_id: string | null; status: string; paid_date: string | null;
  payment_delay_expected: boolean; work_hold_required: boolean; days_overdue: number;
  responsible_party: string; affected_task_ids: string; invoice_sent_date: string | null;
  notes: string; alert_status: string; created_at: string;
}

export interface Material {
  id: string; project_id: string; related_task_id: string | null; material_name: string;
  material_category: string; quantity_required: number; quantity_ordered: number;
  quantity_delivered: number; unit: string; supplier_name: string; supplier_contact: string;
  order_status: string; ordered_date: string | null; expected_delivery_date: string | null;
  actual_delivery_date: string | null; delivery_location: string; material_ready_status: string;
  lead_time_days: number; responsible_party: string; notes: string; alert_status: string; created_at: string;
}

export interface Incident {
  id: string; project_id: string; related_task_id: string | null; related_material_id: string | null;
  incident_title: string; incident_type: string; incident_date: string; reported_by: string;
  responsible_party: string; affected_party: string; incident_description: string;
  location_on_site: string; severity_level: string; delay_expected: boolean;
  estimated_delay_days: number; actual_delay_days: number; cost_impact_expected: boolean;
  estimated_cost_impact: number; replacement_required: boolean; reorder_required: boolean;
  repair_required: boolean; insurance_claim_needed: boolean; client_notification_needed: boolean;
  admin_approval_required: boolean; incident_status: string; resolution_plan: string;
  resolution_due_date: string | null; resolved_date: string | null; notes: string;
  alert_status: string; created_at: string;
}

export interface RFI {
  id: string; project_id: string; related_task_id: string | null; question_title: string;
  question_description: string; asked_by: string; assigned_to: string; due_date: string | null;
  answer: string; status: string; delay_expected: boolean; estimated_delay_days: number;
  notes: string; alert_status: string; created_at: string;
}

export interface PhotoLog {
  id: string; project_id: string; related_task_id: string | null; uploaded_by: string | null;
  photo_category: string; photo_description: string; photo_url: string;
  taken_date: string; notes: string; created_at: string;
}

export interface PunchListItem {
  id: string; project_id: string; item_type: string; item_title: string; description: string;
  reported_by: string; responsible_party: string; due_date: string | null; status: string;
  completion_date: string | null; client_signoff_required: boolean; client_signoff_status: string;
  notes: string; alert_status: string; created_at: string;
}

export interface CommunicationLog {
  id: string; project_id: string; related_task_id: string | null; communication_type: string;
  date_time: string; sender: string; recipient: string; message_summary: string;
  delivery_method: string; follow_up_required: boolean; follow_up_due_date: string | null;
  notes: string; created_at: string;
}

export interface PhaseChecklist {
  id: string; project_id: string; phase_name: string; checklist_item: string; status: string;
  responsible_party: string; due_date: string | null; notes: string; sort_order: number; created_at: string;
}

export interface CrewConfirmation {
  id: string; project_id: string; task_id: string | null; subcontractor_user_id: string | null;
  scheduled_date: string; confirmation_status: string; crew_available: boolean;
  start_time_confirmed: boolean; scope_understood: boolean; material_reviewed: boolean;
  site_access_confirmed: boolean; questions_before_arrival: string; confirmation_notes: string;
  confirmed_at: string | null; alert_status: string; created_at: string;
}

export interface ScheduleChangeLog {
  id: string; project_id: string; affected_task_id: string | null; change_type: string;
  old_start_date: string | null; new_start_date: string | null; old_finish_date: string | null;
  new_finish_date: string | null; old_projected_finish_date: string | null;
  new_projected_finish_date: string | null; reason: string; responsible_party: string; created_at: string;
}

export interface WeeklyHealthReport {
  id: string; report_week_start: string; report_week_end: string; generated_by: string | null;
  report_summary: string; high_risk_projects: string; recommended_actions: string; created_at: string;
}

export interface ActivityLog {
  id: string; project_id: string | null; user_id: string | null;
  user_full_name: string; user_role: string; action_type: string;
  module: string; related_record_id: string | null; related_record_type: string;
  old_value: string; new_value: string; notes: string; created_at: string;
}

export interface ScheduleChangeRequest {
  id: string; project_id: string; requested_by_user_id: string | null;
  requested_by_name: string; requested_by_role: string;
  affected_task_id: string | null; change_type: string; delay_days: number;
  reason: string; status: string; reviewed_by_user_id: string | null;
  reviewed_at: string | null; admin_notes: string; approved_delay_days: number | null;
  created_at: string;
}

export interface ProjectCloseoutChecklist {
  id: string; project_id: string; item_name: string; status: string;
  completed_by_user_id: string | null; completed_at: string | null;
  notes: string; sort_order: number; created_at: string;
}

export interface ActionItemRecord {
  id: string; action_title: string; action_description: string;
  project_id: string | null; related_task_id: string | null;
  assigned_role: string; assigned_user_id: string | null;
  visible_to_roles: string; priority: string; due_date: string | null;
  status: string; client_visible: boolean; admin_approval_required: boolean;
  ai_recommended_next_step: string; notes: string;
  snoozed_until: string | null; resolved_at: string | null;
  resolved_by_user_id: string | null; source_type: string; source_id: string;
  updated_at: string; created_at: string;
}

export interface TaskResponse {
  id: string;
  task_id: string;
  project_id: string;
  responder_user_id: string;
  response_text: string;
  attachment_url: string | null;
  visibility: string;
  status: string;
  response_type: string;   // accepted | declined | question | material_list | quote | daily_update | admin_reply | general
  responder_role: string;  // stored at insert time for conversation display
  created_at: string;
  // joined fields (not in DB — loaded separately)
  responder_name?: string;
}

export interface NotificationPreferences {
  id: string; user_id: string; notifications_enabled: boolean;
  email_notifications: boolean; sms_notifications: boolean;
  preferred_method: string; quiet_hours_start: string | null;
  quiet_hours_end: string | null; notify_on_delay: boolean;
  notify_on_inspection: boolean; notify_on_payment_due: boolean;
  notify_on_client_decision: boolean; notify_on_daily_update: boolean;
  created_at: string; updated_at: string;
}
