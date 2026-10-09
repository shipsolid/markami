---
version: 0.1.0
public_release: blocked
publisher: pending-owner-input
repository: shipsolid/markami
listing_approved: false
artifact_size: 4182803
artifact_sha256: 6f18bd356d0415406f6d1adacafd5815c836d968f837f1398d4b59cdec5aa4c5
---

# markami 0.1.0 release evidence

Status: **locally installable; Marketplace release prepared**.

This is a preparation record, not a publication claim. No release tag, GitHub release, Marketplace
listing, or public install has been verified.

## Candidate artifact

| Field | Value |
|---|---|
| VSIX | `artifacts/markami-0.1.0.vsix` |
| Size | 4,182,803 bytes |
| SHA-256 | `6f18bd356d0415406f6d1adacafd5815c836d968f837f1398d4b59cdec5aa4c5` |
| Publisher | `markami-dev` — local development only |
| Public extension ID | Pending the owner's verified publisher |
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

- [ ] Replace `markami-dev` in the committed manifest with the owner's controlled Marketplace
  publisher; set the same identity in this file.
- [ ] Configure a Marketplace trusted-publishing policy for `shipsolid/markami` and
  `.github/workflows/release.yml`, plus required reviewers on the `vscode-marketplace` environment.
- [ ] Approve the public version, copy, categories, icon, privacy/security links, and MIT license;
  then set `public_release: approved` and `listing_approved: true` above.
- [ ] Capture actual-product Marketplace images or GIFs from the release candidate. Generated
  mockups do not satisfy this gate.
- [ ] Complete install/edit/save/undo/offline-widget/uninstall smoke from an isolated native profile.
- [ ] Pass native stable Windows, macOS, and Linux integration runs plus VS Code 1.102 compatibility.
- [ ] Complete real IME and screen-reader smoke on supported native hosts.
- [ ] Accept or remediate the documented low-severity Mermaid/KaTeX dependency advisories.
- [ ] Create and push signed/annotated tag `v0.1.0` only after the owner authorizes the release.

After every item is evidenced, the protected workflow must publish the downloaded build artifact and
verify both the provider response and the publicly downloadable VSIX before this document may name a
Marketplace URL or say that markami is published.
