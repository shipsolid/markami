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
