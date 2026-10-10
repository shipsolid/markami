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

- Status: complete — core planner/palette plus Task 11 trusted existing-image picker
- Commit: `feat: add deterministic slash command palette`
- Changed paths: deterministic block templates, parser/source-aware slash state, accessible listbox palette, shared insertion action IDs, CodeMirror key routing, settings and explicit VS Code command
- RED: insertion and palette suites failed because the planner, state machine, and palette modules did not exist
- GREEN:
  - `npm run test:unit -- insertBlock` — 35 unit tests passing across the unit suite
  - `npm run test:webview -- slashPalette` — 20 webview tests passing across projection, toolbar, and slash suites
  - `npm run verify` — pass; 52 core tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 5 integration tests passing, including canonical one-transaction history behavior
- Covered boundaries: `/mer` locality, all deterministic templates, filtering/navigation/no-results, Escape and dialog cancellation, code/URL/island/nested suppression, math gating, explicit invocation while auto-trigger is disabled, and stale-range invalidation
- Dependency closed: Task 11 supplies the trusted host picker/copy service; accepted image insertion now revalidates the live slash range after the asynchronous dialog, while cancellation remains source-neutral
- Next: complete remaining ordered implementation tasks

## Task 8 — Exact-source block moves and accessible handles

- Status: complete
- Commit: `feat: reorder blocks without rewriting Markdown`
- Changed paths: conservative top-level block index, two-patch move planner, seam reparse guard, CodeMirror gutter/drag/keyboard controls, block commands and setting, ADR-011, fidelity/UI tests
- RED: block-move and handle suites failed because the index, move planner, and handle controller did not exist
- GREEN:
  - `npm run test:fidelity -- blockMoves` — 22 fidelity tests passing across the fidelity suite
  - `npm run test:webview -- blockHandles` — 24 webview tests passing across all webview suites
  - `npm run verify` — pass; 64 core tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 5 integration tests passing, including canonical undo/redo history
- Covered boundaries: paragraph/heading/list/quote/fence/table/source-island cores, EOF without newline, CRLF first/last moves, no-op target, pinned frontmatter, ambiguous fence refusal, nested-list grouping, stale drag cancellation, Escape cleanup, live announcements, and bounded auto-scroll
- Ruling: an upward move carries the preceding separator after the core; a downward move carries the following separator before the core. The simulated result must reparse to the requested core sequence or the move is rejected.
- Next: Task 9 technical Markdown blocks

## Task 9 — Tasks, code, Mermaid, math, and alerts

- Status: complete
- Commit: `feat: render and edit technical Markdown blocks locally`
- Changed paths: task/list planners and checkbox widget, fenced-code parser/editor/header/highlighting, lazy local Mermaid and KaTeX renderers, GitHub alert projection, technical feature registry/StateField, bundled styles/fonts and renderer configuration
- RED: technical fidelity/UI suites failed because task, fence, renderer, alert, and technical projection modules did not exist
- GREEN:
  - `npm run test:fidelity -- technicalBlocks` — 32 tests passing across matching fidelity/webview files
  - `npm run test:webview` — 27 webview tests passing
  - `npm run verify` — pass; 71 core tests plus build/static checks
  - VS Code 1.141.0 Linux/Xvfb — 5 integration tests passing with the packaged local CSS/chunk paths loaded by the custom editor shell
- Covered boundaries: one-character task toggle, list continue/exit/indent/outdent, tilde/info-string code preservation, local language loading with plain fallback, Mermaid failure/source retention, bounded cache and 200ms obsolete-job cancellation, conservative currency/math recognition, alert marker preservation, malformed fences, and composition-like Unicode edits
- Security/performance: Mermaid uses strict local configuration; KaTeX uses `trust: false`; both are lazy chunks, renderer jobs are bounded/cancellable, and no code block is executed
- Limitation: native IME and screen-reader interaction remain unverified release gates; synthetic Unicode/composition coverage is not claimed as native IME proof
- Next: Task 10 GFM table editing

## Task 10 — GFM table grid and bounded structural edits

- Status: complete
- Commit: `feat: edit GFM tables with bounded source patches`
- Changed paths: escaped-pipe/code-span-aware table parser, cell/alignment/row/column planners, source-mapped accessible grid, table-only structural rewrite boundary, ADR-010, fidelity/UI tests
- RED: table fidelity/UI suites failed because the table source map, planners, and grid projection did not exist
- GREEN:
  - `npm run test:fidelity -- tables` — 37 tests passing across matching fidelity/webview files
  - `npm run test:webview` — 29 webview tests passing
  - `npm run verify` — pass; 77 core tests plus build/static checks
- Covered boundaries: escaped pipes, code spans containing pipes, ragged rows, alignment, CRLF, Unicode, direct cell locality, surrounding-byte preservation, last-cell row append, insert/delete row/column, malformed fallback, active source reveal, and stale table snapshots
- Ruling: routine cell/alignment edits are minimal patches; row/column changes may normalize only the confirmed table range while preserving surrounding text, EOL style, cell content, and alignment intent
- Next: Task 11 links, images, and resource policy; completing its image service will also close Task 7

## Task 11 — Safe repository links, images, and resources

- Status: complete
- Commit: `feat: navigate repository links and insert images safely`
- Changed paths: host-only resource/security service, typed request/result protocol, syntax-aware inline/reference link and image maps, CodeMirror projections/navigation, image field controls, trusted existing-file picker/copy flow, remote-image policy/CSP reload handshake
- RED: resource suites failed before the host resolver existed; dedicated cases then exposed external-copy symlink escape, code-example false positives, missing collapsed references, relative-link form rejection, and stale async image insertion
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, 44 unit tests, 8 protocol tests, 35 fidelity tests, production builds
  - `npm run test:webview` — pass; 35 webview tests
  - VS Code 1.141.0 Linux/Xvfb — 7 integration tests passing, including blocked/missing resource source preservation and policy-reload canonical-edit preservation
