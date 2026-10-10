# Marketplace Capture and Listing Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce reviewable Marketplace listing assets from the exact packaged markami VSIX and gate public publishing on approved, committed captures.

**Architecture:** A manually dispatched capture workflow builds the VSIX, extracts its packaged extension, launches it in VS Code under Xvfb, and captures deterministic PNGs. The workflow updates the Marketplace gallery block and opens a review PR; the existing tagged release workflow only validates committed assets and publishes after its protected environment approval.

**Tech Stack:** Node.js 22, TypeScript, `@vscode/test-electron`, ImageMagick/Xvfb/Openbox, GitHub Actions, `gh`, VS Code Marketplace metadata.

**Spec:** `docs/spec.md` sections 1204 and 1336–1338, plus the user-approved two-workflow design from 2026-10-10.

## Global Constraints

- `vscode.TextDocument` remains the canonical Markdown state; capture support must not add production editing behavior.
- Captures must render the exact packaged VSIX, not a mockup or a source-tree web fixture.
- Capture content must be public, deterministic, and contain no credentials or private documents.
- Captures are 1440×900 PNGs, referenced by the Marketplace README, and reviewed through a PR before release.
- The release workflow remains tag-only, uses the protected `vscode-marketplace` environment, and publishes through Entra OIDC.
- No local commit, push, tag, workflow dispatch, release, or Marketplace publication is authorized by this plan.

## Review Focus

- A malformed or wrong-sized image must block publication instead of silently reaching the listing.
- Re-running gallery generation must be idempotent and must not duplicate or overwrite unrelated README content.
- The capture runner must use the extension extracted from the named VSIX, not the source checkout.
- A capture run on a non-default branch must not push an automation PR with unrelated commits.
- The tagged release must consume already committed captures and must never generate or commit assets.

---

### Task 1: Marketplace asset and listing contract

**Files:**
- Create: `scripts/marketplaceListing.mjs`
- Create: `scripts/marketplaceListing.test.mjs`
- Modify: `scripts/releasePreflight.mjs`
- Modify: `scripts/releasePreflight.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `MARKETPLACE_CAPTURES`, `updateMarketplaceGallery(readme)`, and `validateMarketplaceCapture(name, bytes)`.
- Consumes: existing release preflight source validation.

- [ ] Write failing tests for the exact required capture names, PNG signature/dimensions, malformed inputs, idempotent gallery replacement, preserved unrelated README content, and approved listing metadata.
- [ ] Run `node --test scripts/marketplaceListing.test.mjs scripts/releasePreflight.test.mjs` and confirm failures identify the missing contract.
- [ ] Implement the gallery and PNG validation module, integrate it into release preflight, and add Preview, banner, searchable description, keywords, and pricing metadata.
- [ ] Run `node --test scripts/marketplaceListing.test.mjs scripts/releasePreflight.test.mjs` and confirm all tests pass.

### Task 2: Packaged extension capture harness

**Files:**
- Create: `fixtures/marketplace/overview.md`
- Create: `fixtures/marketplace/source-fidelity.md`
- Create: `fixtures/marketplace/technical.md`
- Create: `test/marketplace-capture/suite/index.ts`
- Create: `test/marketplace-capture/marketplaceCapture.test.ts`
- Create: `scripts/runMarketplaceCapture.mjs`
- Create: `scripts/runMarketplaceCapture.test.mjs`
- Create: `tsconfig.marketplace-capture.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: a versioned VSIX path and `MARKETPLACE_CAPTURES` from Task 1.
- Produces: the required PNGs under `media/marketplace/` and a nonzero exit for missing tools, invalid VSIX layout, or missing captures.

- [ ] Write failing tests proving VSIX extraction rejects a missing `extension/package.json`, capture arguments reject a non-VSIX input, and the output contract requires every named image.
- [ ] Run `node --test scripts/runMarketplaceCapture.test.mjs` and confirm failures identify the missing runner.
- [ ] Implement the runner and capture suite so VS Code loads `extension/` extracted from the exact artifact and ImageMagick captures the actual X11 window.
- [ ] Run the runner unit tests and `npm run build:marketplace-capture` and confirm they pass.

### Task 3: Capture PR workflow and release evidence

**Files:**
- Create: `.github/workflows/marketplace-captures.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`
- Modify: `media/marketplace/README.md`
- Modify: `docs/delivery/install-smoke.md`
- Modify: `docs/delivery/progress.md`
- Modify: `docs/delivery/release-notes.md`
- Modify: `docs/releasing.md`
- Modify: `scripts/releasePreflight.test.mjs`

**Interfaces:**
- Consumes: Task 1 validation and Task 2 capture command.
- Produces: a manual capture workflow that uploads evidence and creates a review PR; release validation consumes only committed approved assets.

- [ ] Write failing workflow-policy tests for manual dispatch, least-privilege PR permissions, exact-VSIX capture, default-branch guard, pinned actions, capture validation, and the absence of capture generation in the tagged release workflow.
- [ ] Run `node --test scripts/releasePreflight.test.mjs` and confirm the new policy test fails.
- [ ] Implement the capture workflow, listing copy/resources, and honest release evidence while keeping `listing_approved: false` until the generated PR is visually approved.
- [ ] Run actionlint, the focused tests, `npm run verify`, `npm run test:webview`, `npm run test:visual`, `npm run test:visual:browser`, `npm run bench`, `npm run build:integration`, `npm run build:marketplace-capture`, `npm run package`, and the package/release preflights; record any host-only limitation without weakening CI gates.
