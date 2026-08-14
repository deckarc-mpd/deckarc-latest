// Shared status-color mapping for every AI Brain UI surface (Compliance,
// Finance, Sales, Estimator panels) — reuses the exact same semantic
// palette as src/lib/alertUtils.ts's getStatusBadge/getAlertDot (site =
// green/good, amber = caution, hazard = red/blocked) so these new panels
// read as part of the same product, not a bolted-on style.

export type AiOverallStatus = 'ready' | 'at_risk' | 'blocked';

export function overallStatusBadgeClasses(status: AiOverallStatus): string {
  switch (status) {
    case 'ready': return 'text-site-700 bg-site-100';
    case 'at_risk': return 'text-amber-700 bg-amber-100';
    case 'blocked': return 'text-hazard-700 bg-hazard-100';
  }
}

export function overallStatusLabel(status: AiOverallStatus): string {
  switch (status) {
    case 'ready': return 'Ready';
    case 'at_risk': return 'At Risk';
    case 'blocked': return 'Blocked';
  }
}

export type GateStatus = 'ready' | 'not_ready';

export function gateStatusBadgeClasses(status: GateStatus): string {
  return status === 'ready' ? 'text-site-700 bg-site-100' : 'text-hazard-700 bg-hazard-100';
}

export type FindingSeverity = 'low' | 'medium' | 'high';

export function severityBadgeClasses(severity: FindingSeverity): string {
  switch (severity) {
    case 'low': return 'text-concrete-600 bg-concrete-100';
    case 'medium': return 'text-amber-700 bg-amber-100';
    case 'high': return 'text-hazard-700 bg-hazard-100';
  }
}
