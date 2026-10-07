# Delivery progress

## Task 1 — Reproducible repository and custom-editor shell

- Status: complete
- Commit: `chore: bootstrap markami custom editor`
- Changed paths: package/tooling/CI, extension activation/provider, local CodeMirror webview, real VS Code integration harness, contributor contract
- RED: `opens_md_as_optional_custom_editor` failed in VS Code 1.141.0 before the provider existed
- GREEN:
  - `npm ci` — pass; 541 packages installed from lockfile
  - `npm run verify` — pass; lint, strict typecheck, unit/protocol/fidelity runners, extension/webview production build
  - `npm run build:integration` — pass
  - VS Code 1.141.0 under Linux/Xvfb container — `opens_md_as_optional_custom_editor`, 1 passing; `.md`/`.markdown` bytes unchanged and `.ts` stayed native
- Environment: WSL2 host, Node 24.21.0/npm 11.19.0; declared Node 22 is configured in CI but not yet run locally
- Limitation: downloaded desktop VS Code cannot launch directly on this WSL host because native Chromium libraries/Xvfb are absent; the same downloaded binary passed inside the pinned Playwright Ubuntu container
- Next: Task 2 source-coordinate maps and patch primitives

## Task 2 — Source coordinates and patch primitives

- Status: complete
- Commit: `feat: map editor coordinates to canonical Markdown`
- Changed paths: branded host/editor offsets, CRLF/mixed-separator coordinate map, line-ending inspection, patch validation/application/inversion, exact-string fixtures/tests
- RED: unit and fidelity suites failed because `CoordinateMap` and `PatchSet` did not exist
- GREEN:
  - `npm run test:unit -- CoordinateMap` — 6 passing
  - `npm run test:fidelity -- sourcePatches` — 10 passing
  - `npm run verify` — pass; 16 tests across unit/fidelity plus build and static checks
- Covered boundaries: CRLF midpoint bias, LF identity, mixed/lone-CR separators, final/empty lines, UTF-16 emoji, combining marks, multiline insertion, inverse restoration, deterministic same-position insertion, invalid/overlapping ranges
- Next: Task 3 canonical sessions, acknowledgements, and external-change safety

## Task 3 — Canonical session, acknowledgements, and external changes

- Status: complete
- Commit: `feat: synchronize versioned Markdown views safely`
- Changed paths: protocol v1 schemas/messages, one-in-flight patch queue, canonical session/registry, VS Code adapter, editable webview bridge, ADR-004, protocol and split-view integration tests
- RED: protocol suite failed before `DocumentSession`; injected adapter exception also failed and poisoned the queue before the guarded apply path was added
- GREEN:
  - `npm run test:protocol -- sync` — 6 passing
  - `npm run verify` — pass; 22 tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 2 integration tests passing, including source/custom views sharing one canonical document
- Ruling: the VS Code API guarantees all-or-nothing application for text-only `WorkspaceEdit` but exposes no versioned CAS; markami revalidates version/source immediately before dispatch, serializes its own writes, verifies the canonical result, and retains drafts on any mismatch. Minimum-version/platform race experiments remain a release gate.
- Next: Task 4 host-authoritative history, save flushing, and bounded draft recovery

## Task 4 — Save, canonical history, and pending-text recovery

- Status: complete
- Commit: `feat: preserve canonical history and recover pending edits`
- Changed paths: history routing, queued save, 10 MiB recovery store, recovery comparison/banner, protocol save/history messages, ADR-009, unit/protocol/VS Code integration tests
- RED: save was not available on `DocumentSession`; recovery module/store did not exist; read-only fixture initially blocked editing before the intended save-failure boundary and was corrected
- GREEN:
  - Recovery/unit suites — 10 passing
  - Protocol sync/save suite — 7 passing
  - `npm run verify` — pass; 27 tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 5 integration tests passing, including exact undo/redo dirty-state transitions and failed-write dirty recovery
- Limitation: VS Code 1.102.0, Windows/macOS history routing, native IME, and screen-reader checks remain unverified release gates
- Next: Task 5 conservative Markdown projection and source islands
