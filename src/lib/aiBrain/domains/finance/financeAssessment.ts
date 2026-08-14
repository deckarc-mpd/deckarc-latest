// Combines the six Frozen §5 deterministic services into one assessment,
// mirroring tomorrow_readiness_v1's "one SOP, several gates" structure.
// Every gate here is pure arithmetic/date comparison — no LLM.

import { identifyMilestonesDueForBilling, identifyCollectionsNeeded } from './billingCollections.ts';
import { assessApStatus } from './apWorkflow.ts';
import { computeProjectMargin, MARGIN_WARNING_PERCENT } from './marginCostEngine.ts';
import { computeCashForecast } from './cashForecastEngine.ts';
import type {
  ReadinessPaymentMilestone,
  ReadinessVendorBill,
  ReadinessCostEntry,
  ReadinessChangeOrder,
  FinanceGateResult,
  DeterministicFinanceResult,
  FinanceOverallStatus,
} from './types.ts';

export const CASH_FORECAST_HORIZON_DAYS = 30;

export function assessFinanceReadiness(
  projectId: string,
  asOfDate: string,
  contractAmount: number | null,
  milestones: ReadinessPaymentMilestone[],
  vendorBills: ReadinessVendorBill[],
  costEntries: ReadinessCostEntry[],
  changeOrders: ReadinessChangeOrder[]
): DeterministicFinanceResult {
  const projectMilestones = milestones.filter((m) => m.project_id === projectId);
  const projectBills = vendorBills.filter((b) => b.project_id === projectId);

  const billingFindings = identifyMilestonesDueForBilling(projectMilestones);
  const collectionsFindings = identifyCollectionsNeeded(asOfDate, projectMilestones);
  const apFindings = assessApStatus(asOfDate, projectBills);
  const margin = computeProjectMargin(projectId, contractAmount, changeOrders, costEntries);
  const cashForecast = computeCashForecast(asOfDate, CASH_FORECAST_HORIZON_DAYS, projectMilestones, projectBills);

  const billingGate: FinanceGateResult = {
    gate: 'billing', status: billingFindings.length > 0 ? 'not_ready' : 'ready',
    findings: billingFindings.map((f) => `${f.milestoneName} ($${f.amount.toLocaleString()}) is ready to invoice`),
  };
  const collectionsGate: FinanceGateResult = {
    gate: 'collections', status: collectionsFindings.length > 0 ? 'not_ready' : 'ready',
    findings: collectionsFindings.map((f) => `${f.milestoneName} is ${f.daysOverdue} days overdue ($${f.amount.toLocaleString()}, ${f.bucket.replace(/_/g, ' ')})`),
  };
  const apGate: FinanceGateResult = {
    gate: 'ap', status: apFindings.length > 0 ? 'not_ready' : 'ready',
    findings: apFindings.map((f) => `${f.vendorName}'s bill ($${f.amount.toLocaleString()}) is ${f.reason}`),
  };
  const marginNotReady = margin.marginPercent !== null && margin.marginPercent < MARGIN_WARNING_PERCENT;
  const marginGate: FinanceGateResult = {
    gate: 'margin', status: marginNotReady ? 'not_ready' : 'ready',
    findings: marginNotReady ? [`Margin is ${margin.marginPercent!.toFixed(1)}%, below the ${MARGIN_WARNING_PERCENT}% warning threshold`] : [],
  };
  const cashNotReady = cashForecast.netProjectedCash < 0;
  const cashForecastGate: FinanceGateResult = {
    gate: 'cash_forecast', status: cashNotReady ? 'not_ready' : 'ready',
    findings: cashNotReady ? [`Projected cash over the next ${CASH_FORECAST_HORIZON_DAYS} days is negative ($${cashForecast.netProjectedCash.toLocaleString()})`] : [],
  };

  const gates = [billingGate, collectionsGate, apGate, marginGate, cashForecastGate];

  // Margin and cash risk are existential ('blocked'); billing/collections/AP
  // are operational follow-up ('at_risk') — mirrors the blocked-vs-at_risk
  // severity split Compliance already established.
  let overallStatus: FinanceOverallStatus = 'ready';
  if (marginGate.status === 'not_ready' || cashForecastGate.status === 'not_ready') {
    overallStatus = 'blocked';
  } else if (billingGate.status === 'not_ready' || collectionsGate.status === 'not_ready' || apGate.status === 'not_ready') {
    overallStatus = 'at_risk';
  }

  return { projectId, asOfDate, gates, overallStatus, margin, cashForecast };
}
