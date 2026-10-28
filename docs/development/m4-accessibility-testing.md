# Accessibility and motion qualification

Build with `npm run build`. `ctest --test-dir .build/cmake --output-on-failure
-R gui_accessibility` uses synthetic peers, offscreen rendering and private
D-Bus. It checks labelled primary fields, password privacy, keyboard traversal
without work, complete canonical action pages, contrast tokens, enlarged text,
minimum geometry and local motion persistence/safety. Existing approval tests
still enforce complete verified review and explicit one-shot decisions.

`node scripts/qualify-accessibility.mjs --evidence NEW_PRIVATE_RUN` runs that
fixture at actual device pixel ratios 1/1.5/2, with both themes and 15/30px
application fonts in a 520x400 logical window. It saves screenshots and actual
Qt/backend/DPR facts. Inspect the images; a passing geometry assertion alone
does not prove a usable layout. The runner deliberately exits1 while the
required real reader/installed-keyboard gate is unrun. It never installs or
starts a screen reader or changes a desktop automatically.

The GUI respects an enlarged application font. Heading sizes derive from that
base, ordinary/muted text tokens meet 4.5:1 and essential border tokens meet 3:1
against both themes' surfaces. Keyboard focus uses the contrasting highlight.
The Settings heading row scrolls horizontally, including when Tab focuses an
offscreen heading, leaving the form usable at minimum size. Long form button
and checkbox labels wrap within the viewport; explicit field focus cancels a
deferred initial section jump. Tab leaves the
composer; Enter/IME/Shift-Enter/send/cancel authority is unchanged.

## Local motion preference

Appearance's Reduce motion is saved immediately, independently from the color
theme/Desktop Apply draft and all provider/auth/model drafts. The local
`ui-accessibility.json` beside the private GUI outbox contains only:

```json
{"version":1,"reducedMotion":true}
```

Missing state means false. The GUI requires same-UID mode0700 parent and
mode0600 regular single-link state, refuses symlinks/unsafe ancestors, serializes
cooperating writers and compares accepted bytes before atomic fsynced replacement.
Corrupt/unknown/unsafe/conflicted state is reported and left untouched; there is
no automatic repair. Deliberate repair needs closing/reopening the GUI after
the owner inspects the file. No wire-v4 or daemon `ui.toml` schema changed.

Reduced motion removes application-authored drawer/dialog transition durations
and inertial flings while preserving direct scrolling, progress/status text and
all controls. It uses an explicit local preference, not an assumed system API.
Partial response bodies are kept out of the accessible tree until completion;
the Responding status and Cancel remain available. There are no application
announcements for each streamed token or hidden reasoning.

Qt intentionally suppresses a password field's accessible Name while its
password state is set. Preserve that state and masked Value. The field therefore
also has a visible non-secret label and labelled Description, neither containing
the entered value. This behavior was checked against the actual Qt6.12 build and
[Qt's password-name guard](https://github.com/qt/qtdeclarative/blob/6.12/src/quick/items/qquickaccessibleattached_p.h).
The native regression checks the label/Description/password state and absence
of the synthetic secret from every exposed string; it never clears password
state merely to obtain a Name.

Complete-action and retained-source lists expose named read-only pages. Home/End
and Up/Down select pages, and Tab enters their text. The exact-review test reads
all accessible page values and reconstructs the verified canonical payload,
including its final bytes, without approving/submitting anything. Navigation,
labels and accessibility actions do not bypass the existing broker or decision
checks.

## Required real installed walkthrough

Offscreen assertions and QAccessible/AT-SPI tree dumps are preparatory evidence.
They cannot pass `accessibility.real`. First obtain a concrete session/assistive-
technology setup scope; there is no host package-install grant. A disposable
guest may be used after its separate boot/desktop/reader scope is approved.
Use the actual candidate installed package, a new private HOME/XDG/auth store,
synthetic credentials and a bounded loopback canned provider. Never use existing
accounts/stores, refresh a real catalog or send real inference. Record exact
package/source hashes, Qt/platform/session, AT-SPI transport, reader name/version
and actual operator observations with raw logs and cleanup.

The operator must exercise each of these at100/150/200%, including 520x400 and
enlarged text:

1. History filtering, selection, rename and keyboard traversal with visible focus.
2. Compose/send against only the synthetic provider, then cancel a held synthetic
   stream. Focus/navigation alone must not submit or rerun anything.
3. Settings sections and local motion, keeping chat/provider drafts and complete
   labels usable. Confirm nonessential transitions stop and progress remains.
4. Synthetic auth/password entry, clearing/cancellation and privacy: the reader
   identifies the field without speaking its secret value.
5. Full verified exact action, including risk/deadline/final bytes. Use a pending
   synthetic proposal and Deny/Close; no shell execution or automatic approval.
6. Complete retained source, page navigation/copy and return to conversation.
   Do not treat a truncated preview as the complete action or source.

Keep real reader behavior and operator observations separate from the synthetic
format validator in `tests/integration/src/m4-accessibility.ts`. That validator
checks record completeness only. If any flow is missing, a secret is spoken,
work happens automatically or cleanup fails, retain the failing/unrun result.
A missing real-reader or final-installed keyboard run remains a release blocker
unless the owner accepts its exact scoped exception. The separate final owner
installed-build acceptance is still Task12.