- Covered boundaries: encoded relative files/fragments, inline/full/collapsed/shortcut references, duplicate heading slugs, missing files, traversal and symlink escape, executable schemes, remote block/prompt/allow decisions, collision-safe copies, type/size/trust validation, exact alt/path/title patches, host-controlled open, failed-image placeholder, and stale dialog cancellation
- Security: filesystem access and external opening remain in the extension host; copied-image destinations are realpath-confined after directory creation; code spans/fences and escaped resource examples never resolve or navigate; policy changes disable editing until the canonical patch queue is synchronized, then reload under the new CSP
- Limitation: initial 1.0 platform commitment is local filesystem workspaces. Non-file resource operations fail closed with an explicit message; URI-native `workspace.fs` support and remote-workspace smoke coverage remain a Task 16 gate
- Next: Task 12 frontmatter, HTML, and unknown syntax fidelity

## Task 12 — Frontmatter, HTML, and unknown syntax fidelity

- Status: complete
- Commit: `feat: preserve frontmatter and unsupported document syntax`
- Changed paths: BOM/EOL-aware frontmatter ranges and CST validation, compact metadata/source projection, strict DOMPurify allowlist, conservative HTML/MDX/directive source islands, formatting/slash suppression, and CSP integration coverage
- RED: the document-syntax suites initially failed because frontmatter, HTML classification, sanitizer, and projection modules did not exist; follow-up RED cases exposed formatting leakage inside islands, Markdown decoration leakage, YAML-comment punctuation, and directive false positives inside code
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, 50 unit tests, 8 protocol tests, 42 fidelity tests, production builds
  - `npm run test:webview` — pass; 38 webview tests
  - VS Code 1.141.0 Linux/Xvfb — 8 integration tests passing, including CSP-hosted unsafe syntax and exact CRLF source preservation
- Covered boundaries: BOM and CRLF fences, comments, anchors, quoted scalars, ordering, duplicate keys, invalid YAML, exact local source edits, safe inactive HTML, script/event/iframe/form/unsafe-link denial, MDX and custom directives, code exclusions, source reveal, and no-touch source guarantees
- Security: safe HTML is parsed conservatively and rendered only after a narrow DOMPurify tag/attribute allowlist; ambiguous or executable input remains editable CodeMirror source and is never serialized from sanitized DOM
- Deliberate scope: scalar metadata forms are omitted until their interaction model has exact CST-range patch evidence; the declared `@lezer/yaml` parser is currently used only to classify syntax validity and never to regenerate YAML
- Next: Task 13 appearance, width, and responsive document controls

## Task 13 — Appearance, width, and responsive document controls

- Status: complete
- Commit: `feat: add document appearance and width controls`
- Changed paths: host-validated appearance settings, Quick Pick commands, accessible document controls, responsive shell/typography styles, semantic scroll anchoring, H1–H6 projection, table-local overflow, and webview/visual/platform tests
- RED: appearance tests initially failed because the control, layout, and scroll-anchor modules did not exist; follow-up cases exposed the missing table overflow wrapper, incomplete H4–H6 projection, and command-palette workflows that focused controls without presenting a choice
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, 53 unit tests, 8 protocol tests, 42 fidelity tests, and production builds
  - `npm run test:webview` — 45 tests passing
  - `npm run test:visual` — 4 deterministic theme/state and production-CSS baselines passing
  - `npm run test:visual:browser` — 2 Playwright tests passing in real Chromium across the full viewport/theme/appearance/width matrix, including measured local table/code overflow and reduced motion
  - focused Task 13 suites — 20 tests passing across appearance commands, projection, webview appearance, and visual CSS
  - VS Code integration test compiles and covers all appearance/width command values as source-neutral; native Electron execution is currently blocked on this host by missing `libnspr4.so`, and a containerized Xvfb attempt hung before Mocha output
- Covered boundaries: vscode/document × auto/readable/full × 320/768/1440 width model, 960 default, 480–2400 validation, full-width cap bypass, accessible wrapped controls, Quick Pick routing, no EditorView recreation, text/selection/history/pending-patch neutrality, zoom-aware keyed source anchors, disconnected-view cancellation, local table overflow, local fonts, reduced motion, visible focus, high-contrast tokens, and Document H1–H6/table/block hierarchy
- Deliberate evidence boundary: Playwright now measures production CSS layout and theme behavior in real Chromium; native VS Code/Electron pixel screenshots remain a Task 16 release gate because the host runtime lacks `libnspr4.so`
- Next: Task 14 durable file preferences and multi-view presentation sync

## Task 14 — Durable file preferences and multi-view presentation sync

- Status: complete
- Commit: `feat: remember document view preferences outside Markdown`
- Changed paths: versioned view-preference protocol, workspace/global sparse preference store, document-session lifecycle, rename/delete/Save As migration, synchronized provider broadcasts, runtime syntax-reveal facet, reset commands, ADR-012, and unit/protocol/webview/integration tests
- RED: preference suites initially failed because the store, protocol messages, and syntax-reveal reconfiguration did not exist; follow-up cases exposed stale panel URIs after rename, directory-descendant migration, Save As close-event races, future-record preservation, and document-lifetime cleanup while remembrance is disabled
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, unit/protocol/fidelity suites, and production builds
  - `npm run test:webview` — pass, including live syntax-reveal policy changes without source or selection edits
  - `npm run test:visual` — 4 deterministic theme/state and production-CSS baselines passing
  - focused preference suites — 18 tests passing across store, protocol, and webview behavior
  - `npm run build:integration` — pass; the native lifecycle suite compiles against the VS Code extension host
  - independent read-only review — approved with no remaining Critical or Important findings
- Covered boundaries: full URI identity for duplicate basenames and remote authorities, dynamic workspace/global scope, sparse overrides and configuration inheritance, future schema preservation, security-field rejection, serialized concurrent writes, 1,000-record LRU, session-only disabled remembrance, document-close cleanup, dormant durable restoration, confirmed untitled Save As promotion, exact and directory rename migration, independent copies, deletion pruning, file/workspace reset, split-view convergence, protocol-version rejection, and source-neutral manual/selection/active-block syntax reveal
- Deliberate evidence boundary: native VS Code/Electron execution is blocked before Mocha by the host's missing `libnspr4.so`; a containerized Xvfb attempt also stalled before test output. Deterministic unit, protocol, webview, visual, and compiled integration coverage is recorded without claiming native lifecycle execution.
- Next: Task 15 accessibility, keyboard, IME, and clipboard hardening

## Task 15 — Find, outline, command completeness, and accessibility

