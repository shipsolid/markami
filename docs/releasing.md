# Releasing markami

Public delivery is owner-controlled. The repository can always produce a local VSIX, but no workflow
run, tag, or package alone proves that the Visual Studio Marketplace accepted a release.

## Owner inputs and one-time setup

Before the first public release, the owner must provide and approve:

1. The owner-controlled Visual Studio Marketplace publisher ID `shipsolid`. Keep `package.json`,
   release evidence, and workflow input aligned; the workflow never rewrites publisher identity.
2. A user-assigned managed identity authorized as a Contributor member of the Marketplace publisher,
   with a GitHub Actions federated credential scoped to repository `shipsolid/markami` and environment
   `vscode-marketplace`.
3. GitHub environments:
   - `vscode-marketplace`, with required reviewers and deployment branches/tags restricted to
     release tags, and environment secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and
     `AZURE_SUBSCRIPTION_ID`.
   - `github-release`, with required reviewers if GitHub Releases are enabled.
4. The public version, listing copy, categories, icon, actual-product captures, repository target,
   privacy/security links, and established MIT license.

Publishing uses GitHub OIDC to authenticate the managed identity through Microsoft Entra ID; VSCE
then obtains the Azure credential with `--azure-credential`. Do not paste a PAT into documentation,
workflow input, repository variable, log, or file. See the official
[VS Code secure automated publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

## GitHub repository settings

The Release and Marketplace captures workflows depend on repository settings that are not in version
control. The 2026-10-10 audit of `shipsolid/markami` found:

| Setting | Required | Audit result |
| --- | --- | --- |
| `vscode-marketplace` environment secrets | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | present |
| `vscode-marketplace` required reviewer | the owner | missing |
| `vscode-marketplace` deployment refs | tag policy `v*` | custom policies enabled with none defined, so every deployment is rejected |
| `vscode-marketplace` admin bypass | off | on |
| `github-release` environment | exists with the same reviewer and tag policy | missing |
| Actions → "Allow GitHub Actions to create and approve pull requests" | on, so Marketplace captures can open its review PR | off |
| Entra federated credential subject | `repo:shipsolid@13056224/markami@1408940721:environment:vscode-marketplace` | accepted by an OIDC login probe on 2026-10-09 |

This repository uses GitHub's immutable-ID OIDC subject. A federated credential written with the
name-based subject `repo:shipsolid/markami:environment:vscode-marketplace` is rejected by Entra
(AADSTS70021). The probe proved only that the identity can sign in; membership as a Contributor of
the Marketplace publisher is still unverified until the first protected dry run.

Apply the missing settings (the reviewer is the owner, so self-review stays allowed):

```bash
OWNER_ID=$(gh api user --jq .id)
for env in vscode-marketplace github-release; do
  gh api -X PUT "repos/shipsolid/markami/environments/$env" --input - <<JSON
{"prevent_self_review": false, "reviewers": [{"type": "User", "id": $OWNER_ID}],
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true},
 "can_admins_bypass": false}
JSON
  gh api -X POST "repos/shipsolid/markami/environments/$env/deployment-branch-policies" -f name='v*' -f type=tag
done
gh api -X PUT repos/shipsolid/markami/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

Verify before tagging:

```bash
gh api repos/shipsolid/markami/environments/vscode-marketplace \
  --jq '{can_admins_bypass, rules: [.protection_rules[].type]}'
gh api repos/shipsolid/markami/environments/vscode-marketplace/deployment-branch-policies \
  --jq '.branch_policies[] | {name, type}'
gh secret list --env vscode-marketplace
```

## Generate and approve Marketplace captures

1. From the default branch, run **Actions → Marketplace captures → Run workflow**. The workflow is
   intentionally unavailable from feature branches so unrelated commits cannot enter an asset PR.
2. The workflow packages the current version, extracts `extension/` from that exact VSIX, launches it
   in VS Code stable under a 1440×900 Xvfb display, and captures only the public fixtures in
   `fixtures/marketplace/`.
3. Download the workflow artifact and inspect all three PNGs for accuracy, clipping, legibility,
   private content, and source-reveal correctness. Review the generated README gallery in the pull
   request.
4. Merge the capture PR only after visual approval. Then set `listing_approved: true` in release
   evidence as a separate reviewed change. The capture workflow never grants its own approval.

The tagged release workflow validates these committed files but never regenerates, commits, or pushes
them. This keeps the Marketplace listing, reviewed source revision, and release tag aligned.

## Prepare and dry-run locally

1. Update `package.json`, `CHANGELOG.md`, and `docs/delivery/release-notes.md` to the same explicit
   semantic version. Commit the real publisher; do not patch it only in CI.
2. Complete the unchecked release-note gates and merge the approved capture PR. Every capture must be
   under `media/marketplace/` and referenced from `README.md` so it is part of the Marketplace listing.
3. Run the credential-free gates:

   ```bash
   npm ci
   npm run verify
   npm run test:webview
   npm run test:visual
   npm run bench
   npm run package
   npm run check:package
   npm run smoke:install
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
repository mismatch, dirty revision, missing exact tag, invalid artifact, or incomplete Azure
federation.

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

The GitHub release's body is the release-notes file as tagged, so it describes the state before
publication. After `github-release` completes, replace the body with `gh release edit v<version>
--notes-file <file>` so it states the install path, the artifact digest, and the known limitations.

## Rollback

- Before publication: reject the environment deployment; no external state changes.
- Bad GitHub release: mark it as a prerelease or remove its assets while investigating; never move the
  existing tag. Publish a new patch version for corrected immutable artifacts.
- Bad Marketplace release: stop further rollout, document impact, and publish a fixed patch version.
  Use Marketplace unpublish only with explicit owner approval; removal is destructive and can reserve
  the extension name permanently.
- Local install: uninstall markami from the isolated profile and reopen the Markdown file with VS
  Code's native text editor. Canonical document source does not depend on the extension.
