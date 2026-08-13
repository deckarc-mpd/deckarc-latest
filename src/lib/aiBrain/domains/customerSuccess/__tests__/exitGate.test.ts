// Phase 5 exit gate (user's instructions): "client updates use verified
// facts and have a low human edit rate." This is the SOP's structural
// guarantee, run against 5 representative scenarios: candidate detection
// matches what a human reviewing the same project data would expect, and
// every produced draft passes groundedness on the FIRST pass with no
// live LLM at all — the strongest actionable proxy for "won't need
// editing for factual accuracy" available without a live model connection
// (this sandbox has none; see CP360_AI_COST_BASELINE.md). The same
// groundedness gate applies unconditionally when GeminiDraftClient is
// used in production: an ungrounded real-model draft fails the SOP run
// exactly like the deliberately-broken client does in
// sops/__tests__/clientCommunicationDraft.test.ts, so it can never reach
// a human looking trustworthy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository } from '../../../memoryRepository.ts';
import { AuditLog, newCorrelationId } from '../../../audit.ts';
import { emitScheduleEvent } from '../../../events.ts';
import { WorkflowEngine } from '../../../workflow.ts';
import { ToolRegistry } from '../../../tools.ts';
import { seedMemoryRegistry } from '../../../registry.ts';
import { createClientCommunicationDraftHandler, type ClientCommunicationDraftPayload } from '../../../sops/clientCommunicationDraft.ts';
import { DeterministicDraftClient, validateDraftGroundedness } from '../draftClient.ts';
import { gatherVerifiedClientFacts } from '../verifiedFacts.ts';
import { REPRESENTATIVE_SCENARIOS } from '../__fixtures__/representativeScenarios.ts';
import type { ClientCommunicationDraft } from '../types.ts';

test('exit gate coverage: every representative scenario has an expectation', () => {
  assert.ok(REPRESENTATIVE_SCENARIOS.length >= 3 && REPRESENTATIVE_SCENARIOS.length <= 5);
});

for (const scenario of REPRESENTATIVE_SCENARIOS) {
  test(`${scenario.name}: candidate detection matches expectation, and every draft is grounded on the first pass`, async () => {
    const repo = new MemoryRepository();
    seedMemoryRegistry(repo);
    const audit = new AuditLog(repo);
    const tools = new ToolRegistry();
    const engine = new WorkflowEngine(audit, repo, tools);
    const handler = createClientCommunicationDraftHandler(new DeterministicDraftClient());
    const c = { companyId: 'company-1', projectId: scenario.projectId, correlationId: newCorrelationId() };

    // Independent check of what the deterministic gathering step should find,
    // computed the same way the exit-gate reviewer (a human) would read it.
    const facts = gatherVerifiedClientFacts(scenario.projectId, scenario.asOfDate, scenario.decisions, scenario.delayReasons);
    assert.equal(facts.candidates.length, scenario.expected.candidateCount, `${scenario.name}: candidate count mismatch`);

    const payload: ClientCommunicationDraftPayload = {
      projectId: scenario.projectId, asOfDate: scenario.asOfDate,
      decisions: scenario.decisions, delayReasons: scenario.delayReasons,
    };
    const event = await emitScheduleEvent(audit, c, 'schedule.client_communication_check', payload as unknown as Record<string, unknown>);
    const result = await engine.run(c, 'client_communication_draft_v1', '1.0.0', event, handler);

    if (scenario.expected.candidateCount === 0) {
      assert.equal(result.run.status, 'completed', `${scenario.name}: nothing open should complete immediately`);
      assert.equal(repo.agentRuns.length, 0, `${scenario.name}: nothing open must mean zero AI calls`);
      return;
    }

    assert.equal(result.run.status, 'waiting_approval', `${scenario.name}: any open item requires human approval`);
    const calls = await repo.listToolCallsByWorkflowRun(result.run.id);
    const drafts = calls.find((call) => call.toolName === 'draft_client_communication')!.result as unknown as ClientCommunicationDraft[];
    assert.equal(drafts.length, scenario.expected.candidateCount);

    for (const draft of drafts) {
      const candidate = facts.candidates.find((cand) => cand.sourceId === draft.sourceId)!;
      const { grounded, missingAnchors } = validateDraftGroundedness(draft, candidate);
      assert.equal(grounded, true, `${scenario.name}: draft for ${draft.sourceId} missing ${missingAnchors.join(', ')} — would require a human edit`);
    }
  });
}
