---
version: 0.1.3
public_release: approved
publisher: shipsolid
repository: shipsolid/markami
listing_approved: true
artifact_size: 4762865
artifact_sha256: 7f3b0ec4e26a442181e675febf75f2638ba22b22a48e302b6a38f26e2c9b475c
---

# markami 0.1.3 release evidence

Status: **candidate**. 0.1.2 is published to the Visual Studio Marketplace as a Preview; this release adds a first-run
walkthrough, a sample document, confirmed and reversible default-editor commands, a caret that lands where a table cell
is clicked, and a listing that shows a real Git diff. The digest below was recorded after the adoption fixes of Task 35
were added to the preparation commit. Differences from the CI-verified `d26389e` that reach the VSIX: the version, the
changelog, the Restricted Mode declaration, two search keywords, the walkthrough and sample wording, and the README and
`SECURITY.md` text. Runbook examples, this file, the issue templates, the new `smoke:restricted` harness, and its CI step
do not.

## Candidate artifact

| Field | Value |
|---|---|
| VSIX | `artifacts/markami-0.1.3.vsix` |
| Size | 4,762,865 bytes |
| SHA-256 | `7f3b0ec4e26a442181e675febf75f2638ba22b22a48e302b6a38f26e2c9b475c` |
| Publisher | `shipsolid` — owner-controlled public publisher |
| Public extension ID | `shipsolid.markami` |
| License | MIT |
| Repository target | `shipsolid/markami` |

The checksum, byte size, and package-policy result are regenerated from the final tagged revision by
the release workflow. Local package evidence is recorded in [`install-smoke.md`](install-smoke.md).

## Changes since 0.1.2

- A **Get started with markami** walkthrough and **markami: Open Sample Document** (an untitled document, nothing
  written until saved).
- **markami: Make markami the Default Markdown Editor** and **markami: Use Native Markdown Editor by Default**: modal
  confirmation, only the `*.md` and `*.markdown` entries of the user-level `workbench.editorAssociations`, entries for
  other editors never removed, legacy array form refused. The unused `markami.openAsDefault` setting is removed.
- Clicking a table cell with inline Markdown places the caret at the matching source position.
- The listing leads with outcomes and a three-step Get started, and the gallery gains a demo GIF and a real Git-diff
  capture. See [`CHANGELOG.md`](../../CHANGELOG.md) and Task 33 in [`progress.md`](progress.md).
- Restricted Mode support (`capabilities.untrustedWorkspaces: limited`, `markami.remoteImages` restricted), checked by
  opening an untrusted workspace with the packaged VSIX. Walkthrough and sample wording that no longer promises a Git
  diff from an untitled file, a README comparison section and `Ctrl/Cmd+K` note, `wysiwyg` and `visual-editor` search
  keywords, a corrected `SECURITY.md`, and bug-report issue templates. See Task 35 in [`progress.md`](progress.md).

## Public release gates

- [x] Publisher, Entra federation, protected environments, license, and advisory acceptance are unchanged and were
  proven again by the 0.1.2 publish run recorded below.
- [x] Native stable Windows, macOS, and Linux integration plus VS Code 1.102 compatibility, and the packaged-VSIX
  install smoke on all three systems. Evidence: CI run 38073661424 on `main` (`d26389e`) passed the integration
  matrix (Linux, Windows, macOS on stable; Linux on 1.102.0), the `install-smoke` matrix, `verify` with its
  benchmark gates, and `package`. That run is the source this candidate differs from only as described above; the
  CI run on the preparation commit repeats it.
- [x] The packaged 0.1.3 VSIX installs into a clean profile, passes the integration suite against the installed
  copy (21 tests; the three that need the test-only inspection command run only from source), and uninstalls
  cleanly with Markdown opening natively and its bytes unchanged (`npm run smoke:install` in the Playwright
  container, VS Code 1.141.0, Linux).
- [x] Restricted Mode: with the packaged 0.1.3 VSIX installed, `npm run smoke:restricted` opens an untrusted
  workspace in VS Code 1.141.0 (Linux container). markami activates and opens the file in the rendered editor, an
  ordinary workspace setting still applies, and the workspace's `markami.remoteImages: allow` is ignored. The same
  suite against the earlier 0.1.3 candidate, which declared nothing, fails because `shipsolid.markami` is absent in
  Restricted Mode. Windows and macOS are not covered by this check.