- Status: complete
- Commit: `feat: complete keyboard navigation and accessible controls` (with a focused runtime-configuration follow-up)
- Changed paths: rendered/source find and disjoint source highlights, cached heading outline and fragment navigation, complete command/settings registry, active-view command leases, stale-safe async insertion, keyboard table traversal, dialog/listbox/live-region semantics, focus styles, and `docs/accessibility.md`
- RED: navigation and accessibility suites initially failed because find/outline modules and command/configuration contracts did not exist; follow-up RED cases exposed hidden widget/source text leaking into rendered find, astral/combining word-boundary errors, outline DOM churn and narrow-pane coverage, divergent Setext/inline-heading fragments, stale cross-view actions, prompt-cancel insertion, stranded dialog focus, last-cell table data loss/focus loss, silent slash navigation, and inert HTML/source-island settings
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, 76 unit tests, 11 protocol tests, 43 fidelity tests, and production builds
  - `npm run test:webview` — pass; 66 webview tests
  - `npm run test:visual` — pass; 5 deterministic theme/state/focus baselines
  - focused Task 15 suites — 50 tests passing across commands, navigation, accessibility, dialogs, preferences, tables, and HTML/source-island behavior
  - `npm run build:integration` — pass
- Covered boundaries: visible text vs literal source search, bare/autolink URLs, escapes, reference definitions, hidden frontmatter/Mermaid/math/HTML attributes, source islands, disjoint highlights, Unicode whole words, next/previous/count/case filters, ATX/Setext/duplicate slugs, cached active-heading changes, narrow drawer collapse, all §22 command IDs and scoped shortcuts, cross-panel Quick Pick leases, stale image/link operations, prompt cancellation, table Tab/Shift+Tab with atomic last-cell append, live option/move/status announcements, labelled dialogs/grids/tasks, visible overlay focus, high-contrast tokens, reduced motion, and source/selection/history neutrality
- Review: independent read-only review found no Critical issues and ten Important gaps; the single fix pass added a failing regression for each affected behavior before implementation. Two Minor findings remain deferred: `DocumentFind.destroy()` relies on editor destruction to discard highlights, and Open Rendered relies on VS Code rejecting unsupported non-Markdown inputs.
- Environment boundary: `npm run test:visual:browser` and native `npm run test:integration` cannot launch Chromium/VS Code on this host because `libnspr4.so` is missing. Native screen-reader/AT-SPI smoke is unavailable in the headless environment. Deterministic DOM/CSS checks and the compiled integration suite pass; no native assistive-technology result is claimed.
- Next: Task 16 hardening, recovery stress, property testing, corpus expansion, and performance evidence

## Task 16 — Hardening, security, recovery stress, and performance

- Status: complete for deterministic and compiled gates; native/cross-platform release evidence remains explicitly unavailable
- Commit: `test: harden fidelity and release reliability` (implementation checkpoint `6eb5d14`; verification report follow-up)
- Changed paths: golden mixed-syntax corpus, seeded fast-check properties, strict/bounded protocol schemas, sender-bound replay handling, recovery lifecycle and user choices, composition deferral, large-document source fallback, resource-client cleanup, CSP/security/license checks, disk/remote-workspace integration cases, synthetic benchmark, and `docs/delivery/verification.md`
- RED: focused suites initially failed because the corpus/property/stress/IME/recovery cases, 4 MiB protocol boundary, CSP regression, dependency-license check, and benchmark did not exist; follow-up cases exposed replay collisions across views/generations, changed duplicate payloads, queue poisoning, duplicate external deliveries, recovery rename/delete gaps, and resource-client timeout cleanup
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, 89 unit tests, 32 protocol tests, 55 fidelity tests, 242 production dependency license records, and production builds
  - `npm run test:webview` — pass; 74 deterministic webview tests
  - `npm run test:visual` — pass; 5 deterministic theme/state/focus baselines
  - `npm run build:integration` — pass; BOM/CRLF/no-final-newline no-touch, bounded edit, Save All, >4 MiB fallback, and non-file document cases compile but were not executed
  - `npm run bench` — pass; p95 9.80 ms at 10 KiB, 56.01 ms at 100 KiB, 507.05 ms at 1 MiB, and 33.73 ms for the 100 KiB synthetic typing proxy
- Covered boundaries: LF/CRLF, BOM/no-BOM, final/no-final newline, mixed Markdown features, exact inverse/outside-range equality, seeded Unicode/EOL coordinates, block-core preservation, projection purity, delayed/out-of-order/duplicate/stale messages, authenticated view generations, bounded untrusted text/replay/resource/draft queues, per-view recovery and atomic clear ordering, recovery inspection/copy/reload/discard, rename/delete recovery records, unsafe HTML/URL/resource inputs, symlink confinement, packaged CSP construction, resource timeout/disposal, and complete-source fallback for oversized documents
- Security exception: `npm audit --omit=dev` reports two low-severity findings in Mermaid's nested KaTeX 0.16.47. The automated remedy is a breaking Mermaid downgrade, so the finding remains documented for deliberate dependency remediation; strict local rendering configuration reduces exposure but is not represented as resolving the advisory.
- Review: independent read-only review identified recovery, generation, IME, outbound-size, event-correlation, replay-memory, and resource-bound defects; the TDD fix pass resolved every Critical/Important finding, and the final re-review approved the slice.
- Evidence boundary: Chromium and native VS Code 1.141.0 both fail before tests because this WSL2 host lacks `libnspr4.so`. VS Code 1.102, Node 22, Windows, macOS, native Linux, real IME, and screen-reader smoke were unavailable and are not claimed. See `docs/delivery/verification.md`.
- Next: Task 17 packaged VSIX, user documentation, package inspection, and clean-profile installation evidence

## Task 17 — Packaged VSIX, user docs, and installation evidence

- Status: package complete and structurally verified; native clean-profile interaction smoke remains
  explicitly unavailable on this host
- Changed paths: strict `.vscodeignore`, version-derived package/checksum tooling, ZIP content policy
  test, generated third-party notices, extension metadata/icon, README/changelog/security/privacy,
  syntax/contributor guidance, marketplace capture policy, and install evidence
- RED: `scripts/checkPackage.test.mjs` initially failed because no package validator existed; the first
  package attempts also exposed a VSCE dependency-mode entrypoint failure and a sandbox-incompatible
  external `unzip` subprocess, resolved with bundled-extension packaging and in-process ZIP inspection
