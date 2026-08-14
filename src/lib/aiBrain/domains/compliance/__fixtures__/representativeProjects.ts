// Representative Compliance scenarios for the Phase 7 exit gate ("domain
// exceptions match human review, with no unauthorized consequential
// action"), same role as Project Ops' representativeProjects.ts.

import type { ReadinessPermit, ReadinessInspection, ReadinessComplianceDocument, ComplianceOverallStatus } from '../types.ts';

const TODAY = '2026-08-13';

export interface RepresentativeComplianceProject {
  projectId: string;
  projectName: string;
  asOfDate: string;
  permits: ReadinessPermit[];
  inspections: ReadinessInspection[];
  documents: ReadinessComplianceDocument[];
  expected: { overallStatus: ComplianceOverallStatus; aiShouldBeInvoked: boolean };
}

export const REPRESENTATIVE_COMPLIANCE_PROJECTS: RepresentativeComplianceProject[] = [
  {
    projectId: 'proj-carter', projectName: 'Carter Screened Porch', asOfDate: TODAY,
    permits: [{ id: 'carter-p1', project_id: 'proj-carter', permit_type: 'Building', permit_status: 'Approved', permit_expiration_date: '2027-01-01', revision_requested: false, correction_notes: '' }],
    inspections: [{ id: 'carter-i1', project_id: 'proj-carter', inspection_type: 'Framing', scheduled_date: TODAY, result: 'Passed', correction_required: false, correction_notes: '', reinspection_required: false, reinspection_scheduled_date: null }],
    documents: [{ id: 'carter-u1', full_name: 'Summit Electric', license_expiration: '2027-06-01', coi_expiration: '2027-06-01', insurance_status: 'Current' }],
    expected: { overallStatus: 'ready', aiShouldBeInvoked: false },
  },
  {
    projectId: 'proj-delgado', projectName: 'Delgado ADU Build', asOfDate: TODAY,
    permits: [{ id: 'delgado-p1', project_id: 'proj-delgado', permit_type: 'Zoning', permit_status: 'Correction Requested', permit_expiration_date: null, revision_requested: true, correction_notes: 'County requires an updated setback survey before resubmission' }],
    inspections: [],
    documents: [],
    expected: { overallStatus: 'blocked', aiShouldBeInvoked: true },
  },
  {
    projectId: 'proj-huang', projectName: 'Huang Basement Finish', asOfDate: TODAY,
    permits: [],
    inspections: [{ id: 'huang-i1', project_id: 'proj-huang', inspection_type: 'Electrical', scheduled_date: TODAY, result: 'Failed', correction_required: true, correction_notes: 'Missing GFCI protection on two circuits near the wet bar', reinspection_required: true, reinspection_scheduled_date: null }],
    documents: [],
    expected: { overallStatus: 'blocked', aiShouldBeInvoked: true },
  },
  {
    projectId: 'proj-osei', projectName: 'Osei Roof Replacement', asOfDate: TODAY,
    permits: [{ id: 'osei-p1', project_id: 'proj-osei', permit_type: 'Roofing', permit_status: 'Approved', permit_expiration_date: null, revision_requested: false, correction_notes: '' }],
    inspections: [],
    documents: [{ id: 'osei-u1', full_name: 'Ridge Roofing Co', license_expiration: null, coi_expiration: '2026-08-18', insurance_status: 'Current' }],
    expected: { overallStatus: 'at_risk', aiShouldBeInvoked: false },
  },
  {
    projectId: 'proj-farrell', projectName: 'Farrell Primary Bath Remodel', asOfDate: TODAY,
    permits: [{ id: 'farrell-p1', project_id: 'proj-farrell', permit_type: 'Plumbing', permit_status: 'Approved', permit_expiration_date: '2026-12-01', revision_requested: false, correction_notes: '' }],
    inspections: [{ id: 'farrell-i1', project_id: 'proj-farrell', inspection_type: 'Rough Plumbing', scheduled_date: null, result: 'Passed', correction_required: false, correction_notes: '', reinspection_required: false, reinspection_scheduled_date: null }],
    documents: [{ id: 'farrell-u1', full_name: 'Blue Ridge Plumbing', license_expiration: null, coi_expiration: null, insurance_status: 'Expired' }],
    expected: { overallStatus: 'at_risk', aiShouldBeInvoked: false },
  },
];
