export function getAlertColor(status: string): string {
  switch (status) {
    case 'green': return 'text-site-700 bg-site-50 border-site-200';
    case 'yellow': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'red': return 'text-hazard-700 bg-hazard-50 border-hazard-200';
    default: return 'text-concrete-600 bg-concrete-50 border-concrete-200';
  }
}

export function getAlertDot(status: string): string {
  switch (status) {
    case 'green': return 'bg-site-500';
    case 'yellow': return 'bg-amber-500';
    case 'red': return 'bg-hazard-500';
    default: return 'bg-concrete-400';
  }
}

export function getStatusBadge(status: string): string {
  const map: Record<string, string> = {
    'On Track':               'text-site-700 bg-site-100',
    'Planning':               'text-amber-700 bg-amber-100',
    'In Progress':            'text-steel-700 bg-steel-100',
    'Delayed':                'text-hazard-700 bg-hazard-100',
    'Completed':              'text-site-700 bg-site-100',
    'On Hold':                'text-concrete-600 bg-concrete-100',
    'Permit':                 'text-amber-700 bg-amber-100',
    'Not Started':            'text-concrete-600 bg-concrete-100',
    'Waiting':                'text-amber-700 bg-amber-100',
    'Blocked':                'text-hazard-700 bg-hazard-100',
    'Approved':               'text-site-700 bg-site-100',
    'Rejected':               'text-hazard-700 bg-hazard-100',
    'Passed':                 'text-site-700 bg-site-100',
    'Failed':                 'text-hazard-700 bg-hazard-100',
    'Submitted':              'text-steel-700 bg-steel-100',
    'Under Review':           'text-amber-700 bg-amber-100',
    'Revision Required':      'text-hazard-700 bg-hazard-100',
    'Draft':                  'text-concrete-600 bg-concrete-100',
    'Sent':                   'text-steel-700 bg-steel-100',
    'Overdue':                'text-hazard-700 bg-hazard-100',
    'Paid':                   'text-site-700 bg-site-100',
    'Due':                    'text-amber-700 bg-amber-100',
    'Not Due':                'text-concrete-600 bg-concrete-100',
    'Scheduled':              'text-steel-700 bg-steel-100',
    'Not Scheduled':          'text-concrete-600 bg-concrete-100',
    'Reinspection Required':  'text-hazard-700 bg-hazard-100',
    'Needed':                 'text-amber-700 bg-amber-100',
    'Waiting on Client':      'text-amber-700 bg-amber-100',
    'Received':               'text-site-700 bg-site-100',
    'On Hold (CO)':           'text-concrete-600 bg-concrete-100',
  };
  return map[status] || 'text-concrete-600 bg-concrete-100';
}

export function calculateTaskAlert(task: {
  planned_finish_date: string | null;
  status: string;
}): string {
  if (task.status === 'Completed') return 'green';
  if (!task.planned_finish_date) return 'green';
  const today = new Date();
  const due = new Date(task.planned_finish_date);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'red';
  if (diffDays <= 2) return 'yellow';
  return 'green';
}

export function calculatePermitAlert(permit: {
  permit_required: boolean;
  permit_status: string;
}): string {
  if (!permit.permit_required) return 'green';
  if (permit.permit_status === 'Approved') return 'green';
  if (permit.permit_status === 'Rejected' || permit.permit_status === 'Revision Required') return 'red';
  if (permit.permit_status === 'Not Started') return 'yellow';
  return 'yellow';
}

export function calculateInspectionAlert(inspection: { result: string }): string {
  if (inspection.result === 'Passed') return 'green';
  if (inspection.result === 'Failed' || inspection.result === 'Reinspection Required') return 'red';
  if (inspection.result === 'Not Scheduled') return 'yellow';
  return 'yellow';
}

export function calculateDecisionAlert(decision: {
  needed_by_date: string | null;
  status: string;
}): string {
  if (decision.status === 'Received') return 'green';
  if (!decision.needed_by_date) return 'yellow';
  const today = new Date();
  const due = new Date(decision.needed_by_date);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'red';
  if (diffDays <= 2) return 'yellow';
  return 'green';
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    CONVAZANT_SUPER_ADMIN: 'Platform Admin',
    DECKARC_ADMIN:         'Company Admin',
    GENERAL_CONTRACTOR:    'General Contractor',
    SUBCONTRACTOR:         'Subcontractor',
    CLIENT:                'Client / Homeowner',
    PROJECT_MANAGER:       'Project Manager',
    VENDOR:                'Vendor / Supplier',
    SUPPLIER:              'Vendor / Supplier',
  };
  return map[role] || role;
}
