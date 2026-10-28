# Build from source

Build prerequisites: Linux, system Node >=22.19.0, npm supporting lockfile v3,
matching public Node and libuv headers, CMake >=3.24, C++17 compiler, and Qt >=6.8
Core, Gui, Qml, Quick, QuickControls2, Network, Widgets, DBus and Test development
modules. Qt stays dynamically linked. Use a supported patched Node release for
daily use; the exact old floor is a compatibility-test lane.

The development selection is `.node-version`. Set `TILDE_NODE` to an absolute
executable for another selection. `TILDE_NODE_INCLUDE_DIR` and
`TILDE_UV_INCLUDE_DIR` select absolute header directories when discovery cannot
find an exact match. `TILDE_CMAKE` selects a suitable CMake installation; otherwise
use PATH's CMake and its matching CTest. No header download or shell-profile
change happens automatically. Native addons call libuv directly; rebuild and
requalify after runtime changes rather than assuming Node-API proves every ABI.

Initial dependency acquisition uses the registry and the unchanged lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm test
npm run test:release
ctest --test-dir .build/cmake --output-on-failure
```

A subsequent `npm ci --offline --ignore-scripts` requires a complete prepared npm
cache. An unprepared build is not fully offline. Do not use ambient global npm
packages as a substitute for the locked closure.

Tests use synthetic providers and owned private state. Integration tests need a
functioning systemd user manager and D-Bus. Installed isolation tests additionally
need bubblewrap with unprivileged user/network namespaces, desktop-file-utils,
coreutils and systemd-analyze. The private tray test needs a Qt platform theme
with status-notifier support. The private-bus CTest fixture explicitly selects
qt6ct, which must be installed as a test prerequisite; it does not change the
user desktop theme. Install at least one scalable font (for example DejaVu) so
large-text geometry tests exercise actual glyph metrics. Preserve selected
desktop/theme metadata while excluding provider credentials. Offscreen tests are separate from actual desktop,
screen-reader and storage-loss qualification.

Stage a complete installation without writing the host prefix:

```sh
node scripts/stage-install.mjs --destdir /absolute/private/stage --prefix /usr --node /usr/bin/node
```

Choose DESTDIR and final prefix independently. Launch files use final paths;
DESTDIR is packaging infrastructure. The shared manifest covers compiled
workspace JS, production npm dependencies, both native addons, GUI, notification
helper, service, desktop entry, icon and notices. CMake's Runtime install component
covers native targets; use the stage script for the complete application closure.
No stage/install hook enables a service, modifies hotkeys or requests inference.
