import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { childEnvironment } from '../../scripts/release/runtime.mjs';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
import { startOpenAiFixture } from '../integration/dist/fixtures/m4-openai-server.js';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tilde-local-grant-')), ledgerDir = join(root, 'ledger'), stateDir = join(root, 'private-state');
  await mkdir(ledgerDir, { mode: 0o700 });
  const grant = { version: 1, ownerApproved: true, runId: randomUUID(), endpoint: 'http://127.0.0.1:19999/v1', model: 'm4-fixture', api: 'openai-completions', stateDir, ledgerDir, expiresAt: new Date(Date.now() + 60000).toISOString(), maxCalls: 1, maxOutputTokens: 2048, timeoutMs: 60000, maxTools: 0, toolRoot: null, ...overrides };
  const approvalFile = join(root, 'approval.json'); await writeFile(approvalFile, JSON.stringify(grant), { mode: 0o600 });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, grant, approvalFile, options: { optIn: true, approvalFile, endpoint: grant.endpoint, model: grant.model, api: grant.api, stateDir, runId: grant.runId } };
}
test('localHelperWithoutGrantTouchesNoNetworkOrStore', async t => {
  const f = await fixture(t), env = childEnvironment(process.execPath, { HOME: f.root });
  const result = spawnSync(process.execPath, ['scripts/m4-local-qualification.mjs', '--state-dir', f.grant.stateDir], { encoding: 'utf8', timeout: 5000, env });
  assert.equal(result.status, 2, result.stderr); assert.match(result.stderr, /LOCAL_OPT_IN_REQUIRED/);
  assert.deepEqual((await readdir(f.root)).sort(), ['approval.json', 'ledger']);
});
test('invalidExpiredAndWrongTargetGrantsRefuseBeforeStateAccess', async t => {
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs');
  for (const change of [{ ownerApproved: false }, { expiresAt: '2000-01-01T00:00:00Z' }, { maxCalls: 3 }, { maxTools: 1 }]) {
    const f = await fixture(t, change); await assert.rejects(openLocalBoundary(f.options), /LOCAL_GRANT_INVALID|LOCAL_GRANT_EXPIRED/); assert.deepEqual(await readdir(f.grant.ledgerDir), []);
  }
  const f = await fixture(t); await assert.rejects(openLocalBoundary({ ...f.options, model: 'wrong' }), /LOCAL_TARGET_MISMATCH/); assert.deepEqual(await readdir(f.grant.ledgerDir), []);
});
test('consumedGrantCannotReopenOrRebind', async t => {
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs');
  const f = await fixture(t); await openLocalBoundary(f.options);
  await assert.rejects(openLocalBoundary(f.options), /LOCAL_GRANT_CONSUMED/);
  await assert.rejects(openLocalBoundary({ ...f.options, endpoint: 'http://127.0.0.1:19998/v1' }), /LOCAL_TARGET_MISMATCH/);
});
test('capsSurviveReopenAndRejectRedirects', async t => {
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs');
  const f = await fixture(t), boundary = await openLocalBoundary(f.options); let dispatched = 0;
  const request = { method: 'POST', body: JSON.stringify({ model: f.grant.model, stream: true, max_tokens: 2048 }) };
  const transport = async () => { dispatched++; return new Response('data: [DONE]\n\n'); };
  await (await boundary.fetch(f.grant.endpoint + '/chat/completions', request, transport)).text();
  await assert.rejects(boundary.fetch(f.grant.endpoint + '/chat/completions', request, transport), /LOCAL_CALL_CAP/);
  await assert.rejects(openLocalBoundary(f.options), /LOCAL_GRANT_CONSUMED/); assert.equal(dispatched, 1);
  const g = await fixture(t), redirectBoundary = await openLocalBoundary(g.options);
  await assert.rejects(redirectBoundary.fetch(g.grant.endpoint + '/chat/completions', request, async () => new Response(null, { status: 307, headers: { location: 'https://example.invalid/' } })), /LOCAL_REDIRECT_DENIED/);
  const h = await fixture(t), strict = await openLocalBoundary(h.options);
  for (const body of [{ model: 'other', stream: true, max_tokens: 2048 }, { model: h.grant.model, stream: true, max_tokens: 2049 }, { model: h.grant.model, stream: true, max_tokens: 2048, tools: [{ function: { name: 'shell_run' } }] }]) {
    await assert.rejects(strict.fetch(h.grant.endpoint + '/chat/completions', { ...request, body: JSON.stringify(body) }, transport), /LOCAL_REQUEST_CAP_DENIED/);
  }
  assert.equal(strict.snapshot().calls, 0); assert.equal(dispatched, 1);
});
test('toolGrantAllowsOnlyOneExactFixtureWrite', async t => {
  const f = await fixture(t), grant = { ...f.grant, maxCalls: 2, maxTools: 1, toolRoot: join(f.grant.stateDir, 'work') };
  await writeFile(f.approvalFile, JSON.stringify(grant));
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs'), boundary = await openLocalBoundary(f.options);
  const args = { path: join(grant.toolRoot, 'probe.txt'), content: 'Tilde M4 local tool probe\n', expectedSha256: null };
  await assert.rejects(boundary.claimTool({ tool: 'shell_run', args: {} }), /LOCAL_TOOL_DENIED/);
  await assert.rejects(boundary.claimTool({ tool: 'fs_write', args: { ...args, path: join(grant.toolRoot, 'other') } }), /LOCAL_TOOL_DENIED/);
  await boundary.claimTool({ tool: 'fs_write', args }); await assert.rejects(boundary.claimTool({ tool: 'fs_write', args }), /LOCAL_TOOL_CAP/);
  assert.equal(boundary.snapshot().tools, 1);
});
test('actualHelperUsesOnlySyntheticLoopbackAndPrivateState', async t => {
  const { runLocalQualification } = await import('../../scripts/m4-local-qualification.mjs');
  for (const api of ['openai-completions', 'openai-responses']) await t.test(api, async t => {
    const server = await startOpenAiFixture({ mode: 'stream', allowedCalls: 1 }); t.after(() => server.close());
    const f = await fixture(t, { endpoint: server.url, api }), port = new URL(server.url).port;
    const actualFetch = globalThis.fetch, originalConnect = net.connect; let sockets = 0;
    const guardedConnect = function (...args) {
      const first = args[0], host = typeof first === 'object' ? first.host ?? first.hostname : args[1], targetPort = typeof first === 'object' ? first.port : first;
      assert.equal(host, '127.0.0.1', 'non-fixture sockets denied'); assert.equal(String(targetPort), port);
      sockets++;
      return Reflect.apply(originalConnect, this, args);
    };
    t.mock.method(net, 'connect', guardedConnect); t.mock.method(net, 'createConnection', guardedConnect);
    t.mock.method(tls, 'connect', () => { throw new Error('TLS_SOCKET_DENIED'); }); syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    t.mock.method(globalThis, 'fetch', (input, init) => {
      assert.equal(new URL(input instanceof Request ? input.url : String(input)).origin, new URL(server.url).origin);
      return actualFetch(input, init);
    });
    const result = await runLocalQualification(f.options);
    assert.equal(result.status, 'pass', JSON.stringify(result)); assert.equal(result.calls, 1); assert.equal(result.tools, 0); assert.equal(result.cleanup, true); assert.equal(server.calls(), 1);
    assert.equal(server.requests[0].authorization, undefined);
    assert.ok(sockets > 0, 'the actual transport passed the socket guard');
    await assert.rejects(runLocalQualification(f.options), /LOCAL_GRANT_CONSUMED/); assert.equal(server.calls(), 1);
  });
});
test('actualHelperToolTrialRequiresVerifiedEffect', async t => {
  const { runLocalQualification } = await import('../../scripts/m4-local-qualification.mjs');
  const f = await fixture(t), toolRoot = join(f.grant.stateDir, 'work');
  const server = await startOpenAiFixture({ mode: 'tool', allowedCalls: 2, toolPath: join(toolRoot, 'probe.txt'), toolContent: 'Tilde M4 local tool probe\n' }); t.after(() => server.close());
  const grant = { ...f.grant, endpoint: server.url, maxCalls: 2, maxTools: 1, toolRoot }; await writeFile(f.approvalFile, JSON.stringify(grant));
  const result = await runLocalQualification({ ...f.options, endpoint: server.url });
  assert.equal(result.status, 'pass', JSON.stringify(result)); assert.equal(result.toolCapable, true); assert.equal(result.calls, 2); assert.equal(result.tools, 1);
  assert.equal(await readFile(join(toolRoot, 'probe.txt'), 'utf8'), 'Tilde M4 local tool probe\n');
});
test('actualHelperRejectsRedirectBeforeAnotherTarget', async t => {
  const { runLocalQualification } = await import('../../scripts/m4-local-qualification.mjs');
  const destination = await startOpenAiFixture({ mode: 'stream', allowedCalls: 1 }); t.after(() => destination.close());
  const source = await startOpenAiFixture({ mode: 'redirect', allowedCalls: 1, redirect: destination.url + '/chat/completions' }); t.after(() => source.close());
  const f = await fixture(t, { endpoint: source.url }), result = await runLocalQualification(f.options);
  assert.equal(result.status, 'fail'); assert.equal(result.calls, 1); assert.equal(source.calls(), 1); assert.equal(destination.calls(), 0);
});
test('actualHelperDeadlineCancelsOwnedStream', async t => {
  const { runLocalQualification } = await import('../../scripts/m4-local-qualification.mjs');
  const server = await startOpenAiFixture({ mode: 'stall', allowedCalls: 1 }); t.after(() => server.close());
  const f = await fixture(t, { endpoint: server.url, timeoutMs: 100 }), started = performance.now();
  const result = await runLocalQualification(f.options); assert.equal(result.status, 'fail'); assert.equal(result.calls, 1); assert.ok(performance.now() - started < 3000);
  for (let i = 0; i < 100 && !server.cancellations(); i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(server.cancellations(), 1);
});
test('parallelRequestsCannotSpendTheGrantTwice', async t => {
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs');
  const f = await fixture(t), boundary = await openLocalBoundary(f.options); let calls = 0;
  const request = { method: 'POST', body: JSON.stringify({ model: f.grant.model, stream: true, max_tokens: 2048 }) };
  const transport = async () => { calls++; return new Response('done'); };
  const results = await Promise.allSettled([boundary.fetch(f.grant.endpoint + '/chat/completions', request, transport), boundary.fetch(f.grant.endpoint + '/chat/completions', request, transport)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(calls, 1);
  for (const r of results) if (r.status === 'fulfilled') await r.value.text();
  const record = JSON.parse(await readFile(join(f.grant.ledgerDir, f.grant.runId, 'record.json'), 'utf8')); assert.equal(record.calls, 1);
});
test('unsafeGrantFileNeverCreatesAClaim', async t => {
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs');
  const f = await fixture(t); await chmod(f.approvalFile, 0o644); await assert.rejects(openLocalBoundary(f.options), /LOCAL_GRANT_INVALID/);
  await chmod(f.approvalFile, 0o600); const link = join(f.root, 'link.json'); await symlink(f.approvalFile, link);
  await assert.rejects(openLocalBoundary({ ...f.options, approvalFile: link }), { code: 'ELOOP' }); assert.deepEqual(await readdir(f.grant.ledgerDir), []);
});
test('toolGrantWithoutAToolReplyCannotPass', async t => {
  const { runLocalQualification } = await import('../../scripts/m4-local-qualification.mjs');
  const server = await startOpenAiFixture({ mode: 'stream', allowedCalls: 2 }); t.after(() => server.close());
  const f = await fixture(t, { endpoint: server.url }), grant = { ...f.grant, maxCalls: 2, maxTools: 1, toolRoot: join(f.grant.stateDir, 'work') };
  await writeFile(f.approvalFile, JSON.stringify(grant)); const result = await runLocalQualification(f.options);
  assert.equal(result.status, 'fail'); assert.equal(result.toolCapable, false); assert.equal(result.calls, 1); assert.equal(result.tools, 0);
});
test('bothTokenFieldsCannotBypassTheOutputCap', async t => {
  const { openLocalBoundary } = await import('../../scripts/release/local-boundary.mjs');
  const f = await fixture(t), boundary = await openLocalBoundary(f.options); let calls = 0;
  await assert.rejects(boundary.fetch(f.grant.endpoint + '/chat/completions', { method: 'POST', body: JSON.stringify({ model: f.grant.model, stream: true, max_tokens: 2048, max_completion_tokens: 9999 }) }, async () => { calls++; return new Response('done'); }).then(r => r.text()), /LOCAL_REQUEST_CAP_DENIED/);
  assert.equal(calls, 0);
});
