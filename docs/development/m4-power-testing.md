# Product storage-loss qualification

This is a test-only disposable-guest harness. It is excluded from the installed
product closure. It never opens a block device on the owner host. A process-kill
or ordinary-file test does not establish guest storage-loss durability, and this
model does not establish physical power-loss behavior on arbitrary hardware.

`tests/qualification/power/origin.json` records exact audited M0 source digests
and the project MIT license. The M4 copy keeps pending bytes solely in the
nbdkit process's RAM. Only an acknowledged flush writes the owned base image and
fsyncs it; close/cut discards pending bytes. Requests are serialized, pending
memory is capped at64MiB, trace metadata at16MiB, and no discard, zero, cache or
multiple-connection shortcuts are advertised. FUA uses nbdkit's documented
[emulated write-then-flush behavior](https://libguestfs.org/nbdkit-plugin.3.html).
No file/transcript payload is logged in the backend metadata trace.

Run ordinary tests first:

```sh
npm run build
python3 -m unittest discover -s tests/qualification/power -p '*_test.py'
node scripts/with-runtime.mjs --test tests/integration/dist/m4-power.test.js
```

They use injected guest transports and owned regular temporary files. Named
negative/positive controls prove the cache model, while separate guard tests
refuse wrong/active devices, unsafe files, stale PIDs, wrong VM identity,
unauthorized setup, changed recipes, oracle tampering and acknowledgement replay.
The actual product worker exercises conversations, selection, GUI drafts/outbox,
exact pending proposals, pinned Pi budgets and derived catalog rebuilding.
The retained actual process-crash fixture checks a non-idempotent unknown effect
without redispatch; that result remains a process test.

## Concrete guest preparation

Obtain a separate setup/boot/device/cut/reopen scope. A provisioning-only grant,
historical VM name/UUID or old PID is not authority. Record the exact current
QEMU name/UUID, QMP URI, canonical owned qcow2 overlay device/inode, private
QMP/PID directory, complete launch argv/hash, loopback SSH endpoint/key/known-host
identity, public source and compiled worker hashes, helper hashes, new evidence
and oracle paths, expiry, scenarios and maximum boots/cuts. Read current state
before every transition. Stop on a mismatch or incomplete cleanup.

Use a dedicated Arch VM account `tilde-check` UID1000. Acquire/build nbdkit with
its Python plugin from a separately verified source inside the guest; verify its
binary hash. Existing `nbd-client`, Python libnbd, ext4 and module/mount tools are
required. The installer never invokes a package manager or downloads anything.
The [Arch nbd package](https://archlinux.org/packages/extra/x86_64/nbd/) and
[libnbd package](https://archlinux.org/packages/extra/x86_64/libnbd/) are separate
from verifying a usable nbdkit build. Do not assume a package is available merely
because the harness needs it.

Stage the reviewed helper sources as root-owned regular files inside the guest.
`guest_setup.py --scope ROOT_PRIVATE_SETUP_SCOPE` first verifies an approved,
unexpired exact DMI UUID, Arch/KVM guest, dedicated account and source/binary
hashes. It installs only the fixed test helper/library, a disabled user cache
unit and exact helper-verb sudo rules. It initializes a new512MiB owned regular
image and fresh mount point. It neither attaches/formats the device nor enables
services. A changed/untracked installation refuses. The fixed root helper is
qualification infrastructure, never a production Tilde tool or host root helper.

GUI state, drafts, outbox and resume intents check file-data fsync before atomic
rename and persist the containing directory ancestry afterward; removals also
require the directory barrier. The `gui_storage_durability` CTest injects actual
file/directory fsync EIO and verifies that these paths never acknowledge success.
A prior calibrated committed-state run exposed an absent acknowledged outbox
after rename without the parent barrier; its failed candidate remains retained.

Before the first calibration cut, durably prepare **all** guest bootstrap
inputs outside the test device: the full offline source/dependency/native build,
compiled worker and native `tst_chat` binary, root helper/manifest/unit, mountpoint,
and private worker scope. A successful `sync -f` barrier on the guest root
filesystem persists all bootstrap data and directory metadata together. Hash the
immutable inputs, fsync the external-admission manifest and its directory ancestry,
then repeat the root filesystem barrier before controls. A timed-out per-file
flush loop is a failed setup, not permission to omit the durability barrier. Record exact worker,
GUI binary and backend hashes before controls and recheck every required artifact
after each reopen, before admitting another product worker. A missing artifact
is a setup failure, never permission to rebuild silently or repeat a cut.
The installer persists its directory ancestry; an external bootstrap still owns
durability of the source/build and worker scope it creates.

Keep the dedicated guest user's PAM session alive with a bounded owned SSH
channel while its user cache unit runs. Do not enable lingering or persistence.
A surviving NBD connection with a dead backend is an incomplete fixture; retain
the refusal and obtain any additional graceful recovery scope before proceeding.

The helper pins `/dev/nbd0` major43/minor0 and `/mnt/tilde-m4-power`, validates
DMI/manifest/code/image ownership and exact current boot/connection identity,
and refuses occupied devices/mounts/backends. Application mounts use
`noatime,nosuid,nodev,noexec`. Host-shared filesystems/disks are excluded.
The worker's separate private scope binds the approved VM, mounted source,
scenario list and expiry. The two shell scenarios additionally require the
exact `powerShellScript` SHA256 and one explicit synthetic effect decision each.
That script appends/fsyncs one `effect` line and waits in a bounded owned job;
no model chooses it. Pending-approval never approves or executes its proposal.
The shell writes a disposable `effect.ready` marker only after the effect-file
and working-directory fsyncs return. The worker waits for that marker before its
held acknowledgement: readable effect bytes alone do not prove durability. The
marker itself need not survive a cut and is not used during recovery. No flush
is inserted into the controller's acknowledged cut path.

## Calibration and product cases

`node scripts/qualify-power.mjs --grant PRIVATE_SCOPE --case CASE --evidence NEW_PRIVATE_ROOT`
runs one fixed case. Omitting the grant writes an explicit required `not_run`
row and starts nothing. All nine cases must be independently retained before
`recovery.product-storage-loss` can pass:

1. `negative-control`: an acknowledged durable region survives while a later
   unflushed region is lost. Any intervening flush invalidates that control.
2. `positive-control`: an acknowledged FUA/emulated-flush region survives.
3. `fresh-state`: newly created private product stores reopen consistently.
4. `committed-state`: conversation/input, selection and GUI draft/outbox identities
   survive; an outbox is retained state and never automatically submitted here.
5. `pending-approval`: full original request/fingerprint remains undecided,
   attempt0, unconsumed, with no effect.
6. `effect-before-journal`: the exact synthetic shell effect happened while the
   broker still records running; a new boot must report unknown, never replay it.
7. `budget-pause`: the original pinned Pi budget owner, revision and counts remain
   paused without provider work or an automatic extension.
8. `owned-job`: retained job/boot identity cannot attach to a new boot's process
   or turn missing exit evidence into acknowledged success.
9. `catalog-ui`: deliberately missing derived catalog rebuilds from authoritative
   conversations while retained GUI selection/draft/outbox identities remain.

The controller first fsyncs a chained external host oracle with the worker's
held acknowledgement, active Pi/operation SQLite WAL/FULL/integrity facts and
backend sequence. It reobserves the exact QMP guest, overlay and PID/start/boot,
then sends only SIGKILL to that owned QEMU process. The cut path never sends
shutdown, QMP quit, guest sync, unmount, detach or flush. Negative controls run
before application setup; a setup fault never authorizes another cut.

After observing the process stopped, retain an offline sparse overlay copy,
boot only within the remaining scope, snapshot/hash the raw fixture before
mount/replay, and validate the independent backend trace. Recovery receives the
original host oracle input, not a newly generated expected result from a guest
store. It checks original IDs/counts, no duplicate effect/approval reuse, active
connection policy/integrity and zero provider calls. Pi, journal, settings and
GUI stores commit separately; no cross-store SQLite transaction is claimed.
Normal owned-device cleanup may flush after recovery, outside the cut path.
Preserve failed results, snapshots and consumed counts; resolve setup/cleanup
faults before another run. The final VM shutdown is a separate bounded scope.
