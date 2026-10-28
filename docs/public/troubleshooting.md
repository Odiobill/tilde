# Troubleshooting

If the GUI is reconnecting, check `systemctl --user status tilde-agentd.service`
and explicitly start the daemon if appropriate. Verify XDG runtime/state ownership
and permissions. Do not fix an unsafe storage error by making private data public
or deleting an unknown journal. Keep credential contents out of logs and reports.

A Node/header mismatch requires selecting matching public headers and rebuilding.
Missing SQLite/Chord APIs or native load failures require an appropriate system
runtime and fresh qualification; no silent runtime fallback or header download
occurs. Use CMake >=3.24 and Qt >=6.8 with the required QML/platform plugins.

A hard kill during credential IO can leave a 30-second stale-lock lease. Tilde
reports the store busy and keeps interrupted work gated. Wait until the store is
available, inspect the original run and use explicit Resume once when offered;
changing credentials or reopening the GUI is not a resume grant. Do not delete a
lease while another cooperating writer may own it.

Tray/notification availability depends on the desktop's public Qt backend and
services. Missing services have visible fallback behavior. A notification attempt
is not guaranteed display or exactly-once delivery. Wayland may refuse automated
focus; do not disable compositor protections to manufacture a test pass.

For a bug report, provide version, runtime/Qt versions, session/backend, safe
error code, steps using synthetic content and artifact checksum. Do not include
credential stores, private transcripts, full environment dumps or unredacted
journals. [Security scope](security.md) explains the shell and data boundaries.
