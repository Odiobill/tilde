# Bounded M4 performance and regression qualification

Build first with `npm run build`; do not relink the GUI while a fixture launches
it. `node scripts/qualify-regressions.mjs --evidence NEW_PRIVATE_RUN` reuses the
actual SQLite FULL/locked, filesystem/receipt, redaction, UID/native IPC,
credential mutation, exact-approval and crash fixtures. All credentials/providers
are synthetic. Owned transient units and private state are removed by those
fixtures. A process kill does not establish storage-loss durability. An unknown
non-idempotent outcome is retained and never blindly redispatched. Cancellation
cannot undo an effect; approved shell code retains ordinary account access.

`node scripts/qualify-performance.mjs --mode offscreen --evidence NEW_PRIVATE_RUN`
starts two fresh fixture processes in owned transient user units capped at1GiB,
128tasks and80seconds each. The row fixture is128messages ×1700bytes; the answer
fixture is32messages ×7800bytes. Each loads bounded history, takes30one-second
baseline samples, performs3chat-scroll/Settings-navigation cycles, then takes
30settled samples without resetting the process. Raw RSS, process CPU and idle
content-position changes are retained per second. The limits remain <512MiB,
<0.25CPU seconds per settled second, <5idle position changes and <3seconds
resident-window readiness. Compare baseline and settled profiles; investigate
unexplained retained growth instead of clearing the process to hide it.

Five further fresh processes each report cold primary-input readiness, two warm
focus observations and a ready-to-reconnect barrier after synthetic IPC loss.
The driver retains all10warm and5cold/reconnect samples, distributions and
threshold misses. Cold timing runs from the driver immediately before starting
the owned unit through focused primary input, including private D-Bus, synthetic
IPC and QML startup; it is not an in-process QML-only timing. The reference limits
are <300ms warm focus, <1.5seconds cold input and <3seconds ready-to-reconnect.
An activation ACK is never a compositor focus observation. Reconnect readiness
does not authorize resuming work. Focus/navigation send zero inputs/decisions.

Offscreen/software is separate preparatory evidence. Its driver deliberately
exits1 because `performance.reference` remains not_run. Actual default-renderer
Wayland/X11 runs require `--mode native --grant PRIVATE_OWNER_SCOPE`, bound to
the exact native fixture hash, current local logind session, new evidence path,
expiry and at most240seconds. The scope is single-use, same-UID mode0600 in a
mode0700 directory; symlinks/unsafe ownership/replay refuse before windows or
units. It grants no desktop configuration, session interruption, service
enablement or inference. Do not reuse an earlier desktop qualification scope.
The driver records renderer API, session, runtime, hardware labels and cleanup;
missing samples, unavailable focus, threshold misses or leaked units fail.

Normal CTest runs leave the lengthy fixture slots inactive. To exercise one
explicitly, the driver sets `TILDE_M4_RESOURCE_CASE=rows|bytes` or
`TILDE_M4_TIMING=1` in private state. These are synthetic test entry points,
not production model settings or authorization. The required final-source/
installed artifact qualification and final owner acceptance remain separate.
