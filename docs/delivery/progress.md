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

## Task 5 — Conservative Markdown projection and source islands

- Status: complete
- Commit: `feat: project rendered Markdown over preserved source`
- Changed paths: conservative Markdown recognizer, semantic/source-map model, CodeMirror projection decorations, source-island and syntax-reveal rules, webview projection tests
- RED: projection tests failed because syntax recognition, semantic mapping, and CodeMirror projection modules did not exist
- GREEN:
  - `npm run test:webview -- projection` — 6 passing
  - `npm run test:fidelity` — 10 passing
  - `npm run verify` — pass; 27 core tests plus build/static checks
- Covered boundaries: headings, quotes, lists, dividers, strong/emphasis/strike/code marks, selection-driven delimiter reveal, unterminated fences, and semantic-disagreement fallback to literal source
- Next: Task 6 projected editing intents and Markdown-aware operations

## Task 6 — Formatting commands and floating selection toolbar

- Status: complete
- Commit: `feat: edit selections through source-aware formatting controls`
- Changed paths: exact-source formatting/heading planners, shared action registry, CodeMirror commands/keymaps, accessible floating toolbar, stale-safe link popover, VS Code command routing and toolbar setting
- RED: formatting and toolbar suites failed because the planner and shared toolbar/action modules did not exist
- GREEN:
  - `npm run test:unit -- formatting` — 19 unit tests passing across the unit suite
  - `npm run test:webview -- selectionToolbar` — 12 webview tests passing across projection and toolbar suites
  - `npm run verify` — pass; 36 core tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 5 integration tests passing, including canonical visual undo/source redo history
- Covered boundaries: minimal delimiter insertion/removal, existing underscore bold, unsafe partial clear, backticks in code spans, unsafe link schemes, Setext conversion, active/mixed states, code/frontmatter exclusions, pointer selection retention, roving focus/Escape, and external-edit invalidation
- Limitation: native pointer/IME/screen-reader behavior remains a Task 15/16 release gate; current interaction coverage is deterministic jsdom plus the extension-host history suite
- Next: Task 7 slash palette and deterministic block insertion

## Task 7 — Slash palette and deterministic block insertion

- Status: in progress — core planner/palette complete; required existing-image picker remains owned by Task 11
- Commit: `feat: add deterministic slash command palette`
- Changed paths: deterministic block templates, parser/source-aware slash state, accessible listbox palette, shared insertion action IDs, CodeMirror key routing, settings and explicit VS Code command
- RED: insertion and palette suites failed because the planner, state machine, and palette modules did not exist
- GREEN:
  - `npm run test:unit -- insertBlock` — 35 unit tests passing across the unit suite
  - `npm run test:webview -- slashPalette` — 20 webview tests passing across projection, toolbar, and slash suites
  - `npm run verify` — pass; 52 core tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 5 integration tests passing, including canonical one-transaction history behavior
- Covered boundaries: `/mer` locality, all deterministic templates, filtering/navigation/no-results, Escape and dialog cancellation, code/URL/island/nested suppression, math gating, explicit invocation while auto-trigger is disabled, and stale-range invalidation
- Remaining dependency: Image is present in the registry and its cancelled async path is source-neutral, but accepted image insertion intentionally requires the trusted host image service from Task 11; Task 7 must not be marked complete before that integration passes
- Next: Task 8 block move planners and accessible handles while the Task 11 dependency remains deferred
