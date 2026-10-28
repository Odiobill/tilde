import'./smoke-network-fixture.js';import net from'node:net';import assert from'node:assert/strict';import{appendFileSync}from'node:fs';
assert.throws(()=>net.connect({host:'127.0.0.1',port:9}),/FIXTURE_NETWORK_DISABLED/);const marker=process.env.TILDE_FIXTURE_FETCH_MARKER;if(!marker)throw Error('FIXTURE_MARKER_REQUIRED');appendFileSync(marker+'.sockets','denied\n',{mode:0o600});
