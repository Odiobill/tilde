# Configuration

Run the daemon and GUI separately. A private absolute `XDG_RUNTIME_DIR` and a
functioning systemd user manager are required. Settings selects the provider,
model and credential file. Authentication/setup is separate from sending a model
request, and the Pi CLI is not required.

The default credential file is `~/.pi/agent/auth.json`, shared read/write with
cooperating Pi clients. Choose a separate absolute auth file for isolation.
Switching files does not copy credentials. Keep these files private and back them
up deliberately; never put real keys or account state into source archives.

The provider catalog supports the pinned SDK's advertised API-key, browser and
profile methods. Availability is provider-specific. Unsupported login methods
are refused before taking a setup lease. Catalog refresh and model requests may
use the network only when explicitly requested by the user.

For an existing OpenAI-compatible local server, add a custom connection, its
exact endpoint and model metadata. Use No credentials only when the selected
server permits it; keyless inference still executes a real model request. Tilde
does not install a server, download models, open a LAN listener or fall back to a
hosted provider. Local tool-call reliability needs separate qualification; a
chat-only reply does not prove tool support.

The development qualification helper requires a fresh explicit grant for an
exact existing loopback endpoint/model and new private state. It enforces
single-use request/tool limits and rejects redirects; its synthetic tests do
not establish real local-model compatibility. See
[local qualification](../development/m4-local-testing.md) for the bounded
chat/tool scopes and operator procedure.

## Filesystem roots

Typed filesystem roots are configured in `tools.toml` beside the daemon's
`config.toml`: normally `~/.config/tilde/tools.toml`, or the `tilde` directory
under your chosen `XDG_CONFIG_HOME`. There is currently no GUI root picker.
With no file, roots are empty. Stop the daemon before editing, retain any existing
policy deliberately, and use a private file with mode `0600`:

~~~toml
version = 1
roots = ["/absolute/path/to/your/tilde-example"]
retentionDays = 7
~~~

Replace the example with a real absolute directory owned by your account, with
no group/other write permission. Do not choose your whole home, application
state/configuration, credential stores or system root. Symlinks and unsafe
ownership/modes are rejected. Restart the daemon after saving. This grants typed
tool access; it does not sandbox an unrestricted shell.

Each shell action needs complete
exact one-shot review; ordinary shell authority is broad. Limits apply to new
admissions; changing a default is not approval of a paused or pending operation.
Notification and tray preferences are opt-in as shown in Settings. Closing the
GUI does not stop daemon work.

Appearance includes Reduce motion, saved immediately for the GUI. It preserves
chat and provider drafts and is independent from the color theme/Desktop Apply
action. Enlarged application text and keyboard navigation are supported; the
complete action and retained-source views remain read-only until you explicitly
choose an action. A private motion-preference error is reported without silently
overwriting the saved file.