- Historical package evidence (superseded candidate; no longer present at the current artifact path):
  - `npm run package` — pass; 282 files, 4,182,803 bytes
  - `npm run check:package` — pass; manifest/runtime/user/legal/icon/local-assets allowlist validated
  - SHA-256 — `6f18bd356d0415406f6d1adacafd5815c836d968f837f1398d4b59cdec5aa4c5`
  - `sha256sum -c` and `unzip -t` — pass
  - dependency notices — 242 production records represented by 86 exact installed license texts
- Publisher boundary: `markami-dev` is documented as local testing only and must be replaced by the
  owner's verified publisher before public delivery; no Marketplace ownership or publication is claimed
- Installation boundary: isolated WSL remote CLI could not connect to its IPC socket; the cached native
  VS Code 1.141.0 CLI then failed before startup because `libnspr4.so` is absent. Install/open/edit/save/
  undo/offline-widget/uninstall checks and actual-product captures remain unexecuted and are not claimed.
- Upgrade boundary: no prior packaged preview exists, so upgrade/migration behavior is untested for this
  first VSIX
- Review fix: Vite now emits relative webview asset URLs; the validator resolves CSS URLs plus
  JavaScript static imports, re-exports, dynamic imports, and `new URL` references inside the VSIX;
  packaging launches npm/VSCE through Node for Windows compatibility
- Final gates: `npm run verify` passed (89 unit, 32 protocol, 55 fidelity, 5 package-policy tests,
  242 production license records, lint/type/build); `npm run test:webview` passed 74 tests;
  `npm run test:visual` passed 5 tests; `npm run build:integration` passed
- Review: independent read-only review approved the final slice with no Critical or Important blockers
- Evidence: see `docs/delivery/install-smoke.md`
- Next: Task 18 release automation and owner-authorized Marketplace delivery

## Task 18 — Gated release automation and Marketplace preparation

- Status: locally installable; Marketplace release prepared; public release deliberately blocked
- Changed paths: manual protected release workflow, scheduled/PR security workflow, deterministic
  release preflight and tests, environment-selectable VS Code integration runner, publisher-neutral
  package inspection, locked tagline, release runbook, release evidence, and regenerated checksum
- RED:
  - preflight tests initially failed because clean-revision and exact-tag validators were not exported
  - OIDC coverage initially failed because the validator did not require both GitHub token-request
    values
  - public prerelease coverage initially reached generic blockers instead of rejecting Marketplace-
    incompatible semantic prerelease versions before provider invocation
- GREEN:
  - `npm run verify` — pass; lint, strict typecheck, 89 unit, 32 protocol, 55 fidelity, 5 package-
    policy, 10 release-preflight tests, 242 production license records, and deterministic builds
  - `npm run test:webview` — pass; 74 tests
  - `npm run test:visual` — pass; 5 deterministic baselines
  - `npm run build:integration` — pass
  - `npm run bench` — pass; opening p95 27.56 ms at 10 KiB, 105.56 ms at 100 KiB, and
    517.39 ms at 1 MiB; typing proxy p95 38.41 ms
  - `actionlint .github/workflows/*.yml` and `git diff --check` — pass
  - `npm audit --omit=dev --audit-level=high` — pass threshold; two documented low KaTeX findings
    remain for explicit owner acceptance or remediation
- Historical artifact evidence (superseded candidate; no longer present at the current artifact path):
  282 files, 4,182,803 bytes, SHA-256
  `6f18bd356d0415406f6d1adacafd5815c836d968f837f1398d4b59cdec5aa4c5`; strict package policy,
  checksum, ZIP integrity, and credential-free artifact preflight passed
- Reproducibility evidence: two consecutive clean packaging executions used
  `SOURCE_DATE_EPOCH=315532800` and produced the identical byte size and SHA-256 above
- Fail-closed evidence: preparation reports all six open Marketplace gates; public mode rejects the
  development publisher/open checklist; source mode rejects the dirty working revision; tests cover
  invalid/mismatched version, placeholder/lookalike repository hosts, checksum or release-note
  evidence corruption, orphan listing captures, missing tag, tag not at HEAD, missing OIDC values,
  and Marketplace semantic prereleases
- Workflow contract: exact tag assertion, clean source, full quality/browser/benchmark/security
  gates, stable Linux/Windows/macOS plus VS Code 1.102 integration matrix, package-once artifact,
  protected GitHub/Marketplace environments, job-scoped permissions, OIDC trusted publishing, and
  public gallery artifact download/revalidation
- Host boundary: Playwright Chromium and cached VS Code 1.141.0 again stopped before tests because
  `libnspr4.so` is unavailable; native platform, clean-profile, actual-product capture, IME, and
  screen-reader gates remain unchecked and therefore block public delivery
- Owner inputs still required: controlled Marketplace publisher, trusted-publishing policy,
  protected-environment reviewers/tag restrictions, approved listing/version, actual captures,
  native/manual evidence, low-advisory decision, release tag, and explicit push/publish authorization
- Publication boundary: no tag was created, no push occurred, no remote workflow ran, and no GitHub
  release or Marketplace listing is claimed
- Initial review fixes: every third-party workflow action is pinned to a reviewed commit SHA;
  repository parsing requires the exact `github.com` host; approved captures must be referenced by
  listing content; release-note size/SHA are validated against the candidate; and the GitHub Release
  job independently revalidates its downloaded VSIX, checksum, and notes
- Final review: independent read-only re-review approved the slice with no Critical or Important
  blockers after reproducible ZIP timestamps and visible release-note evidence validation were added

## Task 19 — Repository audit remediation

- Status: complete for deterministic and package gates; native/browser platform evidence remains unavailable
- Changed paths: bidirectional protocol validation, image paste-directory wiring and confinement,
  strict-fidelity contract cleanup, pinned/expanded CI, Node/config metadata, Mermaid SVG sanitization,
  single-pass unknown-syntax discovery, tests, and release evidence
- RED: host-message tests accepted malformed state, image copies ignored the configured destination,
  CI used mutable action tags and omitted webview/main regression gates, the manifest exposed an inert
  fidelity setting and an underspecified Node floor, Mermaid SVG entered the DOM unsanitized, and the
  100 KiB typing proxy reproduced a 60.83 ms p95 miss
