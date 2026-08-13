// CP360 AI Operations Brain — Controlled Tool layer (Slice 5).
//
// Frozen Architecture v4 §6/§23.1: agents never touch CP360, integrations,
// or external systems directly — every action goes through a Controlled
// Tool. This module is the enforcement point: `callTool()` is the ONLY
// function in this package that invokes a tool's `execute()`, and it always
// writes a `ai_tool_calls` audit record — before attempting execution (as
// `pending`) and after (as `success`/`failed`) — so a tool call can never
// happen without a corresponding audit trail, even if the tool throws.
//
// A tool definition is intentionally minimal: a name, and an `execute`
// function. Anything wrapped here (starting with the real
// `scheduleEngine.cascadeDelayFromTask`, per Phase 0 Discovery's explicit
// recommendation to reuse it rather than write new domain logic) becomes
// callable by SOP handlers ONLY through this registry — a SOP handler must
// never import and call a domain function directly once it has a
// Controlled Tool wrapper, or it bypasses the audit trail this layer exists
// to guarantee.

import { createHash } from 'node:crypto';
import type { AuditLog, AuditContext } from './audit.ts';
import type { ActorRef, ToolCallRecord } from './types.ts';

export interface ToolDefinition<TArgs, TResult> {
  name: string;
  description: string;
  /** True if `execute` honors an `options.dryRun` flag with zero side effects. */
  supportsDryRun: boolean;
  execute(args: TArgs, options: { dryRun: boolean }): Promise<TResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<TArgs, TResult>(tool: ToolDefinition<TArgs, TResult>): void {
    if (this.tools.has(tool.name)) throw new Error(`tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  get<TArgs, TResult>(name: string): ToolDefinition<TArgs, TResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    return tool as ToolDefinition<TArgs, TResult>;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

export interface CallToolOptions {
  workflowRunId: string | null;
  agentRunId: string | null;
  authorizedActor: ActorRef;
  action: string;
  dryRun?: boolean;
}

export interface CallToolResult<TResult> {
  result: TResult;
  toolCall: ToolCallRecord;
}

/**
 * The sole entrypoint for executing a Controlled Tool. Every call is
 * audited regardless of outcome — a thrown error still leaves a `failed`
 * ai_tool_calls row behind, never a silent gap in the trail.
 */
export async function callTool<TArgs, TResult>(
  registry: ToolRegistry,
  audit: AuditLog,
  ctx: AuditContext,
  toolName: string,
  args: TArgs,
  options: CallToolOptions
): Promise<CallToolResult<TResult>> {
  const tool = registry.get<TArgs, TResult>(toolName);
  const dryRun = options.dryRun ?? false;
  if (dryRun && !tool.supportsDryRun) {
    throw new Error(`tool ${toolName} does not support dry-run execution`);
  }

  const requestHash = stableHash({ toolName, args, dryRun });

  try {
    const result = await tool.execute(args, { dryRun });
    const toolCall = await audit.toolCall(ctx, {
      workflowRunId: options.workflowRunId,
      agentRunId: options.agentRunId,
      toolName,
      action: options.action,
      authorizedActor: options.authorizedActor,
      requestHash,
      requestPayload: args as Record<string, unknown>,
      provider: null,
      externalId: null,
      result: result as Record<string, unknown>,
      status: 'success',
      dryRun,
    });
    return { result, toolCall };
  } catch (err) {
    await audit.toolCall(ctx, {
      workflowRunId: options.workflowRunId,
      agentRunId: options.agentRunId,
      toolName,
      action: options.action,
      authorizedActor: options.authorizedActor,
      requestHash,
      requestPayload: args as Record<string, unknown>,
      provider: null,
      externalId: null,
      result: { error: err instanceof Error ? err.message : String(err) },
      status: 'failed',
      dryRun,
    });
    throw err;
  }
}
