// Deterministic intent classification (CODE tier, Frozen §19). This is
// intentionally thin: it ONLY decides which existing SOP a voice turn maps
// to and extracts the arguments that SOP already expects — it contains no
// business logic of its own (no delay math, no readiness rules, no
// approval semantics). All of that still lives exactly where Phases 1-5
// put it. Entity resolution matches spoken text against a directory loaded
// from canonical CP360 state — it never invents a project/task id.

import { resolveSpokenAgentName } from './agentNameResolver.ts';
import type { ClassifiedIntent, VoiceEntityDirectory } from './types.ts';

const APPROVE_KEYWORDS = ['approve', 'approved', 'confirm', 'yes, do it', 'go ahead'];
const REJECT_KEYWORDS = ['reject', 'cancel that', "don't do it", 'deny', 'no, cancel'];
const DELAY_KEYWORDS = ['delay', 'push back', 'behind schedule', 'running late', 'pushed'];
const READINESS_KEYWORDS = ['ready', 'readiness', 'tomorrow', "what's the plan", 'status'];

function findEntity(text: string, directory: VoiceEntityDirectory): { projectId: string | null; taskId: string | null } {
  const lower = text.toLowerCase();
  const task = directory.tasks.find((t) => lower.includes(t.name.toLowerCase()));
  if (task) return { projectId: task.projectId, taskId: task.id };
  const project = directory.projects.find((p) => lower.includes(p.name.toLowerCase()));
  return { projectId: project?.id ?? null, taskId: null };
}

function extractDelayDays(text: string): number | null {
  const match = text.match(/(\d+)\s*day/i);
  return match ? parseInt(match[1], 10) : null;
}

export function classifyVoiceIntent(text: string, directory: VoiceEntityDirectory): ClassifiedIntent {
  const lower = text.toLowerCase();
  const agentId = resolveSpokenAgentName(text);
  const { projectId, taskId } = findEntity(text, directory);

  // Approval decisions checked first — most specific, and always consequential.
  if (APPROVE_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      kind: 'decide_pending_approval', agentId, isConsequential: true,
      resolvedProjectId: projectId, resolvedTaskId: taskId, delayDays: null,
      decision: 'approved', reasonText: text,
    };
  }
  if (REJECT_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      kind: 'decide_pending_approval', agentId, isConsequential: true,
      resolvedProjectId: projectId, resolvedTaskId: taskId, delayDays: null,
      decision: 'rejected', reasonText: text,
    };
  }

  if (DELAY_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      kind: 'report_task_delay', agentId, isConsequential: true,
      resolvedProjectId: projectId, resolvedTaskId: taskId,
      delayDays: extractDelayDays(text), decision: null, reasonText: text,
    };
  }

  if (READINESS_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      kind: 'query_tomorrow_readiness', agentId, isConsequential: false,
      resolvedProjectId: projectId, resolvedTaskId: taskId,
      delayDays: null, decision: null, reasonText: text,
    };
  }

  return {
    kind: 'unrecognized', agentId, isConsequential: false,
    resolvedProjectId: projectId, resolvedTaskId: taskId,
    delayDays: null, decision: null, reasonText: text,
  };
}