- GREEN: focused protocol/resource/configuration/sanitizer/fidelity tests pass; the final optimized
  typing proxy measured 34.73 ms p95 against the 50 ms target
- Security ruling: Mermaid 12.1.0 has no supported non-breaking release that removes its bundled
  vulnerable KaTeX. SVG output is sanitized at insertion as a tested compensating control; the low
  advisory remains visible rather than being masked by an ineffective lockfile override.
- Race ruling: VS Code exposes no versioned compare-and-swap edit. The adapter revalidates version and
  exact source before dispatch, verifies canonical text afterward, rejects mismatch while preserving
  recovery state, and retains minimum-version/platform race checks as release gates.
- Final gates: `npm run verify` passed with 95 unit, 34 protocol, and 56 fidelity tests; webview,
  deterministic visual, benchmark, package policy, artifact preflight, and high-severity audit
  thresholds passed. The final VSIX contains 282 files (4,210,591 bytes), SHA-256
  `5d4d2d2e7af358503e47838e36f912d7638fcb6fb27d1a9bcc730da5bfd48051`.
- Review: independent read-only re-review found no remaining Critical or Important code blockers after
  protocol recovery, symlink confinement, SVG URL sanitization, and artifact-evidence fixes.

## Task 20 — Marketplace Entra federation workflow

- Status: workflow and local authentication contract validated; no workflow was dispatched and no
  publication is claimed
- RED: release-preflight coverage initially accepted GitHub OIDC inputs when `AZURE_CLIENT_ID` was
  absent; the workflow-scope regression test then caught Azure credentials and login being attached
  to the quality job instead of the protected Marketplace job
- GREEN: publish preflight now requires GitHub's OIDC token-request values plus
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`
- Workflow contract: the protected `vscode-marketplace` job maps the three environment secrets,
  authenticates through SHA-pinned `azure/login` v3.1.0, and publishes with
  `vsce publish --azure-credential`
- Gates: `npm run verify` (including 11 release tests), `npm run test:webview` (74 tests),
  `npm run test:visual` (5 tests),
  `npm run build:integration`, `npm run bench` (typing p95 22.39 ms), `npm run package`,
  `npm run check:package`, artifact preflight, checksum verification, ZIP integrity, `actionlint`,
  and `git diff --check` passed
- Artifact evidence: 282 files, 4,210,591 bytes, SHA-256
  `5d4d2d2e7af358503e47838e36f912d7638fcb6fb27d1a9bcc730da5bfd48051`
- External boundary: local checks cannot prove the Entra federated credential or the managed
  identity's Marketplace Contributor membership; the first protected workflow run is the live
  authentication probe
- Publication boundary: the development publisher, release approvals, actual-product captures,
  and checklist remain fail-closed blockers; no commit, tag, push, dispatch, or publish occurred

## Task 21 — Owner-controlled Marketplace publisher

- Status: canonical publisher migrated to `shipsolid`; package identity and local release evidence
  validated; no Marketplace publication is claimed
- RED: the repository-level release-preflight test reported both the `markami-dev` development
  publisher and pending release-evidence identity
- GREEN: `package.json`, release evidence, installation guidance, public extension ID, and the
  protected workflow input consistently use `shipsolid`; `markami-dev` remains in the preflight
  denylist and negative tests
- Artifact evidence: the VSIX contains 282 files (4,210,587 bytes), with SHA-256
  `7216ae9dbecfded8135c0a493ceb4564bea20bedeb9d5e4270fb111fb329c69f`; both embedded manifests name
  publisher `shipsolid`; two consecutive packaging runs produced the same size and digest, and package
  policy, checksum, ZIP integrity, and artifact preflight passed
- Automated gates: `npm run verify` passed with 95 unit, 34 protocol, 56 fidelity, 5 package, and 12
  release tests; webview passed 74 tests; deterministic visual passed 5 tests; integration compilation
  passed; benchmarks passed with 34.71 ms typing p95
- Host boundary: `npm run test:integration` and `npm run test:visual:browser` were attempted, but the
  cached VS Code and Chromium binaries exited with code 127 before test execution because
  `libnspr4.so` is unavailable; neither gate is claimed as passing locally
- Remaining preflight blockers: public release/listing approval, actual Marketplace captures, and
  unchecked manual evidence; managed-identity Marketplace membership still requires a live protected
  workflow probe
- Publication boundary: no commit, tag, push, workflow dispatch, GitHub release, or Marketplace
  publication occurred

## Task 22 — Marketplace listing and exact-VSIX capture automation

- Status: implementation and local deterministic gates complete; capture workflow not dispatched and
  listing images not yet visually approved
- RED: Marketplace contract tests initially failed because capture names, PNG dimensions, gallery
  generation, packaged-extension runner, and review-PR workflow did not exist
- Listing contract: 0.1.0 is a Preview with the approved title, searchable description, free pricing,
  dark navy banner, categories, keywords, icon, privacy/security links, and MIT license
- Capture contract: manual default-branch workflow packages the VSIX, extracts `extension/`, runs that
  packaged surface in VS Code stable under a 1440×900 Xvfb display, validates three PNGs, and opens a
  review PR that updates the README gallery
- Artifact evidence: the updated Preview metadata package contains 282 files (4,210,861 bytes), with
  SHA-256 `78769743b641bbf1818bbe543734cbc39c407fcd1aea3e38691bf2bb2fde6727`
- Automated gates: `npm run verify`, 74 webview tests, 5 deterministic visual tests, capture/integration
  compilation, actionlint, package policy, artifact preflight, and benchmark passed; typing proxy p95
  was 35.87 ms
- Host boundary: native integration and Playwright browser execution remain unavailable locally because
  the downloaded Electron/Chromium runtimes cannot load `libnspr4.so`; GitHub-hosted release runners
  retain both gates
- Approval boundary: the workflow cannot set `listing_approved: true`; a human must review and merge
  its artifact/PR before release evidence may be approved
- Publication boundary: no local commit, push, workflow dispatch, tag, GitHub release, or Marketplace
  publication occurred

## Task 23 — CI repair and release-path audit

- Status: complete on PR #2 (unmerged); all 7 GitHub checks pass, including the new Windows and macOS
  integration legs; GitHub environment settings are documented but not applied
- Trigger: `CI` failed on all 13 runs since `c494e49` on 2026-10-08 (last green: `ac80497`); `Release` and
  `Marketplace captures` had never run; the view-preference and disk-fidelity integration tests had
  only ever been compiled, never executed (see Tasks 12–19 host boundary)
- Root causes (each reproduced before fixing; native VS Code 1.141.0 under Xvfb in the pinned
  Playwright Ubuntu container):
  - `scripts/gitRevision.test.mjs` read `.git` as a file, so it passed only inside a linked worktree
    and failed with `EISDIR` on a normal checkout (CI, and the main checkout)
  - disk-fidelity tests computed edit offsets from the BOM-prefixed disk bytes, but VS Code strips the
    BOM from document text: `# HEdited` and `Two  edited ` were off by one
  - "disabled remembrance" test called `openTextDocument`, which pins the model in the extension host
    for minutes, so `closeAllEditors` never closed the document the test is about
  - `markami.*` commands returned `true` for an active webview that had not sent `ready`; the posted
    message was then dropped or delivered depending on timing (a real contract defect, not only a test race)
  - `ViewPreferencesStore.get()` rewrote storage on every read to refresh LRU recency. VS Code's
    extension-host memento replaces its whole value when it echoes an older storage change, so a read
    could resurrect records a newer update or reset had removed (lost update; seen as `width` surviving
    `resetWorkspaceViewPreferences`)
