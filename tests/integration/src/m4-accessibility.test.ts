import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeAccessibilityObservation } from './m4-accessibility.js';
test('treeInspectionCannotReplaceInstalledReaderAndOperatorEvidence', () => {
  for (const input of [null, {}, { tree: 'synthetic widget dump', cleanup: true }]) assert.equal(completeAccessibilityObservation(input), false);
  const shapeOnly = { screenReader: { name: 'synthetic format fixture', version: '1' }, session: 'synthetic-session', installedPackageSha256: 'a'.repeat(64), sourceSha256: 'b'.repeat(64), operatorStatement: 'Synthetic format validation only; no real reader result.', flows: { history: 'pass', send: 'pass', cancel: 'pass', settings: 'pass', auth: 'pass', completeApproval: 'pass', source: 'pass' }, secretValueSpoken: false, automaticWork: 0, cleanup: true };
  assert.equal(completeAccessibilityObservation(shapeOnly), true);
  for (const change of [{ operatorStatement: '' }, { installedPackageSha256: '' }, { secretValueSpoken: true }, { automaticWork: 1 }, { cleanup: false }, { flows: { ...shapeOnly.flows, auth: 'not_run' } }]) assert.equal(completeAccessibilityObservation({ ...shapeOnly, ...change }), false);
});
