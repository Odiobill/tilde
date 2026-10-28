import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolvePaths, preparePaths, loadRegistry, saveConnection, loadSelection, saveSelection, type ConnectionDefinition } from '@tilde/config';
import { openCredentialStore } from '@tilde/credentials';
import { openAgent, createToolRuntime, type AgentSession } from '@tilde/agent';
import { startDaemon } from '../../../apps/daemon/dist/daemon.js';
import { Client } from './client.js';
import { startOpenAiFixture, type FixtureMode } from './fixtures/m4-openai-server.js';

async function until<T>(fn: () => Promise<T>, predicate: (value: T) => boolean) {
  for (let i = 0; i < 600; i++) { const value = await fn(); if (predicate(value)) return value; await delay(10); }
  throw new Error('M4_SYNTHETIC_DEADLINE');
}
async function fixture(t: TestContext, mode: FixtureMode, api: 'openai-completions' | 'openai-responses' = 'openai-completions', auth: 'none' | 'api-key' | 'environment' = 'none') {
  const home = await mkdtemp(join(tmpdir(), 'tilde-m4-local-')), work = join(home, 'work');
  await mkdir(join(home, 'run'), { mode: 0o700 }); await mkdir(work, { mode: 0o700 });
  const paths = resolvePaths({ XDG_RUNTIME_DIR: join(home, 'run') }, home, process.geteuid!()); await preparePaths(paths, process.geteuid!());
  const http = await startOpenAiFixture({ mode, allowedCalls: mode === 'tool' ? 2 : 1, toolPath: join(work, 'once') });
  const actualFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.equal(new URL(url).origin, new URL(http.url).origin, 'hosted fallback/network is forbidden');
    return actualFetch(input, init);
  });
  const id = randomUUID(), definition: ConnectionDefinition = {
    version: 1, connectionId: id, providerId: 'tilde-local-' + id, kind: 'openai-compatible', displayName: 'M4 synthetic',
    baseUrl: http.url, api, auth: auth === 'environment' ? { mode: auth, envKey: 'M4_SYNTHETIC_KEY' } : { mode: auth },
    options: { kind: 'none' }, headers: [], models: [{ id: 'm4-fixture', name: 'M4 fixture', reasoning: false, contextWindow: 8192, maxTokens: 1024 }],
  };
  const saved = await saveConnection(paths, (await loadRegistry(paths)).revision, definition), before = (await loadSelection(paths)).selection;
  await saveSelection(paths, before.selectionRevision, { version: 2, connectionId: id, definitionRevision: saved.definitionRevision, providerId: definition.providerId, modelId: 'm4-fixture', authFile: paths.defaultAuthFile });
  if (auth === 'api-key') await openCredentialStore(paths.defaultAuthFile).modify(definition.providerId, async () => ({ type: 'api_key', key: 'm4-synthetic-api-canary' }));
  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined, client: Client, agent: AgentSession;
  async function close() { client?.close(); await daemon?.close(); daemon = undefined; }
  t.after(async () => { await close(); await http.close(); await rm(home, { recursive: true, force: true }); });
  async function start() {
    daemon = await startDaemon({ paths, config: { ...(await loadSelection(paths)).selection, version: 1 },
      providerEnv: { OPENAI_API_KEY: 'm4-ambient-never-used', M4_SYNTHETIC_KEY: 'm4-synthetic-env-canary' },
      agentFactory: async options => agent = await openAgent({ ...options, tooling: mode === 'tool' ? sanitizer => createToolRuntime({ paths, config: { version: 1, roots: [work], retentionDays: 7 }, sanitizer }) : undefined }),
    });
    client = new Client(paths.socketPath); assert.equal((await client.ready()).ok, true); return client;
  }
  await start();
  return { http, home, work, paths, close, start, agent: () => agent, client: () => client,
    async send() { const settings = (await client.wire('settings.get')).result; const result = await client.wire('conversation.submit', { requestId: randomUUID(), text: 'Synthetic private fixture only', selectionRevision: settings.selection.selectionRevision }); assert.equal(result.ok, true, JSON.stringify(result)); return result; },
    terminal: () => until(() => agent.snapshot(), value => value.state !== 'running'),
  };
}
test('keylessCustomConnectionStreamsAndReopens', async t => {
  for (const api of ['openai-completions', 'openai-responses'] as const) await t.test(api, async t => {
    const f = await fixture(t, 'stream', api); assert.equal(f.http.calls(), 0); await f.send();
    const done = await f.terminal(); assert.equal(done.state, 'idle'); assert.ok(JSON.stringify(done).includes('synthetic completion'));
    assert.equal(f.http.calls(), 1); assert.equal(f.http.requests[0]!.authorization, undefined);
    await f.close(); await f.start(); await delay(30); assert.equal(f.http.calls(), 1);
    assert.ok(JSON.stringify(await f.agent().snapshot()).includes('synthetic completion'));
  });
});
test('customAuthModesUseOnlySyntheticCanaries', async t => {
  for (const mode of ['api-key', 'environment'] as const) await t.test(mode, async t => {
    const f = await fixture(t, 'stream', 'openai-completions', mode); await f.send(); await f.terminal();
    assert.equal(f.http.requests[0]!.authorization, 'Bearer ' + (mode === 'api-key' ? 'm4-synthetic-api-canary' : 'm4-synthetic-env-canary'));
    assert.ok(!JSON.stringify(f.client().frames).includes(mode === 'api-key' ? 'm4-synthetic-api-canary' : 'm4-synthetic-env-canary'));
    assert.equal(f.http.calls(), 1);
  });
});
test('compatToolCallUsesExistingBrokerOnly', async t => {
  for (const api of ['openai-completions', 'openai-responses'] as const) await t.test(api, async t => {
    const f = await fixture(t, 'tool', api); await f.send(); const done = await f.terminal(); assert.equal(done.state, 'idle', JSON.stringify(done));
    assert.equal(await readFile(join(f.work, 'once'), 'utf8'), 'synthetic once');
    const operations = (await f.agent().tooling!.broker.snapshot()).operations;
    assert.equal(operations.length, 1); assert.equal(operations[0]!.attempt, 1); assert.equal(f.http.calls(), 2);
  });
});
test('cancelAndMalformedStreamStayTruthful', async t => {
  for (const api of ['openai-completions', 'openai-responses'] as const) {
    await t.test(api + ' cancellation', async t => {
      const f = await fixture(t, 'stall', api); const sent = await f.send(); await until(async () => f.http.calls(), n => n === 1);
      assert.equal((await f.client().wire('conversation.cancel')).ok, true); await f.terminal();
      await until(async () => f.http.cancellations(), n => n === 1); assert.equal(f.http.calls(), 1);
      assert.equal(await f.agent().conversations!.noticeOutcome(f.client().rootConversationId, sent.result.submissionId), 'cancelled');
    });
    await t.test(api + ' malformed', async t => {
      const f = await fixture(t, 'malformed', api); await f.send(); const done = await f.terminal();
      assert.equal(done.errorCode, 'PROVIDER_FAILED', JSON.stringify(done)); assert.equal(f.http.calls(), 1);
    });
  }
});
test('endpointErrorNeverFallsBack', async t => {
  const f = await fixture(t, 'error'); await f.send(); const done = await f.terminal();
  assert.equal(done.errorCode, 'PROVIDER_FAILED'); assert.equal(f.http.calls(), 1);
});
