import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const good = () => ({ id: 'runtime.floor22', required: true, status: 'pass', environment: 'synthetic-test', evidence: ['run.log'], exitCode: 0, cleanup: true, details: {} });
test('rejectsMalformedOrMissingRequiredReports', async t => {
  const { writeQualificationReport, evaluateReleaseGate } = await import('../../scripts/release/report.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'tilde-report-')); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const change of [{ status: 'skip' }, { evidence: ['../escape'] }, { exitCode: '0' }, { cleanup: undefined }, { required: 'true' }]) {
    await assert.rejects(writeQualificationReport({ path: join(dir, 'bad.json'), runId: 'r1', environment: 'test', cases: [{ ...good(), ...change }] }));
  }
  await assert.rejects(writeQualificationReport({ path: join(dir, 'dupe.json'), runId: 'r1', environment: 'test', cases: [good(), good()] }));
  assert.equal(evaluateReleaseGate([], [], ['runtime.floor22']).ready, false);
  assert.equal(evaluateReleaseGate([{ ...good(), cleanup: false }]).ready, false);
  assert.equal(evaluateReleaseGate([{ ...good(), status: 'unavailable', exitCode: null, cleanup: null }]).ready, false);
  assert.equal(evaluateReleaseGate([good()]).ready, true);
  await writeQualificationReport({ path: join(dir, 'ok.json'), runId: 'r1', environment: 'test', cases: [good()] });
  assert.equal(JSON.parse(await readFile(join(dir, 'ok.json'), 'utf8')).cases[0].status, 'pass');
});
