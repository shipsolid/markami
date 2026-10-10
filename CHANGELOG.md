# Changelog

All notable changes to markami are documented here.

## Unreleased

### Changed

- Fenced code blocks wrap long lines by default (`markami.codeBlock.wrap` now defaults to `true`), so a long
  command or token no longer gets its own horizontal scrollbar on every line.

### Fixed

- Bold, italic, strikethrough, and inline code are styled; the markers were hidden but nothing replaced them,
  so formatted text looked plain.
- A fenced code block renders as one card: the header, code lines, and closing edge share one background and
  edge, with no gaps above or below the header and none left by the hidden closing fence.
- In VS Code appearance, headings step in size and weight and block quotes show their bar.
- A `---` divider draws a rule instead of showing its dashes until the caret is on it.
- Task checkboxes follow the theme accent colour.
- The block-handle gutter and every button (table controls, code copy, outline, handle menu, popovers)
  follow the active VS Code theme. They previously showed CodeMirror's light grey gutter strip and
  browser-default white buttons in dark and high-contrast themes.

## 0.1.0 — 2026-10-10

Preview release.

### Added

- Source-preserving rendered editing for CommonMark, GFM, tables, technical blocks, frontmatter,
  safe HTML, and unknown-syntax source islands.
- Synchronized multi-view edits, save/undo integration, external-change conflict handling, and local
  recovery drafts.
- Slash commands, selection toolbar, block movement, outline, rendered/source find, accessible
  dialogs, keyboard table traversal, and file-scoped presentation preferences.
- Local Mermaid, KaTeX, syntax highlighting, fonts, strict CSP, resource policy, and offline widgets.
- Deterministic fidelity, protocol, webview, visual, property, stress, security, license, and benchmark
  evidence.
- Runtime validation for host-to-webview messages, configurable workspace-relative image paste
  destinations, and sanitized Mermaid SVG insertion.

### Known limitations

- IME composition and screen-reader behavior are covered by automated tests but were not verified on
  native assistive technology; the owner accepted that gap for this Preview.
- Files larger than 4 MiB UTF-8 fall back to the native source editor.
- Desktop local-filesystem workspaces are the initial supported platform; browser extension hosts are
  deferred and remote workspaces are best-effort.
- The integration suite passes on Windows, macOS, and Linux and on VS Code 1.102 and stable, and the
  installed VSIX was smoke-tested on Linux. Hand-driven GUI interaction smoke and Windows/macOS installs
  are not recorded, and no prior version exists to test an upgrade against. Details are in
  `docs/delivery/install-smoke.md`.
- Mermaid's bundled KaTeX dependency currently carries two documented low-severity audit findings.
  Mermaid SVG is sanitized before insertion as a compensating control; the available automated fix
  is a breaking downgrade and has not been applied silently.
