---
version: 0.1.2
public_release: approved
publisher: shipsolid
repository: shipsolid/markami
listing_approved: true
artifact_size: 4757069
artifact_sha256: d8ca78875c54d02e2d40bedb6e9c4e9d9eca26e2ae6cdc15c49a25441136cc76
---

# markami 0.1.2 release evidence

Status: **candidate, ready to tag**. 0.1.1 is published to the Visual Studio Marketplace as a Preview; this release
makes a clean VS Code Markdown-preview style the default, with the Document style kept as an opt-in, and carries the
rendering work described below. The digest below was recorded from `main` before the Marketplace captures were
regenerated and re-checked from the merged revision after the capture pull request (#10, images only, which the VSIX
excludes): `npm run package` on `38cd011` reproduced the same size and SHA-256.

## Candidate artifact

| Field | Value |
|---|---|
| VSIX | `artifacts/markami-0.1.2.vsix` |
| Size | 4,757,069 bytes |
| SHA-256 | `d8ca78875c54d02e2d40bedb6e9c4e9d9eca26e2ae6cdc15c49a25441136cc76` |
| Publisher | `shipsolid` — owner-controlled public publisher |
| Public extension ID | `shipsolid.markami` |
| License | MIT |
| Repository target | `shipsolid/markami` |

The checksum, byte size, and package-policy result are regenerated from the final tagged revision by
the release workflow. Local package evidence is recorded in [`install-smoke.md`](install-smoke.md).

## Changes since 0.1.1

- The default appearance is the VS Code Markdown-preview style in your exact theme colors (UI font 14px/1.6, ruled
  h1 and h2, compact lists, pill-style code, quote bar); the Shantell Sans and Catppuccin Mocha Document
  appearance is opt-in. `markami.appearance.mode` defaults to `vscode` and `markami.theme.useEditorFont` to `false`.
- The in-page settings bar is replaced by editor-title icons and the new **Toggle Document Appearance** command.
- Table, code, and block-handle chrome appears on hover or keyboard focus; table cells render inline Markdown and
  edit in place; code is syntax highlighted with line numbers; lists, alerts, and dimmed revealed markers are
  rendered; the outline docks by measured room and follows the pane. See [`CHANGELOG.md`](../../CHANGELOG.md) and
  Task 31 in [`progress.md`](progress.md).

## Public release gates

- [x] Publisher, Entra federation, protected environments, license, and advisory acceptance are unchanged and were
  proven again by the 0.1.1 publish run recorded below.
- [x] Native stable Windows, macOS, and Linux integration plus VS Code 1.102 compatibility, and the packaged-VSIX
  install smoke on all three systems. Evidence: CI run 38060843361 on `main` (`d659925`) passed the integration
  matrix and the `install-smoke` matrix, and its `verify` job passed the benchmark gates.
- [x] Production-webview rendering verified in a real browser under dark, light, and high-contrast themes (88
  Playwright specs), and the 19 native VS Code integration tests pass in a container (VS Code 1.141.0, Linux).
