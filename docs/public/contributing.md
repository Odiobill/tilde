# Contributing

Start with [the repository](https://github.com/Odiobill/tilde),
[existing issues](https://github.com/Odiobill/tilde/issues) and
[qualification scope](qualification.md). Bug reports should include version,
environment and a small synthetic reproduction. Feature requests should explain
the useful outcome. Use the [private security route](security.md) for vulnerabilities.

Read [source build](source-build.md), [security](security.md) and
[limitations](limitations.md). Keep the native Qt/QML frontend, strict wire-v4,
one unsettled run, exact approvals and zero automatic provider retries intact.

Use behavioral tests: reproduce the named failure, implement the smallest fix,
then run build/typecheck, product/release tests and relevant CTest/native checks.
Missing tools, compiler/import mistakes and unavailable sessions are not behavioral
RED or passing release evidence. Preserve original failures with command statuses,
source/artifact identity and cleanup. Do not weaken thresholds after a failure.

Tests use synthetic providers, private state and bounded owned fixtures. Real
inference/authentication, host installs, persistent desktop/service configuration,
guest cuts and publication need their own concrete authorization. Never share
private credential, transcript, VM or qualification state in a public export.

The allowlisted source export is separate from a developer's private checkout.
Add intended new public files to `packaging/release/public-files.json`; build/test
that export without the checkout. Keep third-party notices and actual license texts
with redistributed components. The public default branch is main; the qualified application is bound to the
separate v0.1.0 baseline tag. Website changes do not move that tag.
