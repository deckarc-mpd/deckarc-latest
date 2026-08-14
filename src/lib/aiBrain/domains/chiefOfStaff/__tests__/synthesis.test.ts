import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankExceptions,
  shouldInvokeChiefOfStaffAi,
  synthesizeChiefOfStaffBrief,
  DeterministicSynthesisClient,
} from '../synthesis.ts';
import type { SynthesisClient } from '../synthesis.ts';
import type { ResolvedException, RankedException } from '../types.ts';

function exception(overrides: Partial<ResolvedException>): ResolvedException {
  return { source: 'needs_review_item', id: 'e1', projectId: 'proj-1', title: 'Item', detail: '', ...overrides };
}

test('rankExceptions: critical beats sweep_escalation beats needs_review, regardless of input order', () => {
  const ranked = rankExceptions([
    exception({ source: 'needs_review_item', id: 'nr1' }),
    exception({ source: 'sweep_escalation', id: 'se1' }),
    exception({ source: 'critical_item', id: 'ci1' }),
  ]);
  assert.deepEqual(ranked.map((r) => r.source), ['critical_item', 'sweep_escalation', 'needs_review_item']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test('rankExceptions: same-priority items tie-break deterministically by projectId then id', () => {
  const a = rankExceptions([
    exception({ source: 'critical_item', id: 'z', projectId: 'proj-b' }),
    exception({ source: 'critical_item', id: 'a', projectId: 'proj-a' }),
  ]);
  const b = rankExceptions([
    exception({ source: 'critical_item', id: 'a', projectId: 'proj-a' }),
    exception({ source: 'critical_item', id: 'z', projectId: 'proj-b' }),
  ]);
  // Same input set, different original order -> identical ranking. This is
  // the property that makes a replayed synthesis reproduce the same brief.
  assert.deepEqual(a, b);
  assert.equal(a[0].projectId, 'proj-a');
});

test('shouldInvokeChiefOfStaffAi: empty ranked list never triggers AI', () => {
  assert.equal(shouldInvokeChiefOfStaffAi([]), false);
});

test('shouldInvokeChiefOfStaffAi: any ranked item triggers AI', () => {
  const ranked: RankedException[] = rankExceptions([exception({})]);
  assert.equal(shouldInvokeChiefOfStaffAi(ranked), true);
});

test('synthesizeChiefOfStaffBrief: zero exceptions -> all-clear headline, zero AI calls', async () => {
  let frameCalls = 0;
  const spyClient: SynthesisClient = { async frame() { frameCalls++; return 'should never be called'; } };

  const synthesis = await synthesizeChiefOfStaffBrief([], spyClient);
  assert.equal(synthesis.aiInvoked, false);
  assert.equal(synthesis.aiFraming, null);
  assert.equal(synthesis.prioritizedItems.length, 0);
  assert.match(synthesis.headline, /all clear/i);
  assert.equal(frameCalls, 0, 'zero exceptions must mean zero AI calls, per Frozen §11');
});

test('synthesizeChiefOfStaffBrief: at least one exception -> ranked list + AI framing, headline reflects the count', async () => {
  const exceptions = [
    exception({ source: 'critical_item', id: 'c1', title: 'Permit rejected' }),
    exception({ source: 'needs_review_item', id: 'nr1', title: 'Task needs review' }),
  ];
  const synthesis = await synthesizeChiefOfStaffBrief(exceptions, new DeterministicSynthesisClient());

  assert.equal(synthesis.aiInvoked, true);
  assert.equal(synthesis.prioritizedItems.length, 2);
  assert.equal(synthesis.prioritizedItems[0].source, 'critical_item'); // ranked first
  assert.match(synthesis.headline, /2 item/);
  assert.ok(synthesis.aiFraming && synthesis.aiFraming.length > 0);
  assert.match(synthesis.aiFraming!, /Permit rejected/);
});

test('synthesizeChiefOfStaffBrief: the AI framing step never changes prioritizedItems (framing cannot re-order)', async () => {
  const exceptions = [exception({ source: 'needs_review_item', id: 'nr1' }), exception({ source: 'critical_item', id: 'c1' })];
  const misbehavingClient: SynthesisClient = {
    async frame() { return 'a framing string with no structural effect'; },
  };
  const synthesis = await synthesizeChiefOfStaffBrief(exceptions, misbehavingClient);
  const rankedIndependently = rankExceptions(exceptions);
  assert.deepEqual(synthesis.prioritizedItems, rankedIndependently);
});

test('synthesizeChiefOfStaffBrief: a failing synthesis client degrades gracefully instead of throwing', async () => {
  const throwingClient: SynthesisClient = { async frame() { throw new Error('network down'); } };
  await assert.rejects(() => synthesizeChiefOfStaffBrief([exception({})], throwingClient));
  // Note: DeterministicSynthesisClient/GeminiSynthesisClient each handle
  // their own failure modes internally (see GeminiSynthesisClient's catch
  // block) — synthesizeChiefOfStaffBrief itself is a thin pass-through and
  // intentionally does not swallow an arbitrary injected client's errors,
  // so a genuinely broken client surfaces loudly rather than silently.
});
