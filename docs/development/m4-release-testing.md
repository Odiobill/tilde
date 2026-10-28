# Final source, required gates and candidate assembly

`packaging/release/required-gates.json` declares all21mandatory local gates.
The evaluator independently keeps the canonical IDs and environment/package
requirements, so an input cannot drop a row or downgrade `required`. Runtime
lanes, clean source, installed Arch, local provider, three desktop sessions,
real accessibility, performance, process/storage recovery, security, licenses,
export/docs/workflows, the single final review and final owner acceptance all
retain their actual result. GitHub remote CI is a later publication prerequisite;
it is never reported as locally executed or used to invent operator evidence.

Build/test a new allowlisted source export using fresh dependencies and private
state. The runtime matrix rebuilds native transport/filesystem addons for each
exact selected Node/header pair and runs build/typecheck, full product/release,
Python and CTest commands. Retain exact Node/Qt/libuv/toolchain, source and artifact
hashes. Source output/cache/build files stay outside the public input set.

A private candidate scope contains actual `sourceSha256` (source archive bytes)
and `packageSha256` (the exact Arch package). Prepare a new private mode0700
reports directory with mode0600 JSON reports and copied relative evidence files.
Each canonical row has its unchanged observed status/exit/cleanup, human-readable
environment, evidence paths/digests and a `scope` containing the current source
hash and canonical environment key. Artifact-dependent rows additionally bind
the exact package hash. Reusing an earlier observation requires explicit proof
that its source/toolchain/subject scope still matches; a new scope label alone is
not new execution. Keep original raw reports and any failed/stale observations.

```sh
node scripts/qualify-release.mjs --manifest packaging/release/required-gates.json --reports /absolute/private/reports --exceptions /absolute/private/exceptions --scope /absolute/private/scope.json --output /absolute/private/qualification.json
```

The command validates actual evidence bytes, refuses unsafe paths/symlinks and
malformed/corrupt/duplicate inputs, and fails closed for missing rows, scope
substitution or failed cleanup. It returns1 while blocked. An accepted exception
needs the actual owner's statement/time, exact ID/environment, observed status,
precise scope and matching source/package identity. A stale or unrelated
exception supplies no authority. Raw not_run/fail results remain in the input;
the derived outcome records the owner disposition separately. No synthetic or
property-tree success can satisfy an unrun real-operator requirement.

```sh
node scripts/assemble-release.mjs --source /absolute/final-export --package /absolute/tilde-assistant-0.1.0-1-x86_64.pkg.tar.zst --qualification /absolute/private/qualification.json --output /absolute/new-artifacts
```

Assembly pins copies of the actual input bytes, audits bounded archive paths,
links, membership and compression tails before extraction, validates the source
manifest, inspects the actual package/ELF/layout, and compares packaged notices
with the exact source. It recomputes the required-gate result rather than trusting
a changed ready flag. Inventory unresolved items cannot become a passing license
claim. Only the source/package, license/notices/inventory, candidate notes,
public qualification summary, build manifest and checksums are emitted.
Raw private logs, exception statements, host paths and qualification inputs are
not copied to public artifacts. Candidate assembly while blocked is allowed;
its manifest explicitly says `verification_pending`.

The original single final review, verified finding reproductions/fixes and exact
final owner installed-build acceptance are separate evidence. Regenerate/requalify
changed artifacts after fixes. Do not initialize a repository or publish anything
as a side effect of these local commands. See the public [release procedure](../public/releasing.md)
for later owner-controlled repository, draft workflow and Pages setup.

The package build metadata must identify the exact rendered Arch recipe from the source archive, with that archive SHA256 and its declared Qt version. Assembly retains this recipe digest; a different source or recipe blocks assembly.
