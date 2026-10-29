# Build from source

## Get the released source from GitHub

~~~sh
git clone --branch v0.1.1 --single-branch https://github.com/Odiobill/tilde.git
cd tilde
git rev-parse HEAD
~~~

The expected commit is `db9ef522d4c7385b6c249fb694d61a9bf4d507ef`.
Main contains later website/documentation work; use the release tag for the
qualified application source. GitHub's built-in ZIP/tar downloads are also
available at that tag or commit. No extra source archive is uploaded as a release
asset. Generated compression bytes are not a stable source checksum; the release's
source identity record describes the checked file contents and executable modes.

## Prerequisites and build

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

## Run from the checkout

After the build, stop any other Tilde daemon using the same user state. In one
terminal, run:

~~~sh
npm run start:daemon
~~~

In a second terminal in the same checkout:

~~~sh
npm run start:gui
~~~

Use the normal logged-in Linux session with its private runtime directory. Leave
the daemon terminal open; closing the GUI is separate from stopping the daemon.
Use Ctrl-C in the daemon terminal to stop it. The systemd commands in the package
guide apply to a complete installed layout, not an unstaged checkout.

Follow [your first conversation](getting-started.md) for model and authority setup.
The stage below prepares the full installed layout and desktop integration for
packaging; it does not install or enable them on your host.

## Offline rebuilds and staging

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
