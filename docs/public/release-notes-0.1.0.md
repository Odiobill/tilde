# Tilde 0.1.0 — early preview

A native Linux assistant with a Qt/QML window and separate durable user daemon.
Use it to ask questions, investigate files and review exact shell actions under
your ordinary account. Bring your own supported provider or compatible existing
local endpoint; there is no bundled model/runtime or automatic login startup.

## Download and source

The qualified binary is `tilde-assistant-0.1.0-1-x86_64.pkg.tar.zst`, SHA256:

~~~text
cc6d513bea8f2f11ed11c23c776737dab8c1fd34d73fd1e2160c11532381f9ba
~~~

It needs Arch Linux x86_64, system Node >=22.19.0 and Qt >=6.12.0.
[Source](https://github.com/Odiobill/tilde/tree/103bfd089d70283fa7cb43d5d8bb1f6e110e98cb)
is tag v0.1.0 at that exact commit. GitHub provides source ZIP/tar downloads;
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
