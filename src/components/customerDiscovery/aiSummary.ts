import type { DiscoverySession, ObservationTask, FeatureRequest } from './types';
import { CONFUSION_RANK } from './types';

// Deterministic mock AI summary generator.
// Does NOT call any external AI API — assembles a readable narrative
// from the stored session fields.

export interface AiSummarySections {
  customerNeed: string;
  strongestValueSignal: string;
  mainFriction: string;
  commercialSignal: string;
  recommendedNextStep: string;
  narrative: string;
}

export function generateAiSummary(
  session: DiscoverySession,
  observations: ObservationTask[],
  featureRequests: FeatureRequest[],
): AiSummarySections {
  const company = session.company_name || 'This contractor';
  const tasks = observations.length;
  const completed = observations.filter(o => o.completed === 'Yes').length;
  const partial = observations.filter(o => o.completed === 'Partially').length;
  const neededHelp = observations.filter(o => o.needed_help === 'Yes').length;
  const confusionVals = observations
    .map(o => CONFUSION_RANK[o.confusion_level] ?? 0)
    .filter(v => v > 0);
  const avgConfusion =
    confusionVals.length > 0
      ? (confusionVals.reduce((a, b) => a + b, 0) / confusionVals.length).toFixed(1)
      : '0';

  const confusionLabel =
    Number(avgConfusion) >= 2.5 ? 'High' :
    Number(avgConfusion) >= 1.5 ? 'Medium' :
    Number(avgConfusion) > 0 ? 'Low' : 'None';

  // Customer Need
  const customerNeedParts: string[] = [];
  if (session.primary_service_type) customerNeedParts.push(`a ${session.primary_service_type.toLowerCase()}`);
  if (session.active_projects) customerNeedParts.push(`managing ${session.active_projects} active project${session.active_projects !== 1 ? 's' : ''}`);
  if (session.current_software.length > 0 && !session.current_software.includes('None')) {
    customerNeedParts.push(`currently using ${session.current_software.join(', ')}`);
  }
  const customerNeed =
    customerNeedParts.length > 0
      ? `${company} is ${customerNeedParts.join(', ')}.`
      : `${company} is looking for a better way to run daily operations.`;

  // Strongest Value Signal
  const strongestValueSignal =
    session.top_positive_signal ||
    session.valuable_feature ||
    'No clear value signal was captured during this demo.';

  // Main Friction
  const frictionParts: string[] = [];
  if (session.main_frustration) frictionParts.push(session.main_frustration);
  if (neededHelp > 0) frictionParts.push(`needed help on ${neededHelp} of ${tasks} task${tasks !== 1 ? 's' : ''}`);
  if (confusionLabel !== 'None') frictionParts.push(`average confusion was ${confusionLabel.toLowerCase()}`);
  const mainFriction =
    frictionParts.length > 0
      ? frictionParts.join('; ') + '.'
      : 'No significant friction was observed.';

  // Commercial Signal
  const commercialParts: string[] = [];
  if (session.estimated_time_saved) commercialParts.push(`estimated CP360 could save ${session.estimated_time_saved.toLowerCase()} per week`);
  if (session.expected_monthly_price) commercialParts.push(`expected monthly price was ${session.expected_monthly_price}`);
  if (session.main_buying_concern) commercialParts.push(`main concern was ${session.main_buying_concern.toLowerCase()}`);
  const commercialSignal =
    commercialParts.length > 0
      ? commercialParts.join('. ') + '.'
      : 'No commercial signal was captured.';

  // Recommended Next Step
  const recommendedNextStep = session.recommended_next_step || 'No next step was recommended.';

  // Narrative
  const narrativeParts: string[] = [];
  narrativeParts.push(
    `${company} ${completed === tasks ? 'completed all' : `completed ${completed} of ${tasks}`} observation tasks${partial > 0 ? ` (${partial} partial)` : ''}.`,
  );
  if (neededHelp > 0) {
    narrativeParts.push(`They needed help on ${neededHelp} task${neededHelp !== 1 ? 's' : ''}.`);
  }
  if (session.overall_rating > 0) {
    narrativeParts.push(`Usability rating: ${session.overall_rating}/5.`);
  }
  if (session.recommendation_score > 0) {
    narrativeParts.push(`Recommendation score: ${session.recommendation_score}/10.`);
  }
  if (session.outcome) {
    narrativeParts.push(`Outcome: ${session.outcome}.`);
  }
  if (featureRequests.length > 0) {
    narrativeParts.push(`${featureRequests.length} feature request${featureRequests.length !== 1 ? 's were' : ' was'} captured.`);
  }
  const narrative = narrativeParts.join(' ');

  return {
    customerNeed,
    strongestValueSignal,
    mainFriction,
    commercialSignal,
    recommendedNextStep,
    narrative,
  };
}

export function aiSummaryToText(s: AiSummarySections): string {
  return [
    s.narrative,
    '',
    `Customer Need: ${s.customerNeed}`,
    `Strongest Value Signal: ${s.strongestValueSignal}`,
    `Main Friction: ${s.mainFriction}`,
    `Commercial Signal: ${s.commercialSignal}`,
    `Recommended Next Step: ${s.recommendedNextStep}`,
  ].join('\n');
}
