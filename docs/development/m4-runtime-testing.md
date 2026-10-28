# Runtime qualification

`.node-version` selects the exact development runtime. It does not override the
package's capability-checked minimum of Node 22.19.0. Use a supported patched
release for ordinary use; the old exact floor is an isolated compatibility test.
The tested release lanes are explicit in `packaging/release/runtime-matrix.json`.
An engine range does not establish compatibility with every future Node major.

Use `TILDE_NODE` to select an absolute Node executable. Build commands check that
its public Node and libuv headers match its runtime versions. Header discovery
checks the selected installation first, then conventional system locations.
Set absolute `TILDE_NODE_INCLUDE_DIR` and `TILDE_UV_INCLUDE_DIR` when needed.
No headers are downloaded automatically. `TILDE_CMAKE` selects CMake; otherwise
the system PATH must provide CMake >=3.24. CTest must belong to that installation.
No private experiment directory is a build prerequisite.

For example, set these variables in the command environment and run `npm run
build`, `npm run typecheck`, and `npm test`. The npm bootstrap passes each build
or product entry point to the selected executable. CMake receives that same
executable in its GUI fixture definitions.

Run the full matrix with explicitly selected `TILDE_NODE_FLOOR22`,
`TILDE_NODE_LATEST22`, `TILDE_NODE_LATEST24`, and `TILDE_NODE_ARCH_SYSTEM` binaries:

```sh
node scripts/qualify-runtimes.mjs \
  --matrix packaging/release/runtime-matrix.json \
  --evidence /absolute/private/new-run \
  --npm-cache /absolute/private/dependency-cache --acquire
```

`--acquire` permits locked npm registry acquisition with lifecycle scripts
disabled. Omit it for an offline build using an already prepared cache. Each
lane gets a separate source tree, private HOME/XDG state, fresh native build,
build/typecheck/product/release/CTest logs, and actual command exit statuses.
Reports distinguish missing prerequisites from failed tests. A rerun uses a new
evidence directory; retain original failures. Historical protocol checks use the public nine-entry digest fixture; generated
headers are rebuilt and checked rather than included as stale build output.

SQLite and Chord probes are separate from native load checks. Product tests also
exercise SQLite persistence/recovery and real synthetic native transport traffic.
The transport addon calls libuv directly: Node-API v8 is not a cross-major ABI
qualification. Rebuild and test against the selected executable and matching
headers. Two binaries with the same Node version can embed different libuv
versions and need separate evidence. The Arch installed-artifact gate is separate
from building against the current host runtime.

The private tray fixture requires a Qt platform theme implementing the status
notifier interface. Preserve selected desktop/theme metadata in test children,
while excluding host provider/profile credentials. Offscreen/private-bus evidence
does not establish actual compositor focus, desktop tray rendering or accessibility.
