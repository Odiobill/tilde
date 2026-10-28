# Release and publication

The local source/package mechanism creates a candidate, with `verification_pending`
while required gates are missing, failed or outside the candidate's exact source/
artifact scope. A successful build, CI run, offscreen test or draft is not release
acceptance. Review the final qualification manifest, exact checksums, tested matrix,
accepted owner exceptions, cleanup and third-party license inventory before a
release is called ready. Original failures remain retained separately.

Local preparation uses `scripts/export-source.mjs`, `prepare-arch-build.mjs`,
`qualify-arch.mjs` and the strict final qualification/assembly commands described
in the final build manifest. Use the same source SHA256 for every candidate
artifact. Build/test a clean export without the development checkout. Validate
package installation/run/removal in an approved disposable guest and preserve
user data. Real model, desktop/AT-SPI, calibrated storage-loss and final owner
walkthrough gates keep their actual status; generic CI cannot provide them.

## Future GitHub setup

The owner creates the repository later and copies only the allowlisted public
source. This task does not initialize Git, create a repository/PR/tag/release,
push files or activate Pages. Choose the repository/default branch and access
settings explicitly; adapt the CI push branch if it is not `main`. Review
workflow source and token permissions before enabling it.

Workflow files use canonical JSON, a YAML subset, for dependency-free structural
validation. `node scripts/check-workflows.mjs` checks events, verified action
commit pins, permissions, native dependencies and local command references.
Action provenance is recorded in `packaging/release/actions.json`; update pins
only after verifying official upstream tag and commit objects. A maintained
workflow validator such as actionlint supplies a separate syntax/expression check.
Local validation does not claim remote execution.

`ci.yml` uses GitHub-hosted Ubuntu26.04 with distribution Qt>=6.8 and selected
Node22.19.0/22.x/24.x. Its token is contents-read, checkout credentials are not
persisted, and tests use synthetic providers/private fixtures. Dependencies and
a temporary user manager are prepared only on that ephemeral remote runner.
There is no real-provider helper or private qualification workspace in CI.

`arch.yml` is manual-only (also callable by the manual release workflow) and
requires an owner-provisioned **disposable, isolated Arch x86_64 runner** labelled
`tilde-disposable-arch`, with system Node/Qt/build tools, a functioning user
manager, private fresh state and the documented build dependencies. Never use an
ordinary owner checkout or a runner containing credentials/data. Keep its group
restricted to the reviewed manual/default-branch workflow; PR jobs use hosted
runners. The job installs no host packages. It acquires a locked npm cache in its
own temporary tree, builds/checks/inspects a candidate, and uploads an allowlisted
artifact set. It does not claim actual installed/removal qualification.

`release-draft.yml` requires manual dispatch with exact version0.1.1 and reviewed
source archive SHA256. Identity, complete native CI and Arch build/inspection
must succeed before its separate contents-write draft job. It derives repository
identity from GitHub context, checks same-commit/source/package manifests and
checksums, and requires an existing `v0.1.1` tag resolving to that exact commit.
The command creates only a **draft**, labelled verification pending, with no
automatic publication. Missing local qualification or licenses remain blockers
for readiness/publication; inspect them before changing that draft's status.
No personal access token or private local evidence is embedded in the workflow.

## Documentation site

```sh
node scripts/build-docs.mjs --output /absolute/new-site --base-path /tilde/
```

Use `/` for root hosting or a slash-delimited project path for project hosting.
The build is standalone HTML/CSS, escaped preformatted public-document bodies,
fixed navigation and validated related links. It requires no Markdown parser,
network request, JavaScript framework or hosting activation. It includes only
public guides and the explicitly public M4 testing procedures.

`pages.yml` is manual-only. Build has contents-read permission; only its separate
deploy job has Pages-write/OIDC permission and the `github-pages` environment.
Configure Pages and any environment approval rules as the owner when ready.
The project path comes from repository context. Adjust the base to `/` before
using user/organization root hosting or a custom domain. A local docs build is
not a deployed site or remote-CI pass.

After repository setup, execute the remote workflows on the exact intended
commit, inspect their real logs/artifact checksums and complete required local/
owner qualification. Remote CI and GitHub publication are later prerequisites,
separate from local candidate preparation. Keep source/build/notice manifests
with the resulting artifacts and record any support/qualification limitations.
