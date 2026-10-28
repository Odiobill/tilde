import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FixtureMode = 'stream' | 'tool' | 'stall' | 'malformed' | 'error' | 'redirect';
export async function startOpenAiFixture({ mode, allowedCalls, toolPath, toolContent = 'synthetic once', redirect }: {
  mode: FixtureMode; allowedCalls: number; toolPath?: string; toolContent?: string; redirect?: string;
}) {
  const requests: { path: string; body: any; authorization?: string }[] = [];
  let cancellations = 0;
  const server = createServer(async (req, res) => {
    let bytes = '';
    for await (const chunk of req) { bytes += chunk; if (Buffer.byteLength(bytes) > 1048576) { res.writeHead(413); res.end(); return; } }
    const body = JSON.parse(bytes || '{}');
    requests.push({ path: req.url!, body, authorization: req.headers.authorization });
    if (requests.length > allowedCalls) { res.writeHead(429); res.end(); return; }
    if (mode === 'error') { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'synthetic endpoint failure' } })); return; }
    if (mode === 'redirect') { res.writeHead(307, { location: redirect! }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.on('close', () => { if (!res.writableEnded) cancellations++; });
    const tool = mode === 'tool' && requests.length === 1;
    if (req.url === '/v1/responses') responses(res, tool);
    else completions(res, tool);
    if (mode !== 'stall') res.end();
  });
  function data(res: ServerResponse, value: unknown, event?: string) { res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(value)}\n\n`); }
  const args = () => JSON.stringify({ path: toolPath, content: toolContent, expectedSha256: null });
  function completions(res: ServerResponse, tool: boolean) {
    const chunk = (delta: unknown, finish_reason: string | null = null) => data(res, { id: 'm4-chat', object: 'chat.completion.chunk', created: 1, model: 'm4-fixture', choices: [{ index: 0, delta, finish_reason }] });
    chunk({ role: 'assistant', ...(tool ? { tool_calls: [{ index: 0, id: 'm4-call', type: 'function', function: { name: 'fs_write', arguments: '' } }] } : { content: 'synthetic ' }) });
    if (mode === 'stall') return;
    if (mode === 'malformed') { res.write('data: {invalid JSON\n\n'); return; }
    chunk(tool ? { tool_calls: [{ index: 0, function: { arguments: args() } }] } : { content: 'completion' });
    chunk({}, tool ? 'tool_calls' : 'stop'); res.write('data: [DONE]\n\n');
  }
  function responses(res: ServerResponse, tool: boolean) {
    const response = { id: 'm4-response', object: 'response', status: 'in_progress', output: [] as unknown[] };
    const item = tool ? { type: 'function_call', id: 'fc_m4', call_id: 'm4-call', name: 'fs_write', arguments: '' } : { type: 'message', id: 'msg_m4', role: 'assistant', status: 'in_progress', content: [] as unknown[] };
    const event = (type: string, value: object) => data(res, { type, sequence_number: 0, ...value }, type);
    event('response.created', { response }); event('response.output_item.added', { output_index: 0, item });
    if (tool) event('response.function_call_arguments.delta', { output_index: 0, delta: args() });
    else event('response.output_text.delta', { output_index: 0, content_index: 0, delta: 'synthetic completion' });
    if (mode === 'stall' || mode === 'malformed') return;
    const done = tool ? { ...item, arguments: args() } : { ...item, status: 'completed', content: [{ type: 'output_text', text: 'synthetic completion', annotations: [] }] };
    event('response.output_item.done', { output_index: 0, item: done });
    event('response.completed', { response: { ...response, status: 'completed', output: [done], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } });
  }
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests,
    calls: () => requests.length, cancellations: () => cancellations,
    async close() { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
