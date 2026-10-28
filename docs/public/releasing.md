# Release and publication

The published 0.1.0 binary is tied to its exact qualified package digest and
application source commit. Website and guide commits come later on main.
Read [qualification](qualification.md) and [release notes](release-notes-0.1.0.md)
for the actual scope and five accepted exceptions. A build or CI pass alone
does not establish installed, desktop, assistive-technology or storage-loss acceptance.

## Source distribution

Source is available in [Odiobill/tilde](https://github.com/Odiobill/tilde), at tag
v0.1.0 and its exact commit. GitHub provides ZIP/tar downloads. No separate source
archive is uploaded as a release asset. Publication compares the full file
inventory, Git executable modes and link targets against the qualified source;
generated compression bytes are not treated as stable identity.

Canonical source archives may be generated internally for reproducible build and
qualification checks. They stay outside the public release and current public CI
artifact profile. The original local qualification bundle remains immutable.

## CI and the publication boundary

Native CI uses hosted Ubuntu runners, Node 22.19.0/22.x/24.x, synthetic providers
and private fixtures. Pull requests have read-only authority and no publication
credentials. Current CI uploads explicit JSON source/build evidence, not a
separate source archive or an unqualified candidate binary.

The manual Arch job requires a disposable isolated non-root Arch x86_64 runner.
Register it only for a reviewed trusted ref, remove its credentials/registration
afterward and stop the guest. Never expose that runner to public pull requests
or use an ordinary owner checkout. Its rebuilt package is independent candidate
evidence, not the already installed/storage-qualified binary.

The current release-draft workflow is a **manual read-only verifier** of the
prepared draft. It does not create or publish releases. The historical baseline
contains the earlier verification-pending draft mechanism; that is not the
promotion route for the qualified public binary.

## Prepare and promote an exact release

The maintainer supplies retained raw qualification, exact baseline assets,
source identity, successful live baseline/site/Arch CI and frozen core asset
hashes. These private qualification inputs are not shipped in the repository.
The bounded CLI revalidates them, rather than accepting a hand-written ready flag:

~~~sh
node scripts/publish-release.mjs prepare --inputs /absolute/private-inputs.json --output /absolute/new-public-assets
node scripts/publish-release.mjs draft --assets /absolute/new-public-assets --expected /absolute/new-public-assets.expected.json
~~~

The nine uploaded files are the qualified Arch package, LICENSE, third-party
notices, license inventory, current notes, historical local qualification snapshot,
source-file identity, publication manifest and SHA256SUMS. The checksum file
covers the other eight files exactly once. GitHub's automatic source links are
separate from uploaded assets.

The publication manifest binds the baseline tag/commit, site commit, exact asset
hashes, original local dispositions and successful remote runs. Its hash is
reviewed explicitly. Current notes and core assets are frozen before the site
commit, avoiding a source/site/manifest hash cycle.

After the required review and concrete owner authorization, publication re-reads
the tag, every asset and live CI before changing the exact draft:

~~~sh
node scripts/publish-release.mjs publish --release-id 123 --expected /absolute/new-public-assets.expected.json --authorization /absolute/private-launch-authorization.json
~~~

The example ID is illustrative. Use the actual verified release ID and exact
launch binding. An authorization record documents the real owner grant; merely
creating a JSON file does not provide that grant. Changed or incomplete drafts
are refused. Repeating an identical completed operation observes its existing
state rather than overwriting assets or moving tags.

## GitHub Pages

Build a local preview without network access in the renderer:

~~~sh
node scripts/build-docs.mjs --output /absolute/new-site --base-path /tilde/
~~~

Guides live under /tilde/guide/. Static fallback pages preserve former guide
routes. Critical content and download links work without JavaScript.
The root-path build mode remains available for local checks.

Production requires actual published-release evidence. The manual Pages workflow
takes the reviewed publication-manifest SHA256, verifies the published tag,
uploaded bytes and live CI, then performs the offline production build. Its build
job has contents/actions read authority; only deployment has Pages/OIDC write
authority, in the github-pages environment. A draft, local preview, synthetic
QA fixture or workflow lint result is not a deployed or published release.

Verify the real public Pages URL, source/tag identity, downloaded package hash,
guide deep links and issue/security routes after launch. Preserve raw failures
and accepted exceptions; do not silently replace the qualified binary.
