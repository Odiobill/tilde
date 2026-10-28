# Local provider qualification

`npm run build:ts` followed by
`node --test tests/integration/dist/m4-local-provider.test.js` exercises the
pinned actual SDK, public custom-connection configuration, daemon admission and
existing operation broker. The synthetic server binds `127.0.0.1` port zero;
tests allow only that origin, explicit synthetic credential canaries and private
state. Both chat completions and Responses cover streaming, restart/reopen,
typed filesystem tools, cancellation, malformed streams and endpoint errors.
These tests provide no real-model evidence.

`node --test tests/release/local-boundary.test.mjs` additionally exercises the
actual qualification controller. Its socket/fetch guard allows only the selected
synthetic fixture. The controller uses a new private credential store and
`providerEnv: {}`. No credential discovery, catalog refresh, SDK CLI, model/server
download, hosted fallback, desktop session or service enablement is involved.

## Separately authorized real trial

The helper is `scripts/m4-local-qualification.mjs`. First identify an existing
server, already loaded model and API. The supported endpoint is an explicit
loopback IP HTTP(S) URL ending in `/v1`, without credentials/query/fragment;
there is no default. An existing server requiring credentials needs a separately
designed scope; this helper is keyless only. Keyless requests still run inference.

Proposed chat trial: one request, at most 2048 requested output tokens, a
60-second request/stream deadline, no retries, tools or shell. Proposed separate
tool trial: at most two requests, 2048 requested output tokens each, 60 seconds
each, zero retries, one exact `fs_write` in a new fixture root, no shell. A grant
may lower these limits. A reply without the verified tool operation fails the
tool trial. Neither proposal or this document grants permission.

After explicit owner approval of the concrete target/bounds, preserve that
statement in private evidence and prepare a private JSON grant. The following
is an **invalid example**, not authorization:

```json
{
  "version": 1,
  "ownerApproved": false,
  "runId": "REPLACE_WITH_APPROVED_UUID",
  "endpoint": "http://127.0.0.1:REPLACE_PORT/v1",
  "model": "REPLACE_WITH_APPROVED_MODEL",
  "api": "openai-completions",
  "stateDir": "/absolute/private/parent/new-state",
  "ledgerDir": "/absolute/private/parent/grant-ledger",
  "expiresAt": "REPLACE_WITH_APPROVED_UTC_EXPIRY",
  "maxCalls": 1,
  "maxOutputTokens": 2048,
  "timeoutMs": 60000,
  "maxTools": 0,
  "toolRoot": null
}
```

The grant file must be a regular same-UID single-link mode-0600 file, in a
same-UID mode-0700 parent. `ledgerDir` and the parent of `stateDir` must already
be same-UID mode-0700 directories without symlink ancestors. `stateDir` must not
exist. A tool grant requires `maxCalls: 2`, `maxTools: 1` and `toolRoot` exactly
`stateDir + "/work"`. The only permitted operation is `fs_write` of
`toolRoot + "/probe.txt"`, with content `"Tilde M4 local tool probe\n"` and
`expectedSha256: null`. The existing broker validates and verifies that effect;
the helper never approves a pending operation.

Invoke with **all** target fields matching the grant:

```sh
node scripts/m4-local-qualification.mjs --opt-in \
  --approval-file /absolute/private/parent/approval.json \
  --endpoint http://127.0.0.1:APPROVED_PORT/v1 \
  --model APPROVED_MODEL --api openai-completions \
  --state-dir /absolute/private/parent/new-state --run-id APPROVED_UUID
```

Before any product import/store/network access, the controller validates and
durably consumes `ledgerDir/runId`. Claims remain consumed after errors, crashes,
state removal and reopen; a different endpoint/model cannot reuse the grant.
Do not delete a consumed claim to retry. A new trial requires new owner approval.
Concurrent requests serialize their durable charges **before** network dispatch.
Each POST must use the exact endpoint path/model and one permitted token-cap
field. Authorization headers, extra targets, redirects and shell tools are
refused. Request/stream deadlines abort the owned transport; each response has
a 1 MiB framing/output byte ceiling in addition to the requested model token
cap. The server must honor its advertised token semantics; the helper does not
infer an unknown model's tokenizer or claim to stop a remote server's GPU after
disconnect. The product's normal output/operation policies also remain active.

The private result contains counts, bounds, actual completion status and owned
daemon cleanup, without conversation text or credentials. Preserve raw command
status and the grant ledger with it. A non-tool reply, cancellation, timeout,
malformed response or redirect is failure evidence, never a retry trigger.
Missing real chat/tool evidence remains a release blocker unless the owner
accepts a precise scoped exception. Synthetic reports cannot satisfy it.
