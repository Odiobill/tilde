# Your first conversation

Choose the [Arch package](installation.md) or [GitHub source build](source-build.md).
Check the [release requirements and qualification scope](qualification.md)
before installing. Tilde does not bundle a model.

## Start the daemon and open Tilde

For an Arch package installation:

~~~sh
systemctl --user daemon-reload
systemctl --user start tilde-agentd.service
tilde-gui
~~~

Opening the GUI alone does not start or enable the daemon. Background startup
at login is [optional](installation.md).
For a source checkout, use [the two-terminal source run](source-build.md#run-from-the-checkout)
instead; its unstaged build does not install a systemd unit.

## Connect your model

Open Settings and follow [model and credential setup](configuration.md). Choose
a supported provider or an existing compatible local endpoint. Check the selected
endpoint, model, credentials, charges and data handling before sending.
Saving a connection does not make a model request. The real local-model trial
remains [deferred](qualification.md).

## Ask a first question

Paste a harmless sample configuration or error message and ask Tilde to explain
it. Sending uses your configured model. Do not paste secrets.

For typed file access, configure a narrow sample directory using
[filesystem roots](configuration.md#filesystem-roots). This is currently a
configuration-file step, not a GUI root picker. Then ask about a harmless sample
file in that directory. Exact shell actions require review before approval;
typed roots do not sandbox an unrestricted shell.

## Keep your place

Closing the window leaves a running daemon separate from the interface.
Restart recovery reconciles retained state and pauses uncertain effects instead
of blindly running them twice. Retained state is not a guarantee against every
hardware failure. See [what we tested](qualification.md).

Follow the [stop/removal instructions](installation.md) before upgrading or
uninstalling. Package removal preserves user state and credentials. For help,
start with [troubleshooting](troubleshooting.md) and [security](security.md).
