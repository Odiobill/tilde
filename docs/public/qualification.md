# What we tested

Tilde 0.1.0 is an early preview. Local qualification completed on 2026-10-28:
**16 passing gates and five owner-accepted exceptions**. Remote CI and publication
have their own later evidence; they do not replace the product checks.

## Exact application

The [v0.1.0 source](https://github.com/Odiobill/tilde/tree/v0.1.0) is bound to commit
`103bfd089d70283fa7cb43d5d8bb1f6e110e98cb`. Website and guide work comes in later
commits; it does not change which binary was qualified.

The package is `tilde-assistant-0.1.0-1-x86_64.pkg.tar.zst`, SHA256:

~~~text
cc6d513bea8f2f11ed11c23c776737dab8c1fd34d73fd1e2160c11532381f9ba
~~~

Release assets include source-file identity, local qualification, publication
evidence, licenses and checksums. Source comes from GitHub's repository/tag and
built-in archives; no extra source archive is uploaded. Generated compression
bytes can differ while file contents remain the same. Publication verifies the
complete file inventory and Git executable modes against the qualified source.

## Passing local gates

- Node 22.19.0 floor, latest qualified 22.x, latest qualified 24.x and reference
  Arch system Node.
- Clean-source build/test and actual Arch install, isolated run, removal and
  preservation of synthetic user state.
- Hyprland Wayland activation/window checks and reference native performance.
- Process-crash recovery and calibrated guest storage-loss cases.
- Security regressions, shipped licensing, public export, local docs/workflow
  validation and final M4 review.

These are scoped observations, not promises for every desktop or future runtime.

## Work across interruptions

Closing the GUI leaves a running daemon independent of the window. After a
restart, Tilde reconciles retained state. Pending approvals stay pending;
uncertain non-idempotent effects pause for inspection rather than being blindly
replayed. Conversations, drafts and acknowledged task state have durability checks.

Storage-loss qualification used a disposable guest and an independently calibrated,
flush-aware volatile RAM-cache model. Nine bounded control/product cases support
the tested persistence behavior. This is **not** certification against every
physical power failure, controller, disk, kernel or filesystem. Process-kill tests
alone do not establish that claim. Read the
[storage-loss procedure](../development/m4-power-testing.md).

## Explicitly deferred checks

| Check | Actual observation | Current disposition |
| --- | --- | --- |
| Real local-model trial | Not run; no local server/model available | Deferred; synthetic coverage does not prove every local model works |
| Plasma Wayland | Unavailable for this candidate | Deferred; historical Qt 6.8.2 focus failure remains unresolved |
| Plasma X11 | Unavailable | Deferred; no compatibility pass |
| Real native assistive technology | Not run | Deferred; automated accessibility tests are separate |
| Remaining installed owner walkthrough | Not run | Deferred; owner feedback covered visual/Settings review only |

These exceptions were accepted for this release. They are not passing results.
Read [limitations](limitations.md), [security](security.md),
[desktop testing](../development/m4-desktop-testing.md) and
[accessibility testing](../development/m4-accessibility-testing.md).