- RED:
  - `node --test scripts/gitRevision.test.mjs` failed with `EISDIR` on the main checkout
  - `ActiveViewTracker` readiness tests failed (`markReady is not a function`)
  - `reads_never_write_storage…` failed: five reads caused five storage writes
  - integration: 3 deterministic failures plus 1 intermittent in the container, matching the CI logs
- GREEN:
  - `ActiveViewTracker` only exposes an active view after the webview `ready` handshake and revokes it
    (and outstanding leases) on webview reload; `ViewPreferencesStore.get()` records recency in memory and
    folds it into the next real write; the integration tests wait for readiness through
    `test/integration/support.ts`, compute offsets from document text, and open the source side with
    `vscode.openWith` instead of `openTextDocument`
  - `npm run verify` — pass (101 unit, 38 protocol, 56 fidelity, 5 package, 13 release, 11 marketplace tests)
  - `npm run test:webview` 77 passed; `npm run test:visual` 5 passed; `npm run test:visual:browser` 2 passed;
    `npm run bench` passed; `npm audit --omit=dev --audit-level=high` exit 0 (2 low Mermaid/KaTeX advisories);
    `npm run generate:notices` leaves `THIRD_PARTY_NOTICES.txt` unchanged; `actionlint` clean
  - VS Code 1.141.0 integration, 18 of 18 passing in 40 consecutive full runs on the final tree (30 at
    2 CPUs, 10 at 1 CPU); before the store fix the same setup failed about one run in four, and before the
    suite-level warm-up about one in twenty (the first custom editor of a fresh instance was sometimes never
    resolved, so `test/integration/suite/index.ts` now proves the webview pipeline once, with retries,
    before any test runs)
- Product defects found by an independent read of the extension host, each reproduced in native VS Code
  before fixing:
  - dirty-state flips (first edit, save, revert) fire `onDidChangeTextDocument` with no changes and an
    unchanged version; the host forwarded them as `documentChanged`, and the webview answered with the
    read-only "The file changed while markami had unacknowledged edits" banner after only a host edit and
    a save (screenshots of the pre-fix and post-fix builds). Fixed host-side (no-op events are dropped) and
    webview-side (an already-acknowledged change is ignored, only a true conflict raises the banner)
  - VS Code reports a multi-change edit in descending offset order while the webview sends ascending
    patches, so echo suppression failed for any edit with two or more patches (bold toggle, multi-cursor,
    replace-all) and peers received the change twice; patch sets are now compared order-independently
  - a CRLF document with no line break hydrated the webview as LF, so the first Enter was normalized by
    VS Code and rejected as a canonical mismatch; the host now sends the document's real EOL
  - every keystroke re-asked the host to resolve every image (cache key included the image position and
    the cache was cleared on each edit), which with the default `remoteImages: prompt` raised a modal per
    remote image per keystroke; resolutions are now keyed by destination and kept while still present
  - behind a symlinked workspace root, resolved images lay outside the lexical `localResourceRoots`
    (images failed to load) and picking an image wrote a link such as `../../real/images/x.png`; the
    resolver now returns the lexical path and links are relative to the document's real directory
  - not changed, owner decision: `package.json` declares no `capabilities`, so Restricted Mode disables
    the extension although spec §38.6 describes safe editing in untrusted workspaces
- Release-path evidence gathered without publishing:
  - every pinned action SHA resolves, and each matches its version comment, including `azure/login` v3.1.0
  - the same source packaged under Node 24.21 and Node 22.23 gives a byte-identical VSIX, so the digest
    recorded in release notes will survive the CI toolchain
  - the Marketplace capture workflow steps ran end to end in a container: 3 PNGs generated from the
    packaged VSIX and validated; the capture suite now waits for webview readiness, closes the Chat panel,
    and clears host toasts before each capture
- Workflow edits: CI integration job now runs on Linux, Windows, and macOS (previously first exercised
  by a tag-only Release run); the Release Marketplace job allows 30 minutes and retries the public
  download for about 15 minutes with `--compressed`; `.github/dependabot.yml` keeps pinned actions current
- Audit findings requiring owner action (documented in `docs/releasing.md`, not applied here):
  - `vscode-marketplace` has custom deployment policies enabled with none defined (every deployment
    is rejected), no required reviewer, and admin bypass on; `github-release` does not exist
  - Actions cannot create pull requests, which the Marketplace captures workflow needs
  - a local ignored `.env` holds a `VSCE_PAT`; the OIDC design needs no PAT, so revoke it
  - public release remains blocked by owner-gated items: release-note and listing approval, reviewed
    Marketplace captures, native smoke/IME/accessibility evidence, publisher Contributor membership
    for the managed identity, and tag authorization
- GitHub CI on PR #2: the new Windows leg passed all 18 tests but failed two teardown hooks with
  `EBUSY` on `rmdir` because VS Code still held document handles; every integration teardown now removes
  its directory through a retrying helper, after which all checks (verify, three integration legs,
  dependency-policy, CodeQL) pass
