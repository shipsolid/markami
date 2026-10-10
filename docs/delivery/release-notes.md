---
version: 0.1.1
public_release: approved
publisher: shipsolid
repository: shipsolid/markami
listing_approved: true
artifact_size: 4751138
artifact_sha256: 251b9b481ef9c5f31852d8dc576c5d91baa84c21ddf19fc1674289fdd8f6b46b
---

# markami 0.1.1 release evidence

Status: **candidate, ready to tag**. 0.1.0 is published to the Visual Studio Marketplace as a Preview; this release
carries Document appearance as a designed reading view and the rendering fixes found in real notes. The digest
below was recorded from `main` after the Marketplace capture PR (#9) merged and after a projection performance fix
(`1d0f3d3`) that the main CI benchmark required. The VSIX built on a GitHub runner in CI run 38053695267 is
byte-identical to the one built on the owner's host (same size and SHA-256), and the release workflow regenerates
both from the tag and requires them to match.

## Candidate artifact

| Field | Value |
|---|---|
| VSIX | `artifacts/markami-0.1.1.vsix` |
| Size | 4,751,138 bytes |
| SHA-256 | `251b9b481ef9c5f31852d8dc576c5d91baa84c21ddf19fc1674289fdd8f6b46b` |
| Publisher | `shipsolid` — owner-controlled public publisher |
| Public extension ID | `shipsolid.markami` |
| License | MIT |
| Repository target | `shipsolid/markami` |

The checksum, byte size, and package-policy result are regenerated from the final tagged revision by
the release workflow. Local package evidence is recorded in [`install-smoke.md`](install-smoke.md).

## Changes since 0.1.0

- Document appearance is the default: Shantell Sans and JetBrains Mono bundled locally (SIL Open Font License,
  +0.3 MB), 17–18px body at 1.9 line height, a 100ch measure, card-style technical blocks, and the Catppuccin
  Mocha palette in dark themes only (`markami.document.palette`).
- The outline docks as a column in panes of at least 1280px and is a pill below that.
- Fixes: inline emphasis and code styling, one-card code blocks without per-line scrollbars, dividers, VS Code
  appearance heading hierarchy, theme-colored gutter and buttons, syntax styling leaking into fenced code, and
  frontmatter appearing in the outline. See [`CHANGELOG.md`](../../CHANGELOG.md) and Task 28–29 in
  [`progress.md`](progress.md).

## Public release gates

- [x] Publisher, Entra federation, protected environments, license, and advisory acceptance are unchanged from
  0.1.0 and recorded in its publication record below. The first 0.1.0 publish run proved the identity is a
  Contributor of the `shipsolid` publisher.
- [x] Native stable Windows, macOS, and Linux integration plus VS Code 1.102 compatibility. Evidence: CI run
  38053695267 on `main` (`1d0f3d3`) passed the integration matrix on `ubuntu-latest`, `windows-latest`, and
  `macos-latest` with VS Code stable and on `ubuntu-latest` with VS Code 1.102.0, and its `verify` job passed the
  benchmark gates (1 MiB open median 396 ms against a 1500 ms target; typing p95 29.56 ms against 50 ms). The
  previous run on `23be920` failed the typing gate at 50.62 ms because of a quadratic fence lookup, fixed in
  `1d0f3d3` (Task 29 in [`progress.md`](progress.md)).
- [x] Packaged-VSIX install, edit, save, and uninstall smoke on Linux, Windows, and macOS. Evidence: the same CI
  run's `install-smoke` matrix installs the packaged VSIX into an isolated profile on all three systems and runs
  the integration suite against it.
- [x] Native VS Code integration of the Document defaults and the new outline layout: the 18 integration tests
  also passed in a container (VS Code 1.141.0, Linux) with the changed defaults.
- [x] Production-webview rendering verified in a real browser under dark, light, and high-contrast themes at
  600, 700, 800, 1000, 1300, 1700, and 1800px panes (45 Playwright specs, all passing).
- [x] Real IME and screen-reader smoke remains **waived by the owner for the Preview** (`preview: true`; tracked
  in issue #8); automated composition and accessibility tests pass and the gap is disclosed in the README and
  CHANGELOG. Revisit before a non-preview release.
- [x] Regenerate the Marketplace captures from the 0.1.1 VSIX, review all three images, merge the capture PR.
  Evidence: the Marketplace captures workflow (run 38052856072, from `60cf41c`) captured the exact packaged
  VSIX; the three images were reviewed (Document appearance with the Mocha palette, docked outline, card code
  blocks, local Mermaid and math, source reveal on the active heading; no clipping or private content) and the
  owner merged PR #9 as `23be920`. The later performance fix changes no rendering. Known cosmetic gaps shown in
  the images: a `[!NOTE]` alert still shows its raw marker line, and table controls and block handles are always
  visible.
- [x] Re-record the final size and SHA-256 from the merged revision (this file's frontmatter and candidate table).
- [x] Create and push annotated tag `v0.1.1` only after the owner authorizes the release. The owner asked for the
  0.1.1 publication on 2026-10-10 and merged the capture PR; the Release workflow's dry run and the
  `vscode-marketplace` deployment, which the owner approves themself, follow from the tag.

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
