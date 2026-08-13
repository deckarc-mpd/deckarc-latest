// Confidence thresholds (Frozen §19 hard constraint): "Amounts, dates,
// project names, approvals, and commitments require stricter confidence
// thresholds and read-back confirmation." Consequential intents (delay
// reports, approval decisions) require a materially higher transcription
// confidence than a simple read-only query before the adapter will even
// attempt to act — below threshold, the turn stops for a read-back instead
// of guessing.

import type { ClassifiedIntent, TranscribedUtterance } from './types.ts';

export const STANDARD_CONFIDENCE_THRESHOLD = 0.6;
export const CONSEQUENTIAL_CONFIDENCE_THRESHOLD = 0.85;

export function requiresReadBackConfirmation(utterance: TranscribedUtterance, intent: ClassifiedIntent): boolean {
  const threshold = intent.isConsequential ? CONSEQUENTIAL_CONFIDENCE_THRESHOLD : STANDARD_CONFIDENCE_THRESHOLD;
  return utterance.confidence < threshold;
}
