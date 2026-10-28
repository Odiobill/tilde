# Tilde 0.1.1 candidate notes

This patch keeps a credential-lock directory open until lock release, preventing
immediate ext4 inode reuse from causing cleanup to remove another writer's
replacement lock. Credential writes still refuse a compromised lock. Regression
coverage includes replacement identity, handle cleanup and heartbeat timestamp
quantization. The unpublished 0.1.0 candidate is retained privately as historical
qualification evidence; it is not the package offered for this corrected release.

This is the first x86_64 Linux source/Arch candidate mechanism. Read the artifact's
qualification/build manifest for its actual readiness and tested versions.
`verification_pending` means required evidence is missing, failed or not bound
to that exact source/artifact. These notes never override that status.

The native Qt/QML chat window connects to a separate user daemon. System
Node>=22.19.0 and dynamically linked Qt>=6.8 are required; a binary's actual Qt
symbol floor may be newer. No Node/Qt runtime, Debian package, AUR submission,
auto-updater, telemetry or default autostart is included.

Settings support explicit providers/model selection, separate credential storage,
work limits, appearance and desktop preferences. OpenAI-compatible local
connections use exact endpoint/model/API settings; saving or opening them never
probes a server or starts inference. Reduce motion is a GUI-local immediate
preference. Enlarged text, named keyboard controls and full canonical review/
source pages have synthetic regression coverage; actual assistive-technology
acceptance and the remaining installed manual walkthrough are deferred by the
owner for this candidate, together with Plasma Wayland/X11 qualification. The
historical Qt 6.8.2 Plasma focus failure remains unresolved. These exceptions
retain unrun/failing results; see the exact artifact qualification manifest.

Typed tools retain their policy/journal boundaries. Every shell operation needs
an exact one-shot approval and has ordinary account authority. There is one
globally unsettled run, zero automatic provider retries, no blind effect replay,
and unknown non-idempotent outcomes remain visible. Cancellation is not rollback.

The shared install layout, deterministic allowlisted public source, license
inventory, Arch recipe and checksums bind candidate inputs. Package removal
preserves user state/credentials. GitHub workflows and a local static docs site
are prepared as source; hosting, remote CI and publication happen only through
later owner actions.

See [installation](installation.md), [configuration](configuration.md),
[limitations](limitations.md), [security](security.md) and [releasing](releasing.md)
for operation, qualification scope, storage/desktop limitations and next steps.
Do not treat an earlier runtime/desktop/package result as proof for changed
artifacts. Do not publish while shipped third-party notices/licenses or required
acceptance are unresolved.
