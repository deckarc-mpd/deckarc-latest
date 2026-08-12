// The first real Controlled Tool: wraps the existing, working
// scheduleEngine.cascadeDelayFromTask domain function (Phase 0 Discovery
// explicitly names this function as "exactly the kind of thing the Frozen
// Architecture wants wrapped as a controlled tool, not reimplemented").
//
// This file has NOT been exercised against a live Supabase project from
// this sandbox (see supabaseRepository.ts's header note — no network path
// to the real database here). Its wiring is correct and type-checked;
// verifying it end-to-end against real project/task data is a prerequisite
// before this tool is used for anything beyond Phase 1 review.

import { cascadeDelayFromTask } from '../../scheduleEngine.ts';
import type { ToolDefinition } from '../tools.ts';

export interface CascadeDelayArgs {
  projectId: string;
  rootTaskId: string;
  delayDays: number;
  changeType: string;
  reason: string;
  responsibleParty: string;
  actorName?: string;
  actorRole?: string;
}

export interface CascadeDelayResult {
  updatedCount: number;
  newProjectFinish: string | null;
}

export const cascadeDelayTool: ToolDefinition<CascadeDelayArgs, CascadeDelayResult> = {
  name: 'cascade_delay',
  description:
    "Cascades a reported task delay to dependent tasks and, if needed, the project's projected finish date. Supports dry-run preview so the Policy Engine can decide authority requirements before any row is written.",
  supportsDryRun: true,
  async execute(args, options) {
    return cascadeDelayFromTask(
      args.projectId,
      args.rootTaskId,
      args.delayDays,
      args.changeType,
      args.reason,
      args.responsibleParty,
      args.actorName ?? 'System',
      args.actorRole ?? 'System',
      { dryRun: options.dryRun }
    );
  },
};
