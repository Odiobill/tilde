# Security and data

Use [GitHub private vulnerability reporting](https://github.com/Odiobill/tilde/security/advisories/new)
for suspected vulnerabilities. If unavailable, ask for a private contact in an
issue without disclosing sensitive details. Never post keys, credential files
or private transcripts publicly. No response-time commitment is implied.

Tilde runs under the ordinary user account. Typed tools have explicit roots and
policy/journal checks. An approved unrestricted shell has that account's file,
network, credential, journal and same-user-service authority. Typed roots do not
sandbox it. Known-key redaction cannot prevent exfiltration or guarantee journal
integrity after such a grant. There is no root helper or privileged adapter.

Approval binds a complete concrete operation/fingerprint and is consumed once.
Denied, cancelled, stale or corrupt decisions must never dispatch an effect.
Notifications, window activation, accessibility navigation and changing preferences
provide no execution authority. Outcomes that cannot be reconciled stay unknown.

The local socket is private, not a remote listener. State uses private HOME/XDG
paths and SQLite with the documented local-storage assumptions. OS account
controls and disk encryption remain relevant. Retention is not secure erasure.
Stop/settle work before taking a consistent backup of application databases,
drafts/outbox, settings and any separately chosen credential store; those stores
do not form one SQLite transaction. Package removal preserves them.

Use synthetic credentials and private state for tests. Network-disabled fixtures
are distinct from real provider qualification. Report only safe metadata if an
unexpected secret is discovered; do not paste it into an issue, source tree or log.
