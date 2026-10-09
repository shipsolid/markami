# Releasing markami

Public delivery is owner-controlled. The repository can always produce a local VSIX, but no workflow
run, tag, or package alone proves that the Visual Studio Marketplace accepted a release.

## Owner inputs and one-time setup

Before the first public release, the owner must provide and approve:

1. A controlled Visual Studio Marketplace publisher ID. Replace `markami-dev` in `package.json` in a
   reviewed commit; the workflow never rewrites publisher identity.
2. A Marketplace trusted-publishing policy bound to repository `shipsolid/markami`, workflow
   `.github/workflows/release.yml`, and environment `vscode-marketplace`.
3. GitHub environments:
   - `vscode-marketplace`, with required reviewers and deployment branches/tags restricted to
     release tags.
   - `github-release`, with required reviewers if GitHub Releases are enabled.
4. The public version, listing copy, categories, icon, actual-product captures, repository target,
   privacy/security links, and established MIT license.

Trusted publishing uses GitHub OIDC and a short-lived Marketplace credential. Do not paste a PAT into
documentation, workflow input, repository variable, log, or file. See the official
[VSCE trusted-publishing guidance](https://github.com/microsoft/vscode-vsce#trusted-publishing) and
[VS Code publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Prepare and dry-run locally

1. Update `package.json`, `CHANGELOG.md`, and `docs/delivery/release-notes.md` to the same explicit
   semantic version. Commit the real publisher; do not patch it only in CI.
2. Complete the unchecked release-note gates, add actual captures under `media/marketplace/`, and
   reference every approved capture from `README.md` so it is part of the Marketplace listing.
3. Run the credential-free gates:

   ```bash
   npm ci
   npm run verify
   npm run test:webview
   npm run test:visual
   npm run bench
   npm run package
   npm run check:package
   npm run release:preflight -- --version 0.1.0 --phase artifact
   (cd artifacts && sha256sum -c markami-0.1.0.vsix.sha256)
   ```

   Copy the package command's exact byte size and SHA-256 into both the release-note frontmatter and
   candidate table, then rerun artifact preflight. Release notes are excluded from the VSIX, so this
   evidence update does not mutate the candidate it describes. The package script sets a stable
   `SOURCE_DATE_EPOCH` by default so the same source and toolchain produce the same ZIP timestamps;
   any explicit override must still be a valid ZIP epoch and must be held constant across builds.

4. Run the native clean-profile, platform, compatibility, IME, accessibility, and actual-capture
   checks. Record real outcomes; do not convert unavailable checks to passes.
5. From a clean revision, verify source metadata:

   ```bash
   npm run release:preflight -- --version 0.1.0 --phase source
   ```

Preparation mode reports public blockers without needing credentials. Publish mode fails closed on a
development publisher, version mismatch, placeholder metadata, missing capture, unchecked gate,
repository mismatch, dirty revision, missing exact tag, invalid artifact, or unavailable OIDC.

## Tag and run the protected workflow

Only after owner approval:

1. Create annotated tag `v<version>` at the reviewed release commit and push that tag. Do not move or
   reuse a release tag.
2. In **Actions → Release → Run workflow**, select that tag and enter the exact semantic version.
3. Leave both publish inputs off for a dry run. The workflow re-runs quality, browser, benchmark,
   dependency, stable Windows/macOS/Linux, and VS Code 1.102 gates; packages once; verifies the
   checksum; and retains the VSIX plus evidence.
4. Re-run from the same tag with `create_github_release` and/or `publish_marketplace` enabled only
   after the protected-environment reviewer confirms the candidate.
5. The Marketplace job publishes the exact artifact downloaded from the package job. It does not
   rebuild, mutate metadata, accept a PAT, or use `--skip-duplicate`.

## Verify delivery

The publish step is successful only when all of these are true:

- VSCE returns a successful provider response for `<publisher>.markami@<version>`.
- The public gallery API serves that exact versioned VSIX.
- The downloaded public VSIX passes the same package policy and contains the expected manifest
  version and publisher.
- A clean native profile can install the public artifact and complete the release smoke checklist.
- The Marketplace listing shows the approved version, description, links, icon, and actual captures.

Record the verified Marketplace URL and public-install evidence in the release notes only after those
checks pass.

## Rollback

- Before publication: reject the environment deployment; no external state changes.
- Bad GitHub release: mark it as a prerelease or remove its assets while investigating; never move the
  existing tag. Publish a new patch version for corrected immutable artifacts.
- Bad Marketplace release: stop further rollout, document impact, and publish a fixed patch version.
  Use Marketplace unpublish only with explicit owner approval; removal is destructive and can reserve
  the extension name permanently.
- Local install: uninstall markami from the isolated profile and reopen the Markdown file with VS
  Code's native text editor. Canonical document source does not depend on the extension.