- [x] Production-webview rendering verified in a real browser under dark, light, and high-contrast themes (88
  Playwright specs), and 24 native VS Code integration tests pass from source in the same container.
- [x] The five Marketplace assets (a demo GIF and four screenshots, including a real Git diff) were captured from the
  exact packaged VSIX by the Marketplace captures workflow (run 38073251476, from `61051af`), reviewed by the owner,
  and merged as PR #11 (`d26389e`). `marketplaceListing.mjs --validate` accepts all five. The capture run itself
  asserts that the saved file differs from the committed one in exactly one line.
- [x] The owner approved the listing (`listing_approved: true`) after reviewing those assets.
- [x] Real IME and screen-reader smoke remains **waived by the owner for the Preview** (`preview: true`; tracked
  in issue #8); automated composition and accessibility tests pass and the gap is disclosed in the README and
  CHANGELOG. Revisit before a non-preview release.
- [x] Walkthrough rendering on the Welcome page, the default-editor confirmation dialog, markami in a WSL, SSH, or
  dev-container window, and the `Ctrl+K` chord behavior described in the README have **not been observed in a real
  window**. The confirmation path is covered by unit tests with an injected host, the chord behavior was read from VS
  Code's keybinding resolver rather than exercised with key presses, and Restricted Mode is exercised natively. The
  owner asked for the release on 2026-10-11 knowing this gap, so it ships as a disclosed gap for this Preview, not as a
  pass. Look at all four after installing 0.1.3 and report problems in the issue tracker.
- [x] Push the preparation commit and confirm CI is green on it, then re-check the size and SHA-256 from that
  revision. Evidence: the owner pushed the Task 35 changes as `109cc28`. CI run 38076187188 passed `verify`, the
  integration matrix (Linux, Windows, macOS on stable; Linux on 1.102.0), the `install-smoke` matrix with the new
  Restricted Mode step on Linux, and `package`; Security run 38076187276 passed. The `markami-vsix` artifact built on
  the GitHub runner is 4,762,865 bytes with the recorded SHA-256.
- [x] Create and push annotated tag `v0.1.3` only after the owner authorizes the release. The owner authorized it on
  2026-10-11 ("tag and publish"); the Release workflow's dry run and the `vscode-marketplace` deployment, which the
  owner approves themself, follow from the tag.

## 0.1.2 publication record (history)

| Check | Result |
|---|---|
| Release workflow | Dry run [38067641511](https://github.com/shipsolid/markami/actions/runs/38067641511) from tag `v0.1.2` (quality, four platform legs, and package passed). Publish run [38067820360](https://github.com/shipsolid/markami/actions/runs/38067820360) from the same tag passed the same gates; the owner approved the `vscode-marketplace` deployment |
| Provider response | `vsce publish --azure-credential --packagePath artifacts/markami-0.1.2.vsix` reported `Published shipsolid.markami v0.1.2.`; the workflow's own step that downloads and validates the public artifact also passed |
| Gallery state | `shipsolid.markami` flags `validated, public, preview`; version 0.1.2 appeared in the by-name query as `validated` a few minutes after the publish (the query still listed 0.1.1 first at first) |
| Public artifact | `.../publishers/shipsolid/vsextensions/markami/0.1.2/vspackage` is 4,757,069 bytes with SHA-256 `d8ca78875c54d02e2d40bedb6e9c4e9d9eca26e2ae6cdc15c49a25441136cc76`, equal to the recorded digest |
| Clean-profile install | VS Code 1.141.0 (Linux container) with empty `--extensions-dir`/`--user-data-dir`: `code --install-extension shipsolid.markami` reported `v0.1.2 was successfully installed`; `--list-extensions --show-versions` lists `shipsolid.markami@0.1.2`. Installed before the version appeared in the by-name query, the same command installed 0.1.1, as expected |
| Installed contents | 294 of the 295 files under `extension/` in the public VSIX are byte-identical to the installed tree; `package.json` differs only by the `__metadata` block (`installedTimestamp`, `size`, `targetPlatform`) VS Code adds at install |
| Listing assets | The item page returns HTTP 200; the gallery serves the README (Details), the CHANGELOG with its `## 0.1.2` section, and the default icon |

Scope and gaps: the integration suite was not re-run against the Marketplace-installed copy; the same bytes passed
the packaged-VSIX install smoke on Linux, Windows, and macOS in CI before publication. Visual verification of the
published listing images was limited to the reviewed capture PR (#10); the Marketplace page itself was not opened
in a browser.

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
