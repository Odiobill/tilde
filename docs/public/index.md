# Tilde documentation

Start with [your first conversation](getting-started.md) and [what we tested](qualification.md).

Tilde is an ordinary native Linux chat window backed by a separate user daemon.
Closing the window leaves daemon work alive. Repeated launch opens or focuses the
same window; compositor policy determines actual focus and placement.

- [Install, start and remove](installation.md)
- [Build and stage from source](source-build.md)
- [Providers, credentials and settings](configuration.md)
- [Limitations and qualification scope](limitations.md)
- [Troubleshooting](troubleshooting.md)
- [Security and data](security.md)
- [Contributing](contributing.md)
- [Releasing and documentation hosting](releasing.md)
- [0.1.1 candidate notes](release-notes-0.1.1.md)

The first release targets x86_64 with an Arch package mechanism and a source
archive. There is no Debian package, bundled Node/Qt, auto-updater or default
service enablement. GitHub hosting, remote CI and publication are later steps.