- [x] A full Marketplace capture dry run in real VS Code under Dark Modern rendered the default style correctly.
- [x] Real IME and screen-reader smoke remains **waived by the owner for the Preview** (`preview: true`; tracked
  in issue #8); automated composition and accessibility tests pass and the gap is disclosed in the README and
  CHANGELOG. Revisit before a non-preview release.
- [x] Regenerate the Marketplace captures from the 0.1.2 VSIX, review all three images, merge the capture PR.
  Evidence: the Marketplace captures workflow (run 38061110112, from `1b68188`) captured the exact packaged VSIX; the
  three images were reviewed (the default style with rendered table cells, a titled Note alert, highlighted code, and
  the docked outline; one Document-style shot with source reveal on the active heading; no clipping, private content,
  or leftover raw markers) and the owner merged PR #10 as `38cd011`.
- [x] Re-record the final size and SHA-256 from the merged revision (this file's frontmatter and candidate table):
  `npm run package` on `38cd011` produced 4,757,069 bytes with the same SHA-256.
- [x] Create and push annotated tag `v0.1.2` only after the owner authorizes the release. The owner asked for the
  0.1.2 release and merged the capture PR; the Release workflow's dry run and the `vscode-marketplace` deployment,
  which the owner approves themself, follow from the tag.

## 0.1.1 publication record (history)

| Check | Result |
|---|---|
| Release workflow | Dry run [38054078699](https://github.com/shipsolid/markami/actions/runs/38054078699) from tag `v0.1.1` (quality, four platform legs, and package passed). Publish run [38054250565](https://github.com/shipsolid/markami/actions/runs/38054250565) from the same tag passed the same gates; the owner approved the `vscode-marketplace` deployment |
| Azure federation | `azure/login` succeeded through GitHub OIDC with the managed identity already proven by 0.1.0 |
| Provider response | `vsce publish --azure-credential --packagePath artifacts/markami-0.1.1.vsix` reported `Published shipsolid.markami v0.1.1.`; the workflow's own step that downloads and validates the public artifact also passed |
| Gallery state | `shipsolid.markami` 0.1.1, extension flags `validated, public, preview`; the version flag was `validated` when it first appeared in the by-name query a few minutes after the publish |
| Public artifact | `.../publishers/shipsolid/vsextensions/markami/0.1.1/vspackage` is 4,751,138 bytes with SHA-256 `251b9b481ef9c5f31852d8dc576c5d91baa84c21ddf19fc1674289fdd8f6b46b`, equal to the recorded digest |
| Clean-profile install | VS Code 1.141.0 (Linux container) with empty `--extensions-dir`/`--user-data-dir`: `code --install-extension shipsolid.markami` reported `v0.1.1 was successfully installed`; `--list-extensions --show-versions` lists `shipsolid.markami@0.1.1` |
| Installed contents | 294 of the 295 files under `extension/` in the public VSIX are byte-identical to the installed tree; `package.json` differs only by the `__metadata` block (`installedTimestamp`, `size`, `targetPlatform`) VS Code adds at install. The bundled Shantell Sans and JetBrains Mono files are present |
| Listing assets | The gallery serves the manifest, README (Details), CHANGELOG, LICENSE, default and small icons, the VSIX, and its signature; the item page returns HTTP 200 |

Scope and gaps: the integration suite was not re-run against the Marketplace-installed copy; the same bytes passed
the packaged-VSIX install smoke on Linux, Windows, and macOS in CI before publication. The first install from the
Marketplace in a container needed the host's corporate TLS CA (`NODE_EXTRA_CA_CERTS`), which is local to the
verification host. No GitHub release has been created for 0.1.1 yet.

## 0.1.0 publication record (history)

0.1.0 was published to the Visual Studio Marketplace as a Preview on 2026-10-10
(<https://marketplace.visualstudio.com/items?itemName=shipsolid.markami>). Its candidate digest was
`c78650fcc2c7053d583bfb5d91c14d8926f9ddda6e24787e5438359927aafe38` (4,211,965 bytes). The same source produced
a byte-identical VSIX on the owner's IST host, in a UTC container, and on a GitHub runner once packaging was
pinned to UTC (ZIP entry times are stored in the packager's local time).

| Check | Result |
|---|---|
| Release workflow | Run [38041187851](https://github.com/shipsolid/markami/actions/runs/38041187851) from tag `v0.1.0`: quality, four platform legs, and package passed; the owner approved the `vscode-marketplace` deployment |
| Azure federation | `azure/login` succeeded through GitHub OIDC; the managed identity is a Contributor member of `shipsolid` |
| Provider response | `vsce publish --azure-credential --packagePath artifacts/markami-0.1.0.vsix` succeeded |
| Gallery state | `shipsolid.markami` 0.1.0, flags `public, preview`; the version moved from unflagged to `validated` within minutes; a text search for `markami` returns it |
| Public artifact | `.../publishers/shipsolid/vsextensions/markami/0.1.0/vspackage` is 4,211,965 bytes with SHA-256 `c78650fcc2c7053d583bfb5d91c14d8926f9ddda6e24787e5438359927aafe38`, equal to the recorded digest; the workflow's `checkPackage.mjs` accepted it |
| Clean-profile install | VS Code 1.141.0 with empty `--extensions-dir`/`--user-data-dir`: `code --install-extension shipsolid.markami` reported `v0.1.0 was successfully installed`; `--list-extensions --show-versions` lists `shipsolid.markami@0.1.0` |
| Installed contents | 279 of the 280 files in the public VSIX are byte-identical to the installed tree; `package.json` differs only by the `__metadata` block VS Code adds at install, and `.vsixmanifest` is written by the installer |
| GitHub release | Run [38048666102](https://github.com/shipsolid/markami/actions/runs/38048666102) from tag `v0.1.0` (same gates, `github-release` environment approved by the owner) created the [v0.1.0 release](https://github.com/shipsolid/markami/releases/tag/v0.1.0) with `markami-0.1.0.vsix` (GitHub's asset digest equals the recorded SHA-256) and its `.sha256`. The workflow attaches the tagged copy of this file as the body, which still said "not yet published", so the body was replaced by hand with install, verify, and known-limitation text |
| Listing assets | The gallery serves the manifest, README (Details), CHANGELOG, LICENSE, default and small icons, and the VSIX signature; links point at `shipsolid/markami` (source, issues, README); pricing Free; engine `^1.102.0`; item page returns HTTP 200 |

Scope and gaps: the same bytes passed `npm run smoke:install` (installed-VSIX integration suite and
uninstall check) on Linux before publication, and the Marketplace-installed copy is the same files. Not
re-run against the Marketplace-installed copy: the integration suite itself. Windows and macOS
install smoke, IME, and screen-reader behavior remain as stated in the checklist below. The first
install from the Marketplace needed a corporate TLS proxy CA on the owner's network
(`NODE_EXTRA_CA_CERTS`); that is local to the verification host, not a property of the listing. The
Marketplace shows "Verifying" for a few minutes after publish and by-name queries can lag it.
