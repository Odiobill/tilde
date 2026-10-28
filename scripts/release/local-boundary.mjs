import { constants } from 'node:fs';
import { open, lstat, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { sha256, noSymlinkParents } from './files.mjs';

const fail = code => { throw new Error(code); };
async function privateDirectory(path) {
  if (!isAbsolute(path)) fail('LOCAL_PRIVATE_PATH_REQUIRED');
  await noSymlinkParents('/', path);
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o700) fail('LOCAL_UNSAFE_DIRECTORY');
}
async function syncDirectory(path) { const fd = await open(path, 'r'); try { await fd.sync(); } finally { await fd.close(); } }
export function localEndpoint(input) {
  let url; try { url = new URL(input); } catch { fail('LOCAL_ENDPOINT_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/v1')) fail('LOCAL_ENDPOINT_INVALID');
  return url.href;
}
export async function openLocalBoundary(options) {
  if (options.optIn !== true) fail('LOCAL_OPT_IN_REQUIRED');
  if (!options.approvalFile || !isAbsolute(options.approvalFile)) fail('LOCAL_APPROVAL_REQUIRED');
  await privateDirectory(dirname(options.approvalFile)); await noSymlinkParents('/', options.approvalFile);
  const fd = await open(options.approvalFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  let grant, bytes;
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 16384) fail('LOCAL_GRANT_INVALID');
    bytes = await fd.readFile(); try { grant = JSON.parse(bytes); } catch { fail('LOCAL_GRANT_INVALID'); }
  } finally { await fd.close(); }
  const keys = 'version,ownerApproved,runId,endpoint,model,api,stateDir,ledgerDir,expiresAt,maxCalls,maxOutputTokens,timeoutMs,maxTools,toolRoot'.split(',').sort().join(',');
  if (!grant || Object.keys(grant).sort().join(',') !== keys || grant.version !== 1 || grant.ownerApproved !== true || !/^[0-9a-f-]{36}$/.test(grant.runId) || typeof grant.model !== 'string' || !grant.model || grant.model.length > 256 || !['openai-completions', 'openai-responses'].includes(grant.api)
    || !Number.isInteger(grant.maxCalls) || grant.maxCalls < 1 || grant.maxCalls > 2 || !Number.isInteger(grant.maxOutputTokens) || grant.maxOutputTokens < 1 || grant.maxOutputTokens > 2048 || !Number.isInteger(grant.timeoutMs) || grant.timeoutMs < 1 || grant.timeoutMs > 60000 || ![0, 1].includes(grant.maxTools)
    || grant.maxTools === 0 && (grant.maxCalls !== 1 || grant.toolRoot !== null) || grant.maxTools === 1 && (grant.maxCalls !== 2 || grant.toolRoot !== join(grant.stateDir, 'work'))) fail('LOCAL_GRANT_INVALID');
  if (!Number.isFinite(Date.parse(grant.expiresAt))) fail('LOCAL_GRANT_INVALID');
  if (Date.parse(grant.expiresAt) <= Date.now()) fail('LOCAL_GRANT_EXPIRED');
  if (localEndpoint(grant.endpoint) !== grant.endpoint || !isAbsolute(grant.stateDir) || !isAbsolute(grant.ledgerDir)) fail('LOCAL_GRANT_INVALID');
  for (const key of ['endpoint', 'model', 'api', 'stateDir', 'runId']) if (options[key] !== grant[key]) fail('LOCAL_TARGET_MISMATCH');
  await privateDirectory(grant.ledgerDir); await privateDirectory(dirname(grant.stateDir));
  const claim = join(grant.ledgerDir, grant.runId);
  try { await lstat(claim); fail('LOCAL_GRANT_CONSUMED'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // A grant always creates fresh isolated product state. The durable claim is
  // outside it, so removing/reopening product state never renews permission.
  try { await lstat(grant.stateDir); fail('LOCAL_STATE_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await mkdir(claim, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') fail('LOCAL_GRANT_CONSUMED'); throw error; }
  const record = { version: 1, grantSha256: sha256(bytes), runId: grant.runId, calls: 0, tools: 0, status: 'consumed', endpoint: grant.endpoint, model: grant.model };
  let sequence = 0, lane = Promise.resolve();
  async function persist() {
    const temporary = join(claim, `record-${++sequence}.tmp`), file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(record) + '\n'); await file.sync(); } finally { await file.close(); }
    await rename(temporary, join(claim, 'record.json')); await syncDirectory(claim);
  }
  await persist(); await syncDirectory(grant.ledgerDir);
  const serialize = fn => { const result = lane.then(fn); lane = result.catch(() => {}); return result; };
  return {
    grant: Object.freeze({ ...grant }),
    snapshot: () => ({ ...record }),
    async fetch(input, init = {}, transport = globalThis.fetch) {
      const request = new Request(input, init), expected = grant.endpoint + (grant.api === 'openai-completions' ? '/chat/completions' : '/responses');
      if (request.url !== expected || request.method !== 'POST' || request.headers.has('authorization')) fail('LOCAL_REQUEST_TARGET_DENIED');
      let body; try { body = JSON.parse(await request.clone().text()); } catch { fail('LOCAL_REQUEST_INVALID'); }
      const tokenFields = ['max_tokens', 'max_completion_tokens', 'max_output_tokens'].filter(key => Object.hasOwn(body, key));
      const allowed = grant.api === 'openai-completions' ? ['max_tokens', 'max_completion_tokens'] : ['max_output_tokens'];
      const tokens = body[tokenFields[0]];
      if (tokenFields.length !== 1 || !allowed.includes(tokenFields[0]) || body.model !== grant.model || !Number.isInteger(tokens) || tokens < 1 || tokens > grant.maxOutputTokens || body.stream !== true || grant.maxTools === 0 && body.tools?.length || body.tools?.some(t => (t.function?.name ?? t.name) !== 'fs_write')) fail('LOCAL_REQUEST_CAP_DENIED');
      await serialize(async () => {
        if (Date.now() >= Date.parse(grant.expiresAt)) fail('LOCAL_GRANT_EXPIRED');
        if (record.calls >= grant.maxCalls) fail('LOCAL_CALL_CAP');
        record.calls++; await persist();
      });
      const abort = new AbortController(), signal = AbortSignal.any([request.signal, abort.signal]);
      const timer = setTimeout(() => abort.abort(new Error('LOCAL_TIMEOUT')), grant.timeoutMs);
      let response;
      try { response = await transport(new Request(request, { signal, redirect: 'manual' })); }
      catch (error) { clearTimeout(timer); throw error; }
      if (response.status >= 300 && response.status < 400) { clearTimeout(timer); await response.body?.cancel(); fail('LOCAL_REDIRECT_DENIED'); }
      if (!response.body) { clearTimeout(timer); return response; }
      const reader = response.body.getReader(); let bytes = 0;
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            const result = await reader.read();
            if (result.done) { clearTimeout(timer); controller.close(); return; }
            bytes += result.value.byteLength;
            if (bytes > 1048576) { abort.abort(new Error('LOCAL_OUTPUT_BYTES')); throw new Error('LOCAL_OUTPUT_BYTES'); }
            controller.enqueue(result.value);
          } catch (error) { clearTimeout(timer); await reader.cancel().catch(() => {}); controller.error(error); }
        },
        async cancel(reason) { clearTimeout(timer); abort.abort(reason); await reader.cancel(reason); },
      }), { status: response.status, headers: response.headers });
    },
    async claimTool(request) {
      return serialize(async () => {
        if (Date.now() >= Date.parse(grant.expiresAt)) fail('LOCAL_GRANT_EXPIRED');
        const expected = { path: grant.toolRoot && join(grant.toolRoot, 'probe.txt'), content: 'Tilde M4 local tool probe\n', expectedSha256: null };
        if (grant.maxTools !== 1 || request.tool !== 'fs_write' || JSON.stringify(Object.keys(request.args ?? {}).sort()) !== JSON.stringify(Object.keys(expected).sort()) || Object.keys(expected).some(k => request.args[k] !== expected[k])) fail('LOCAL_TOOL_DENIED');
        if (record.tools >= grant.maxTools) fail('LOCAL_TOOL_CAP'); record.tools++; await persist();
      });
    },
  };
}