- Publication boundary: the changes are pushed on a branch and open as PR #2; no merge, tag, workflow
  dispatch, GitHub release, or Marketplace publication occurred

## Task 24 — Mermaid sanitizer and first captures run

- Status: fix complete on its own PR; the first Marketplace captures PR (#4) must be regenerated after it
- Trigger: the first `Marketplace captures` run succeeded end to end, but the generated
  `technical-markdown.png` showed Mermaid labels starting at their node centres and overflowing the
  boxes, with black arrowheads; the same diagram reproduced in the container and in plain Chromium with the
  production bundle
- Root cause: Mermaid 12's embedded stylesheet contains same-document `url(#<id>-gradient)` references.
  `sanitizeMermaidSvg` removed the whole `<style>` whenever it saw any `url(`, discarding the diagram's
  `text-anchor`, font, and theme rules. Every Mermaid diagram in the extension was affected, not only the
  listing image
- RED: `keeps Mermaid's own stylesheet when it only references same-document paint servers` failed; the
  guard that mixed local and external references must still be removed already passed
- GREEN: stylesheets and inline styles are kept when every `url(` is a bare `#fragment`, and removed when
  any is external, escaped, or paired with `@import`, `image-set(` or `-moz-binding`. In the production
  bundle under Chromium all node labels measure 0 px off centre with `text-anchor: middle` in both
  appearances
- Also observed in the draft captures, left for the owner's review: the left block-handle gutter renders as
  a bright strip in the dark theme, and the table and selection controls use default white button styling
- Publication boundary: no tag, release, or Marketplace publication occurred

## Task 25 — Release gates automated and evidence recorded

- Status: complete on `main`; the release is blocked only on native IME and screen-reader smoke and on
  tag authorization
- Added `npm run smoke:install` (tested helpers, `scripts/installSmoke.test.mjs`): checksum, isolated
  install, integration suite against the installed VSIX, uninstall, native reopen with unchanged bytes
- Added `test/visual-browser/technical.spec.ts`: production webview with every non-local request aborted;
  Mermaid, math, and code render and Mermaid labels stay centred. It fails on the pre-fix sanitizer and
  passes on the fix
- CI now also runs a VS Code 1.102.0 integration leg, the browser spec, and an `install-smoke` job; CI run
  38039775318 passed all of them on `main`
- Release notes: every checklist item with evidence is ticked with its scope, `listing_approved` is
  true, and the preflight blockers are reduced to the final approval flag and the two unchecked items
- Not done and not claimed: real IME and screen-reader smoke on native hosts; Windows and macOS install
  smoke; any tag, Release run, or Marketplace publication


## Task 26 — Published 0.1.0 Preview to the Visual Studio Marketplace

- Status: complete; `shipsolid.markami@0.1.0` is public and installable
- Trigger: the owner authorized the tag, Release dry run, and publish; the dry run (run 38040998182) built
  an artifact whose digest equalled the release notes; the publish run 38041187851 from tag `v0.1.0`
  waited at the protected `vscode-marketplace` environment until the owner approved it
- Result: every step of the `marketplace` job succeeded: artifact and federation revalidation, Azure OIDC
  login, `vsce publish --azure-credential`, and the public-download package check. The Contributor
  membership that could not be read back is thereby proven
- Verification after publish: the public `vspackage` is 4,211,965 bytes with the recorded SHA-256; a clean
  VS Code 1.141.0 profile installs `shipsolid.markami@0.1.0` from the Marketplace; 279 of 280 files equal
  the public VSIX (the other is `package.json` plus VS Code's `__metadata`; the installer adds
  `.vsixmanifest`); the gallery lists the version as `validated`, public, preview, with README, changelog,
  license, icons, and links
- Evidence boundary: the integration suite was not re-run against the Marketplace-installed copy (the
  bytes equal the artifact that passed `smoke:install`); the first gallery lookup failed with "not found"
  while the version was still `Verifying`, and a TLS-intercepting proxy on the owner's network needed
  its CA passed to the verification container
- Recorded in `docs/delivery/release-notes.md` under Publication record; no GitHub release was created

## Task 27 — Close the post-publish follow-ups

- Status: complete on the PR that adds it; nothing here changes the published 0.1.0 artifact
- Windows and macOS install smoke: `scripts/installSmoke.mjs` could not start the Windows `.cmd` shim; added
  `cliInvocation` (RED: the export did not exist; GREEN: POSIX direct, Windows through a shell with cmd.exe
  quoting, unsafe `"` and `%` refused). CI now packages once on Linux, uploads the VSIX, and an
  `install-smoke` matrix on ubuntu, windows, and macos downloads it with the same upload/download actions as
  `release.yml` (run 38048808722: checksum verified, 16 integration tests against the installed VSIX, clean
  uninstall on all three). The matrix doubles as the handoff test for action bumps
- Dark-theme polish: `test/visual-browser/themedControls.spec.ts` runs the production webview under dark,
  light, and high-contrast token sets (harness extracted to `productionWebview.ts`, shared with
  `technical.spec.ts`). RED: the gutter painted CodeMirror's `rgb(245, 245, 245)` and every button painted
  the browser default `rgb(239, 239, 239)`. GREEN: the CodeMirror theme takes the gutter from
  `--vscode-editorGutter-background`, and one element-level `button` rule uses the secondary-button tokens
  with a contrast border in high contrast. The spec also asserts 4.5:1 text contrast and checks the handle menu
- Not covered: the find box, link/image popover, and slash palette were themed by the same rule but only the
  handle menu is exercised by the spec; text inputs inside popovers were not restyled
- GitHub release v0.1.0 created from the tagged artifact (run 38048666102); its body was replaced because the
  tagged notes predate publication. Tracking issue #8 holds the waived native IME and screen-reader smoke
- The published 0.1.0 listing images still show the old gutter and buttons; they change only when a new
  version is published and the captures are regenerated
- Dependabot PR #3 (checkout 7.0.1, setup-node 7.1.0, upload-artifact 7.0.2, download-artifact 8.0.2,
  codeql-action 4.38.2) was rebased onto the new CI and merged after every SHA was checked against its release
  tag. Its CI ran the new upload and download actions through the package-to-install-smoke hand-off on Linux,
  Windows, and macOS, and the Security workflow ran CodeQL v4; main is green on the merge commit. The Release
  workflow itself has not run with these versions: `release.yml` in tag v0.1.0 still pins the old ones, and the
  first release from a newer tag is their real exercise
