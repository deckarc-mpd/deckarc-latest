import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicRiskInterpreter, shouldInvokeInterpretation } from '../aiInterpreter.ts';
import type { DeterministicReadinessResult } from '../types.ts';

function readiness(overrides: Partial<DeterministicReadinessResult> = {}): DeterministicReadinessResult {
  return {
    projectId: 'p1',
    asOfDate: '2026-08-13',
    gates: [
      { gate: 'field_progress', status: 'ready', findings: [] },
      { gate: 'dependency', status: 'ready', findings: [] },
      { gate: 'subcontractor', status: 'ready', findings: [] },
      { gate: 'materials', status: 'ready', findings: [] },
    ],
    overallStatus: 'ready',
    ...overrides,
  };
}

test('shouldInvokeInterpretation: no free text and at most one failed gate -> false', () => {
  assert.equal(shouldInvokeInterpretation(readiness(), []), false);
  const oneFailed = readiness({
    gates: [
      { gate: 'field_progress', status: 'ready', findings: [] },
      { gate: 'dependency', status: 'ready', findings: [] },
      { gate: 'subcontractor', status: 'not_ready', findings: ['pending'] },
      { gate: 'materials', status: 'ready', findings: [] },
    ],
    overallStatus: 'at_risk',
  });
  assert.equal(shouldInvokeInterpretation(oneFailed, []), false);
});

test('shouldInvokeInterpretation: any non-empty free text -> true, even with all gates ready', () => {
  assert.equal(shouldInvokeInterpretation(readiness(), ['crew called out sick']), true);
});

test('shouldInvokeInterpretation: two or more failed gates -> true, even with no free text', () => {
  const twoFailed = readiness({
    gates: [
      { gate: 'field_progress', status: 'ready', findings: [] },
      { gate: 'dependency', status: 'not_ready', findings: ['waiting'] },
      { gate: 'subcontractor', status: 'not_ready', findings: ['pending'] },
      { gate: 'materials', status: 'ready', findings: [] },
    ],
    overallStatus: 'blocked',
  });
  assert.equal(shouldInvokeInterpretation(twoFailed, []), true);
});

test('DeterministicRiskInterpreter: does not invoke (or call anything) when nothing is ambiguous', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const result = await interpreter.interpret({ deterministic: readiness(), freeText: [] });
  assert.equal(result.invoked, false);
  assert.equal(result.category, 'none');
  assert.equal(result.explanation, '');
});

test('DeterministicRiskInterpreter: classifies weather-related free text correctly', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const result = await interpreter.interpret({
    deterministic: readiness(),
    freeText: ['Heavy rain expected, site will be too wet to pour concrete'],
  });
  assert.equal(result.invoked, true);
  assert.equal(result.category, 'weather');
  assert.match(result.explanation, /weather/);
});

test('DeterministicRiskInterpreter: classifies material-delay free text correctly', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const result = await interpreter.interpret({
    deterministic: readiness(),
    freeText: ['Supplier says lumber shipment is backordered two weeks'],
  });
  assert.equal(result.category, 'material_delay');
});

test('DeterministicRiskInterpreter: classifies access-issue free text correctly', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const result = await interpreter.interpret({
    deterministic: readiness(),
    freeText: ['HOA gate access code was not provided, crew could not enter'],
  });
  assert.equal(result.category, 'access_issue');
});

test('DeterministicRiskInterpreter: classifies labor-issue free text correctly', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const result = await interpreter.interpret({
    deterministic: readiness(),
    freeText: ['Subcontractor crew called out sick, no-show today'],
  });
  assert.equal(result.category, 'labor_issue');
});

test('DeterministicRiskInterpreter: severity escalates with more simultaneous gate failures', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const oneFailed = readiness({
    gates: [
      { gate: 'field_progress', status: 'ready', findings: [] },
      { gate: 'dependency', status: 'ready', findings: [] },
      { gate: 'subcontractor', status: 'not_ready', findings: ['pending'] },
      { gate: 'materials', status: 'ready', findings: [] },
    ],
    overallStatus: 'at_risk',
  });
  const twoFailed = readiness({
    gates: [
      { gate: 'field_progress', status: 'not_ready', findings: ['blocker'] },
      { gate: 'dependency', status: 'ready', findings: [] },
      { gate: 'subcontractor', status: 'not_ready', findings: ['pending'] },
      { gate: 'materials', status: 'ready', findings: [] },
    ],
    overallStatus: 'blocked',
  });

  const low = await interpreter.interpret({ deterministic: oneFailed, freeText: ['minor note'] });
  const high = await interpreter.interpret({ deterministic: twoFailed, freeText: ['minor note'] });
  assert.equal(low.severity, 'medium');
  assert.equal(high.severity, 'high');
});

test('RiskInterpretation never contains a status/verdict field the SOP could mistake for a readiness decision', async () => {
  const interpreter = new DeterministicRiskInterpreter();
  const result = await interpreter.interpret({ deterministic: readiness(), freeText: ['rain expected'] });
  assert.equal('status' in result, false);
  assert.equal('overallStatus' in result, false);
});
