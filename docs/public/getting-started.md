# Your first conversation

Choose the [Arch installation](installation.md) or [source build](source-build.md)
path. The first release uses system Node and Qt; it does not bundle a model.

With Tilde installed, start the background daemon and open the native window:

```sh
systemctl --user daemon-reload
systemctl --user start tilde-agentd.service
tilde-gui
```

Open Settings and follow [model and credential setup](configuration.md). Choose
your provider or an existing compatible local endpoint and set a narrow example
filesystem root. Provider charges and data handling depend on that choice.

Start with a harmless sample project file and ask Tilde to explain it. Review
any exact shell action before approving it. Closing the window leaves a running
daemon separate from the interface; background login startup is optional.

Read the [known limitations](limitations.md), [security boundaries](security.md)
and [troubleshooting guide](troubleshooting.md) before granting broader authority.
