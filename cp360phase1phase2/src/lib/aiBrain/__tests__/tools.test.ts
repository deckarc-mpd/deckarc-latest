import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../audit.ts';
import { ToolRegistry, callTool, type ToolDefinition } from '../tools.ts';

function ctx() {
  return { companyId: 'company-1', projectId: 'project-1', correlationId: newCorrelationId() };
}

const echoTool: ToolDefinition<{ value: number }, { doubled: number }> = {
  name: 'echo_double',
  description: 'doubles a number (test tool)',
  supportsDryRun: true,
  async execute(args) {
    return { doubled: args.value * 2 };
  },
};

const noDryRunTool: ToolDefinition<{ n: number }, { n: number }> = {
  name: 'no_dry_run',
  description: 'a tool that cannot preview without side effects',
  supportsDryRun: false,
  async execute(args) {
    return args;
  },
};

const throwingTool: ToolDefinition<Record<string, never>, never> = {
  name: 'always_throws',
  description: 'test tool that always fails',
  supportsDryRun: false,
  async execute() {
    throw new Error('tool failure');
  },
};

test('callTool executes a registered tool and writes a success audit record', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  registry.register(echoTool);
  const c = ctx();

  const { result, toolCall } = await callTool<{ value: number }, { doubled: number }>(registry, audit, c, 'echo_double', { value: 21 }, {
    workflowRunId: null,
    agentRunId: null,
    authorizedActor: { type: 'system', id: 'system' },
    action: 'execute',
  });

  assert.equal(result.doubled, 42);
  assert.equal(toolCall.status, 'success');
  assert.equal(toolCall.toolName, 'echo_double');
  assert.equal(toolCall.dryRun, false);
  assert.equal(repo.toolCalls.length, 1);
});

test('an unregistered tool name throws before anything is executed or audited', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  const c = ctx();

  await assert.rejects(
    () =>
      callTool(registry, audit, c, 'nonexistent_tool', {}, {
        workflowRunId: null,
        agentRunId: null,
        authorizedActor: { type: 'system', id: 'system' },
        action: 'execute',
      }),
    /unknown tool/
  );
  assert.equal(repo.toolCalls.length, 0);
});

test('dryRun is rejected for a tool that does not support it, and audited attempt count stays zero', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  registry.register(noDryRunTool);
  const c = ctx();

  await assert.rejects(
    () =>
      callTool(registry, audit, c, 'no_dry_run', { n: 1 }, {
        workflowRunId: null,
        agentRunId: null,
        authorizedActor: { type: 'system', id: 'system' },
        action: 'execute',
        dryRun: true,
      }),
    /does not support dry-run/
  );
  assert.equal(repo.toolCalls.length, 0);
});

test('dryRun:true is passed through to a tool that supports it and recorded on the audit row', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  registry.register(echoTool);
  const c = ctx();

  const { toolCall } = await callTool(registry, audit, c, 'echo_double', { value: 5 }, {
    workflowRunId: null,
    agentRunId: null,
    authorizedActor: { type: 'system', id: 'system' },
    action: 'preview',
    dryRun: true,
  });

  assert.equal(toolCall.dryRun, true);
});

test('a tool that throws still leaves a failed audit record behind, and the error propagates', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  registry.register(throwingTool);
  const c = ctx();

  await assert.rejects(
    () =>
      callTool(registry, audit, c, 'always_throws', {}, {
        workflowRunId: null,
        agentRunId: null,
        authorizedActor: { type: 'system', id: 'system' },
        action: 'execute',
      }),
    /tool failure/
  );

  assert.equal(repo.toolCalls.length, 1);
  assert.equal(repo.toolCalls[0].status, 'failed');
});

test('registering the same tool name twice throws', () => {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  assert.throws(() => registry.register(echoTool), /already registered/);
});

test('identical args produce the same request hash; different args produce a different hash (determinism for replay)', async () => {
  const repo = new MemoryRepository();
  const audit = new AuditLog(repo);
  const registry = new ToolRegistry();
  registry.register(echoTool);
  const c = ctx();
  const callOpts = {
    workflowRunId: null,
    agentRunId: null,
    authorizedActor: { type: 'system' as const, id: 'system' },
    action: 'execute',
  };

  const first = await callTool(registry, audit, c, 'echo_double', { value: 7 }, callOpts);
  const second = await callTool(registry, audit, c, 'echo_double', { value: 7 }, callOpts);
  const different = await callTool(registry, audit, c, 'echo_double', { value: 8 }, callOpts);

  assert.equal(first.toolCall.requestHash, second.toolCall.requestHash);
  assert.notEqual(first.toolCall.requestHash, different.toolCall.requestHash);
});