- Branch cleanup: remote `fix/mermaid-stylesheet-sanitizer` deleted (the audit branch was already gone); merged
  local branches and the two clean worktrees removed. The two `automation/marketplace-captures-*` remote
  branches (one merged PR, one closed superseded PR) were left

## Task 28 — Rendering defects found in a real journal note (change A of the UI pass)

- Status: committed as 0be47c4. Change B (design system, docked outline, Document default, palette) is Task 29
- Evidence: rendering a journal-like note in the production webview showed inline marks with no CSS at all
  (`markami-strong`, `-emphasis`, `-strike`, `-inlineCode` computed to weight 400/normal), VS Code appearance
  headings identical to body text (13px, 400), a code header 39.7px taller than its content (two empty line
  boxes around an inline widget) and offset 6px from the code lines, a leftover empty line after every closing
  fence, a per-line horizontal scroller on each long code line, and `---` shown literally
- RED: `test/visual-browser/documentRendering.spec.ts` (11 cases across both appearances) failed on each
  defect (weight 400, header gap 39.7px/50.4px, overflowing lines, `accent-color: auto`, divider text `---`,
  h1 size not greater than h2); unit RED in `test/webview/projection.test.ts` (divider tokens) and
  `test/unit/commands.test.ts` (wrap default)
- GREEN: inline-mark rules; the code header is a block widget and the closing fence line is the card's 8px
  bottom edge; code lines wrap by default (`markami.codeBlock.wrap` now `true` in the manifest, configuration
  fallback, webview initial state, and the spec); the divider's source hides until the caret touches it and a
  rule is drawn; VS Code appearance heading steps and the quote bar; checkbox `accent-color`. The harness
  gained an `appearance` option and a shared Dark+ token set
- Gates: `npm run verify` passes; `test:webview` 78/78; `test:visual` 5/5; all 19 browser specs pass in the
  Playwright container, including the pre-existing technical, appearance, and themed-controls specs
- Not done here, deliberately: list markers still show a literal `-`; indented (nested) list lines get no list
  class; vertical gaps between blocks come from blank source lines at full height; the outline still overlays
  the content; table and handle chrome is unchanged. These belong to change B and the later chrome step

## Task 29 — Document appearance as a designed reading view (change B of the UI pass)

- Status: committed on main in eight steps (defaults, fonts, fenced-code fix, typography, outline frontmatter fix,
  palette, outline docking); not pushed or released. Nothing here changes the published 0.1.0 artifact
- Defaults: `markami.appearance.mode` is `document` and `markami.document.maxContentWidth` is 1200 (the 960px cap
  would have clipped the 100ch measure). Unit and native integration expectations that encoded the old defaults
  were changed first and failed; existing per-file overrides are untouched
- Fonts: `@fontsource-variable/shantell-sans` and `jetbrains-mono` 5.3.0 as production dependencies, imported as
  local woff2 (Latin, Latin Extended, Cyrillic, Vietnamese, and Greek for the mono face; Shantell italic for
  emphasis). The VSIX grows from 4.21 MB to 4.53 MB. The SIL Open Font License was not on the license allowlist;
  `scripts/licensePolicy.mjs` accepts it only for `@fontsource` packages (RED: module missing), the package policy
  requires both fonts in the VSIX (RED: no exception), and `THIRD_PARTY_NOTICES.txt` carries each font's license
  and copyright. Owner approval for the allowlist change was given with the plan
- Found while styling, fixed separately with failing tests first: the projection styled and hid syntax inside
  fenced code (a `# comment` became a heading with its marker hidden; present since 0.1.0), and the outline read
  frontmatter as a Setext heading. The fence scanner moved into core
- Typography and spacing (`document.css`): `documentDesign.spec.ts` failed first on all nine cases and now
  asserts the type scale at 600/700/800px panes, h2/h3, lists, tables, the blank-line rhythm (24px, 16px under
  h1/h2, 12px under h3), mono for inline code and labels, the 100ch measure with 16/24px padding, and the
  12px-radius cards. Spacing is padding plus the source's blank lines, never margins on CodeMirror lines
- Palette: the Catppuccin Mocha palette is a remap of the VS Code tokens on the body, applied only in Document
  appearance under a dark (not high-contrast) theme; `documentPalette.spec.ts` asserts the colors, a 4.5:1 floor
  for text, links, buttons, and the active outline entry, the light, high-contrast, `vscode`-setting, and VS Code
  appearance opt-outs, and the runtime appearance switch
- Outline: docked column at 1280px and above (260px, 300px from 1760px, 40px gap), a pill below; the narrow
  drawer is session-only so it can no longer overwrite the per-file collapsed state
- Gates: `npm run verify`, `test:webview` (86), `test:visual` (5), `bench`, `npm run package` (policy passed), all
  45 browser specs in the Playwright container, and the 18 native VS Code integration tests (VS Code 1.141.0,
  Linux, container). Windows and macOS integration run in CI only
- Judgment calls to confirm: the h2 gets a 1px rule under its 12px bottom padding; the outline card uses 8px
  padding rather than 24px; code blocks use JetBrains Mono rather than the editor font in Document appearance; the
  left sidebar column of the three-column layout is not rendered because an editor has nothing to put there
- Not done: list markers still render as a literal `-`; table, block-handle, and Copy chrome is always visible
  (the planned hover/focus-only step needs accessibility checks); the published listing images still show the
  0.1.0 look until a new version is released and the captures regenerated
- Regression caught by the main CI bench (run 38053278923: typing p95 50.62 ms against the 50 ms target; the same
  code had passed at 39.93 ms and 49.43 ms on two other runs): the fenced-code skip added in the fence fix scanned
  every fence for every line and every inline match, so projection was quadratic in the number of fences. Locally,
  before the fix: 1 MiB open median 346 to 355 ms on the previous commit and 887 to 1155 ms on the regression,
  typing median 18.5 ms against 23.5 ms. The fence ranges are sorted and disjoint, so they are now looked up by
  binary search: 1 MiB median 352 to 373 ms, typing median 19.2 to 20.0 ms. The projection tests that pin fence
  boundaries (`lines_touching_a_fence...`) were added before the refactor and stayed green

