// Sales (Maya / sales) domain types — Phase 9. Row shape narrowed to
// real cp360_leads columns. There is no last-contacted/status-changed-at
// column in the schema — staleness is deliberately derived only from
// created_at + current status, not invented from a field that doesn't
// exist.

export interface ReadinessLead {
  id: string;
  full_name: string;
  company_name: string;
  status: string; // 'new' | 'contacted' | 'qualified' | 'declined'
  created_at: string; // ISO timestamp
}

export interface StaleLeadFinding {
  leadId: string;
  fullName: string;
  companyName: string;
  status: string;
  daysSinceCreated: number;
}

export interface LeadFollowUpDraft {
  leadId: string;
  subject: string;
  body: string;
}
