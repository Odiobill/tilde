# Desktop qualification

Build with `npm run build` and run report checks with
`node --test tests/release/desktop-report.test.mjs`. The normal CTest window,
tray and notification cases use offscreen rendering/private D-Bus and synthetic
peers. They do not establish compositor focus or a real desktop support claim.

`scripts/qualify-desktops.mjs --session SESSION --evidence NEW_PRIVATE_RUN`
reads only the current logind session. Supported IDs are `hyprland-wayland`,
`plasma-wayland` and `plasma-x11`. Without an explicit scope file it never opens
a test window; it records required `not_run` for an available matching session,
or `unavailable` for an absent/mismatching session. No login/logout, session
provisioning, package installation or compositor reconfiguration is automatic.

Logind session type/desktop/UID/remote status and the actual native fixture's Qt
backend must agree. In particular, xcb/Xwayland inside a Wayland login is not an
independent Plasma X11 result. The native test emits separate activation-ACK,
exposed-window, active-focus, draft and geometry facts. ACK/visibility alone
cannot produce a focus pass. A missing fact, failing native command or failed
owned-process cleanup blocks the gate. The original focus assertions remain.

## Concrete operator scope

After owner approval for the selected existing session, create a same-UID
mode-0600 scope file in a same-UID mode-0700 directory, with no symlink ancestors.
Do not create an approved file from this documentation alone. The fields are:

```json
{
  "version": 1,
  "ownerApproved": false,
  "session": "hyprland-wayland",
  "sessionId": "REPLACE_CURRENT_APPROVED_LOGIND_ID",
  "evidence": "/absolute/private/NEW_RUN",
  "expiresAt": "REPLACE_APPROVED_UTC_EXPIRY",
  "maxDurationMs": 180000,
  "allowCompositorChanges": false
}
```

This example deliberately refuses. With an actual matching fresh approval,
append `--approval-file /absolute/private/scope.json` to the qualifier command.
It durably consumes the scope before running owned fixture process groups with
a three-minute total test budget. It uses private HOME/XDG state, a fixed actual
Qt backend and the selected existing display socket. No provider variables are
inherited. The bounded windows may briefly take focus/show a temporary tray menu.
Existing windows/sessions/services are left running. The historical optional
Hyprland floating dispatcher is not enabled by this runner.

The selected native cases check repeat activation and minimized/maximized/full-
screen restoration, draft/size retention, Settings/auth-close behavior, ordinary
close, tray Settings/show/quit authority, missing/lost tray fallback and private
notification activation/protocol behavior. They submit/approve no work. The
temporary real tray-host capture records availability separately; private D-Bus
notification protocol tests do not claim an operator saw a desktop notification.
Keep raw logs, command statuses, host capture and actual backend/version facts.

## Historical focus failure

M0's Qt 6.8.2 Plasma Wayland `activationPreservesMaximizedState` failed after
maximized/minimized restoration. Its original diagnostic, lifecycle/status
records and disposition remain private retained history. Real-input restoration
and the historical independent X11 checks passed only in their recorded scope.
Neither that planning disposition nor a newer Qt/offscreen/Hyprland pass resolves
the old failure. Reproduce on the actual affected Qt/session when available,
then diagnose exposure, activation token, minimize/forwarding lifecycle before
changing product code. If compositor policy remains the limit, record a precise
owner-reviewed support/test disposition. Never remove the focus assertion or
relabel missing session evidence passed.
