# Tilde 0.1.1 — early preview

A native Linux assistant with a Qt/QML window and separate durable user daemon.
Use it to ask questions, investigate files and review exact shell actions under
your ordinary account. Bring your own supported provider or compatible existing
local endpoint; there is no bundled model/runtime or automatic login startup.

This corrected first preview fixes credential-lock cleanup on ext4. Tilde pins
the held directory until release, preventing inode reuse from making another
writer's replacement lock look owned. Compromised writes remain refused. The
unpublished v0.1.0 candidate and its original qualification are retained privately.

## Download and source

The qualified binary is `tilde-assistant-0.1.1-1-x86_64.pkg.tar.zst`, SHA256:

~~~text
81305e4ed059e2533bb1e90e05c14ce823b489aeb9d00333237be27f4fce42b4
~~~

It needs Arch Linux x86_64, system Node >=22.19.0 and Qt >=6.12.0.
[Source](https://github.com/Odiobill/tilde/tree/db9ef522d4c7385b6c249fb694d61a9bf4d507ef)
is tag v0.1.1 at that exact commit. GitHub provides source ZIP/tar downloads;
no separate source archive is uploaded. Fresh source builds can use Qt >=6.8.

## Work that stays

Conversations, drafts, pending decisions and task state are retained. Closing
the GUI leaves a running daemon independent. Restart recovery reconciles state
and pauses uncertain effects rather than blindly repeating them. There is one
globally unsettled run and no automatic provider retry. Cancellation is not rollback.

Local qualification completed with **16 passes and five accepted exceptions**.
Storage-loss evidence used a calibrated flush-aware guest RAM-cache model, not
every physical hardware/filesystem failure. The real local-model trial, Plasma
Wayland/X11, actual native assistive technology and remaining installed owner
walkthrough remain deferred. The historical Qt 6.8.2 Plasma focus failure is
unresolved; owner feedback covered visual/Settings review only.

The local qualification snapshot retains its historical scope; the separate
publication manifest records later remote CI, Git/tag and release bindings.
CI rebuild candidates do not replace this exact tested binary.

Read [getting started](https://odiobill.github.io/tilde/guide/getting-started.html), [qualification](https://odiobill.github.io/tilde/guide/qualification.html),
[limitations](https://odiobill.github.io/tilde/guide/limitations.html), [security](https://odiobill.github.io/tilde/guide/security.html) and [releasing](https://odiobill.github.io/tilde/guide/releasing.html).
No privileged adapter, Computer Use, production CodeMode, AUR submission,
Debian package, telemetry or automatic updater is included.
