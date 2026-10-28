# Tilde

A native Qt/QML Linux conversation window with a durable TypeScript daemon.
Saved conversations, private drafts, safe Markdown, exact tool review and
optional tray/notifications keep the interface separate from ongoing work.
One unsettled run owns work globally, including approval and budget pauses.

This is the 0.1.1 release-candidate source. Release qualification and publication
are separate steps. No service is started or enabled by a build or staging run.

Requires Linux, system Node >=22.19.0 with matching public Node/libuv build
headers, npm, Qt >=6.8, CMake >=3.24, a C++17 compiler and a systemd user manager.
Node and Qt are supplied by the system. The exact development selection in
`.node-version` is separate from the capability-checked minimum.

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run test:release
ctest --test-dir .build/cmake --output-on-failure
```

See [documentation](docs/public/index.md), [source build](docs/public/source-build.md),
[installation](docs/public/installation.md), [configuration](docs/public/configuration.md),
[limitations](docs/public/limitations.md) and [security](docs/public/security.md).
Original Tilde code uses the [MIT license](LICENSE). Dependency licenses remain
separate; see [third-party notices](THIRD_PARTY_NOTICES.md).
