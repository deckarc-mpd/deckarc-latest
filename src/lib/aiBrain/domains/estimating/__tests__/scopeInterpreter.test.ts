import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicScopeInterpreter, shouldInvokeScopeNormalization, KNOWN_PROJECT_TYPES } from '../scopeInterpreter.ts';

test('an exact known category is never sent to AI', async () => {
  assert.equal(shouldInvokeScopeNormalization('Kitchen remodel'), false);
  const result = await new DeterministicScopeInterpreter().normalize('Kitchen remodel');
  assert.equal(result.invoked, false);
  assert.equal(result.normalizedCategory, 'Kitchen remodel');
});

test('free text is classified into a known category', async () => {
  const result = await new DeterministicScopeInterpreter().normalize('Homeowner wants to gut and redo their kitchen with new cabinets');
  assert.equal(result.invoked, true);
  assert.equal(result.normalizedCategory, 'Kitchen remodel');
  assert.ok((KNOWN_PROJECT_TYPES as readonly string[]).includes(result.normalizedCategory));
});

test('ambiguous text still classifies into SOME known category, never an invented one', async () => {
  const result = await new DeterministicScopeInterpreter().normalize('General fix-up of the whole house, lots of little things');
  assert.ok((KNOWN_PROJECT_TYPES as readonly string[]).includes(result.normalizedCategory));
});

test('never returns anything about price', async () => {
  const result = await new DeterministicScopeInterpreter().normalize('A big kitchen remodel with an island');
  assert.equal('price' in result, false);
  assert.equal('amount' in result, false);
});
