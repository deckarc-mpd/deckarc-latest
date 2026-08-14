// Voice adapter types (Frozen §19) — Phase 6.
//
// This module is deliberately an ADAPTER, not a second business-logic
// engine: every type here exists to get from "spoken words" to "the exact
// same SOP/tool/policy call a UI action would make," never to decide
// business outcomes itself. See voiceAdapter.ts's header for the full flow.

import type { AgentId } from '../types.ts';

/**
 * "Hear -> transcribe" already happened client-side before this module is
 * ever called — the existing VoiceAssistant.tsx uses the browser's Web
 * Speech API, whose SpeechRecognitionResult carries a real per-utterance
 * `confidence` (0-1). This module starts from that already-transcribed
 * result; it does not talk to a speech provider itself.
 */
export interface TranscribedUtterance {
  text: string;
  confidence: number;
}

/**
 * "Resolve authenticated user + project/entity context." A voice turn is
 * REJECTED outright if this is missing a real userId — per the hard
 * constraint, speaker recognition (voice sounding like someone) is never
 * treated as authorization; only an existing authenticated CP360 session is.
 */
export interface VoiceSession {
  userId: string;
  companyId: string;
  activeProjectId: string | null;
}

export type VoiceIntentKind =
  | 'query_tomorrow_readiness'
  | 'report_task_delay'
  | 'decide_pending_approval'
  | 'unrecognized';

/** Known project/task names, loaded from canonical CP360 state — entity resolution matches against THIS, never invents an id from raw speech. */
export interface VoiceEntityDirectory {
  projects: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; name: string; projectId: string }>;
}

export interface ClassifiedIntent {
  kind: VoiceIntentKind;
  /** A spoken agent name ("Marcus", "Natalie") resolved to its stable id, if one was mentioned. Never used for authorization — only for routing to that agent's own SOPs. */
  agentId: AgentId | null;
  /** Amounts, dates, project names, approvals, and commitments -> stricter confidence threshold (hard constraint). */
  isConsequential: boolean;
  resolvedProjectId: string | null;
  resolvedTaskId: string | null;
  delayDays: number | null;
  decision: 'approved' | 'rejected' | null;
  reasonText: string;
}

export type VoiceTurnStatus = 'completed' | 'waiting_confirmation' | 'failed' | 'unrecognized' | 'needs_readback';

export interface VoiceTurnResult {
  status: VoiceTurnStatus;
  /** The exact text to hand to TTS ("speak result") — always deterministic, never free-form model text, so it can never claim something that didn't happen. */
  spokenResponse: string;
  workflowRunId: string | null;
  /** Set only when status is 'waiting_confirmation' — the next turn (or a barge-in) must reference this to approve/reject. */
  pendingApprovalId: string | null;
}
