import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { openLocalBoundary } from './release/local-boundary.mjs';

export async function runLocalQualification(options) {
  // Only built-in modules load before a fresh valid, target-bound durable grant.
  const boundary = await openLocalBoundary(options), { grant } = boundary;
  await mkdir(grant.stateDir, { mode: 0o700 });
  const resultFile = join(grant.stateDir, 'qualification.json');
  const originalFetch = globalThis.fetch; let daemon, agent;
  globalThis.fetch = (input, init) => boundary.fetch(input, init, originalFetch);
  let result;
  try {
    const { resolvePaths, preparePaths, loadRegistry, saveConnection, loadSelection, saveSelection, loadWorkLimits, updateWorkLimits } = await import('@tilde/config');
    const { openAgent, createToolRuntime } = await import('@tilde/agent');
    const { startDaemon } = await import('../apps/daemon/dist/daemon.js');
    await mkdir(join(grant.stateDir, 'run'), { mode: 0o700 });
    if (grant.toolRoot) await mkdir(grant.toolRoot, { mode: 0o700 });
    const paths = resolvePaths({ XDG_RUNTIME_DIR: join(grant.stateDir, 'run') }, grant.stateDir, process.geteuid()); await preparePaths(paths, process.geteuid());
    const id = randomUUID(), definition = { version: 1, connectionId: id, providerId: 'tilde-local-' + id, kind: 'openai-compatible', displayName: 'Explicit local qualification', baseUrl: grant.endpoint, api: grant.api, auth: { mode: 'none' }, options: { kind: 'none' }, headers: [], models: [{ id: grant.model, name: grant.model, reasoning: false, contextWindow: 8192, maxTokens: grant.maxOutputTokens }] };
    const saved = await saveConnection(paths, (await loadRegistry(paths)).revision, definition), before = (await loadSelection(paths)).selection;
    await saveSelection(paths, before.selectionRevision, { version: 2, connectionId: id, definitionRevision: saved.definitionRevision, providerId: definition.providerId, modelId: grant.model, authFile: paths.defaultAuthFile });
    const limits = await loadWorkLimits(paths);
    await updateWorkLimits(paths, limits.revision, { ...limits.settings, providerRequests: grant.maxCalls, toolOperations: Math.max(1, grant.maxTools), providerTimeoutMs: grant.timeoutMs, outputTokens: grant.maxOutputTokens, modelOutputOverrides: [] });
    daemon = await startDaemon({ paths, config: { ...(await loadSelection(paths)).selection, version: 1 }, providerEnv: {}, notifications: { bridge: { async start() { return false; }, async close() {}, async notify() { return 'unavailable'; }, onStatus() { return () => {}; }, onOpen() { return () => {}; } }, launch() {} },
      agentFactory: async options => agent = await openAgent({ ...options, tooling: grant.maxTools === 0 ? undefined : async sanitizer => {
        const runtime = await createToolRuntime({ paths, config: { version: 1, roots: [grant.toolRoot], retentionDays: 7 }, sanitizer, budgets: { requests: grant.maxCalls, tools: grant.maxTools } });
        const restrict = registration => ({ ...registration, async execute(args, ...rest) { await boundary.claimTool({ tool: 'fs_write', args }); return registration.execute(args, ...rest); } });
        return { ...runtime, registrations: runtime.registrations.filter(t => t.name === 'fs_write').map(restrict), m3Registrations: runtime.m3Registrations.filter(t => t.name === 'fs_write').map(restrict) };
      } }),
    });
    const selection = (await loadSelection(paths)).selection;
    const text = grant.maxTools ? `Make exactly one fs_write call with these exact arguments, then reply briefly: ${JSON.stringify({ path: join(grant.toolRoot, 'probe.txt'), content: 'Tilde M4 local tool probe\n', expectedSha256: null })}. Do not call any other tool.` : 'Reply with a short greeting. This is one bounded local-model qualification request; do not call tools.';
    const sent = await agent.submit({ requestId: grant.runId, text, selectionRevision: selection.selectionRevision });
    const deadline = Date.now() + grant.maxCalls * grant.timeoutMs + 5000;
    let snapshot;
    while (Date.now() < deadline) {
      snapshot = await agent.snapshot();
      if (snapshot.state !== 'running') break;
      if ((await agent.budgets?.pauses())?.length) break;
      await delay(20);
    }
    if (snapshot?.state === 'running') await agent.cancel();
    const outcome = await agent.conversations.noticeOutcome(agent.conversations.rootId, sent.submissionId);
    const counts = boundary.snapshot(), operations = agent.tooling ? (await agent.tooling.broker.snapshot()).operations : [];
    const toolPassed = grant.maxTools === 1 && counts.tools === 1 && operations.length === 1 && operations[0].attempt === 1 && operations[0].status === 'completed';
    result = { version: 1, runId: grant.runId, endpoint: grant.endpoint, model: grant.model, api: grant.api, kind: 'explicit-local-inference', outcome, status: outcome === 'completed' && counts.calls > 0 && (grant.maxTools === 0 || toolPassed) ? 'pass' : 'fail', calls: counts.calls, tools: counts.tools, toolCapable: toolPassed, chatOnly: grant.maxTools === 0, maxOutputTokens: grant.maxOutputTokens, timeoutMs: grant.timeoutMs, retries: 0, shell: 0, cleanup: false };
  } finally {
    try { await daemon?.close(); } finally { globalThis.fetch = originalFetch; }
    if (result) { result.cleanup = true; await writeFile(resultFile, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { 'opt-in': { type: 'boolean' }, 'approval-file': { type: 'string' }, endpoint: { type: 'string' }, model: { type: 'string' }, api: { type: 'string' }, 'state-dir': { type: 'string' }, 'run-id': { type: 'string' } } });
    const result = await runLocalQualification({ optIn: values['opt-in'], approvalFile: values['approval-file'], endpoint: values.endpoint, model: values.model, api: values.api, stateDir: values['state-dir'], runId: values['run-id'] });
    console.log(JSON.stringify(result)); process.exitCode = result.status === 'pass' ? 0 : 1;
  } catch (error) { console.error(/^LOCAL_[A-Z_]+$/.test(error.message) ? error.message : 'LOCAL_QUALIFICATION_FAILED'); process.exitCode = 2; }
}
