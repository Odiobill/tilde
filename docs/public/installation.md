# Install and run

Choose the [v0.1.1 Arch x86_64 package](https://github.com/Odiobill/tilde/releases/tag/v0.1.1)
or [build from GitHub source](source-build.md). Follow the
[first-conversation guide](getting-started.md) after installation.

## Install the Arch package

Download `tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst` from the release.
Compare its SHA256 before installing:

~~~sh
sha256sum tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst
~~~

Expected:

~~~text
81305e4ed059e2533bb1e90e05c14ce823b489aeb9d00333237be27f4fce42b4
~~~

Explicitly install that verified file:

~~~sh
sudo pacman -U ./tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst
~~~

The binary requires system Node >=22.19.0 and Qt Base/Declarative >=6.12.0,
plus its declared Arch dependencies. A fresh source build can use Qt >=6.8.
A functioning systemd user manager and private `XDG_RUNTIME_DIR` are required.
Read [qualification](qualification.md) and [limitations](limitations.md).

## Start Tilde

The package recipe also supports explicit local rebuilds.
A locally supplied source archive must match its SHA256. The first release has
no AUR/official-repository submission or Debian package. Supply system Node and
Qt; runtime dependencies and exact tested versions belong in the artifact's
qualification manifest. Rebuild native addons when required by a runtime upgrade.

With a complete installation in place, start the daemon explicitly:

```sh
systemctl --user daemon-reload
systemctl --user start tilde-agentd.service
tilde-gui
```

Persistent startup is optional and separate:

```sh
systemctl --user enable tilde-agentd.service
systemctl --user disable tilde-agentd.service
```

Opening the desktop launcher starts/focuses the GUI. If the daemon is absent, the
window reconnects and shows connection guidance; it does not start or enable a
service. Opening Settings, activating a window or clicking a notification never
submits, approves or reruns work. Configure a desktop shortcut to `tilde-gui` if
wanted. On Hyprland, use the session's normal launch route (for example
`uwsm app -- tilde-gui`) and a narrow Tilde window rule; no shortcut is installed
automatically and compositor focus restrictions remain in force.

Before upgrading or removing, settle or explicitly cancel owned work and inspect
unknown outcomes. Stop the daemon explicitly:

```sh
systemctl --user stop tilde-agentd.service
```

Package removal removes owned application files, not HOME/XDG state or credentials.
After stopping the daemon, remove the Arch package explicitly with:

~~~sh
sudo pacman -R tilde-assistant
~~~

For a source staging tree, `scripts/uninstall-staged.mjs --destdir <stage>
--manifest <stage>/usr/lib/tilde/install-manifest.json` removes unchanged owned
files and preserves modified files, changed directory modes and unrelated data.
Use the matching manifest/prefix. Never use a recursive deletion of state as an
uninstall shortcut. An upgrade does not replay an ambiguous external effect.

## Local Arch package build

The package name is `tilde-assistant`; the executables are `tilde-agentd` and
`tilde-gui`. The source `packaging/arch/PKGBUILD` is a template. Prepare a local
recipe beside an exact, verified source archive so no archive contains its own
checksum and no nonexistent GitHub URL or SKIP checksum is used:

```sh
node scripts/prepare-arch-build.mjs --source /absolute/tilde-0.1.1.tar.gz --sha256 <actual-sha256> --output /absolute/new-build --npm-cache /absolute/prepared-cache
node scripts/qualify-arch.mjs --build-root /absolute/new-build --evidence /absolute/new-evidence
```

Prepare the locked npm cache explicitly as described in the source-build guide.
Only its content-addressed cache is transferred. `prepare()` uses `npm ci
--ignore-scripts --offline`; build/check/package do not acquire dependencies.
Run makepkg as an ordinary user. The helper never invokes host pacman/sudo,
`--syncdeps`, `--install` or service enablement. Missing dependencies are failures,
not permission to install them on the host.

The generated recipe binds the source SHA256 and actual selected Qt version.
A binary linked against Qt 6.12 requires its Qt 6.12 symbol version even though a
fresh source build can target Qt >=6.8. System Node's minimum is >=22.19.0;
actual native artifacts still need qualification for the runtime they claim.
Rebuild after a runtime change if its native ABI/capabilities are not qualified.
No bundled runtime or automatic runtime fallback is provided.

A build on an existing development host produces a candidate only. Clean Arch
environment and actual guest install/run/remove are distinct required checks.
Until a concrete disposable-guest scope is approved and run, the qualifier reports
those rows not_run and returns a blocking status. Original failures remain retained.
Installation in a disposable Arch guest is an explicit operation (`pacman -U`),
and removal is explicit (`pacman -R tilde-assistant`); neither command is run by
these host helpers. Settle/stop work first and retain private user data/credentials.
