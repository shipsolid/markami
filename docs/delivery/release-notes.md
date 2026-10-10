---
version: 0.1.0
public_release: approved
publisher: shipsolid
repository: shipsolid/markami
listing_approved: true
artifact_size: 4211965
artifact_sha256: c78650fcc2c7053d583bfb5d91c14d8926f9ddda6e24787e5438359927aafe38
---

# markami 0.1.0 release evidence

Status: **approved for the 0.1.0 Preview; not yet published**.

This is a preparation record, not a publication claim. No GitHub release, Marketplace listing, or public
install has been verified. The release tag is created from the commit that contains this record; the
protected workflow regenerates the checksum and size from that tag and fails if they differ from the
values above. On 2026-10-10 the same source produced a byte-identical VSIX on the owner's IST host, in
a UTC container, and on a GitHub runner once packaging was pinned to UTC (ZIP entry times are stored in
the packager's local time), so the recorded digest is expected to match.

## Candidate artifact

| Field | Value |
|---|---|
| VSIX | `artifacts/markami-0.1.0.vsix` |
| Size | 4,211,965 bytes |
| SHA-256 | `c78650fcc2c7053d583bfb5d91c14d8926f9ddda6e24787e5438359927aafe38` |
| Publisher | `shipsolid` — owner-controlled public publisher |
| Public extension ID | `shipsolid.markami` |
| License | MIT |
| Repository target | `shipsolid/markami` |

The checksum, byte size, and package-policy result are regenerated from the final tagged revision by
the release workflow. Local package evidence is recorded in
[`install-smoke.md`](install-smoke.md).

## Included capabilities

- Source-preserving rendered editing backed by the open `vscode.TextDocument`.
- CommonMark/GFM editing, source islands, tables, tasks, Mermaid, math, code, safe HTML, and images.
- Native VS Code save/history, multi-view synchronization, external-change recovery, and source
  fallback for documents larger than 4 MiB UTF-8.
- Locally packaged renderers, fonts, strict webview CSP, and no telemetry or document upload.

## Automated evidence

- `npm run verify`: lint, strict type checks, unit/protocol/fidelity/package/release tests, production
  dependency license policy, and deterministic production builds.
- `npm run test:webview`, `npm run test:visual`, `npm run bench`, and integration-test compilation.
- `npm run package`, strict VSIX allowlist/reference inspection, SHA-256 verification, and ZIP
  integrity validation.
- Detailed results and known evidence boundaries: [`verification.md`](verification.md) and
  [`install-smoke.md`](install-smoke.md).

## Public release blockers

- [x] Use the owner-controlled `shipsolid` Marketplace publisher consistently in the manifest and
  release evidence.
- [x] Authorize the Entra managed identity as a Contributor member of the Marketplace publisher and
  protect the `vscode-marketplace` GitHub environment with release-tag restrictions and reviewers.
  Evidence: both release environments require the owner as reviewer, allow only `v*` tags, and
  disable admin bypass (read back through the GitHub API on 2026-10-10). The owner attested on
  2026-10-10 that the identity is a Contributor of the `shipsolid` publisher; that membership cannot be
  read back, so the first publish run is its proof. GitHub OIDC login for this identity was proven on
  2026-10-09.
- [x] Approve the 0.1.0 Preview title, description, categories, keywords, banner, icon,
  privacy/security links, free pricing, and MIT license.
- [x] Dispatch the Marketplace capture workflow, review its exact-VSIX images, merge the generated
  listing PR, and only then set `listing_approved: true` above. Generated mockups do not satisfy this
  gate. Evidence: the workflow ran on `main` twice (runs 38037693672 and 38038916352); the first run
  exposed a Mermaid sanitizer defect, fixed in PR #5, and the second was merged as PR #6. The images
  were reviewed by Claude at the owner's instruction and merged under the owner's delegation. Known
  cosmetic issues accepted for 0.1.0: a bright block-handle gutter and default-styled white buttons
  in the dark theme.
- [x] Complete install/edit/save/undo/offline-widget/uninstall smoke from an isolated native profile.
  Evidence: `npm run smoke:install` verifies the VSIX checksum, installs it into an isolated profile
  with the VS Code CLI, runs the integration suite against the installed extension, uninstalls it, and
  confirms a BOM+CRLF Markdown file then opens natively with identical bytes. It passed offline (container
  with networking disabled, VS Code 1.141.0 Linux x64) and on a GitHub runner in CI run 38039775318. The
  production webview renders Mermaid, math, and code with zero external requests
  (`test/visual-browser/technical.spec.ts`). Scope: Linux only and scripted; the manual interaction
  steps 4 and 6 of the checklist in [`install-smoke.md`](install-smoke.md) were not performed by hand.
- [x] Pass native stable Windows, macOS, and Linux integration runs plus VS Code 1.102 compatibility.
  Evidence: CI run 38039775318 on `main` passed the integration suite on `ubuntu-latest`,
  `windows-latest`, and `macos-latest` with VS Code stable (1.141.0) and on `ubuntu-latest` with
  VS Code 1.102.0.
- [x] Complete real IME and screen-reader smoke on supported native hosts. **Waived by the owner on
  2026-10-10 for the 0.1.0 Preview (`preview: true`); not performed.** Automated composition and
  accessibility tests pass (`test/webview/ime.test.ts`, `test/webview/accessibility.test.ts`), the gap
  is disclosed in the README and CHANGELOG, and the waiver should be revisited before a non-preview
  release.
- [x] Accept or remediate the documented low-severity Mermaid/KaTeX dependency advisories.
  Accepted by the owner's delegation on 2026-10-10 (GHSA-238p-pmpm-9mq7, low): Mermaid 12.1.0 is the
  latest release and nests KaTeX 0.16.47 (fixed in 0.18.2). It is not reachable here because Mermaid
  never passes KaTeX's `trust` option, rendered diagrams are stripped of `a` and `href`, and the webview
  CSP blocks inline script. The extension's own KaTeX is 0.19.0.
- [x] Create and push signed/annotated tag `v0.1.0` only after the owner authorizes the release.
  The owner authorized the tag, the Release dry run, and the Marketplace publish on 2026-10-10. The
  publish itself still pauses for the owner's approval in the `vscode-marketplace` environment.

After every item is evidenced, the protected workflow must publish the downloaded build artifact and
verify both the provider response and the publicly downloadable VSIX before this document may name a
Marketplace URL or say that markami is published.
