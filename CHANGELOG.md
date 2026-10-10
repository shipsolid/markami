# Changelog

All notable changes to markami are documented here.

## Unreleased

### Changed

- The default appearance is a clean VS Code style, modelled on the VS Code Markdown preview and using your exact
  theme colors: UI font at 14px/1.6, ruled h1 and h2, compact lists, pill-style inline code, 4px quote bar, 26px
  page padding with room to scroll past the last line. The Shantell Sans and Catppuccin Mocha Document appearance
  from 0.1.1 stays available as an opt-in style (`markami.appearance.mode`). `markami.theme.useEditorFont` now
  defaults to `false` so prose uses the UI font.
- The in-page Appearance / Width / Maximum bar is gone. The editor title bar gets icons: **Toggle Document
  Appearance** and **Open Source Editor** in the rendered editor, and **Open Rendered Editor** on Markdown text
  editors. Width and maximum width remain settings and palette commands.
- The editing surface no longer draws a focus ring; the caret marks focus, as in VS Code's own editor.

## 0.1.1 — 2026-10-10

Preview release. Document appearance becomes the default and a designed reading view; rendering defects found
in real notes are fixed.

### Changed

- Document appearance is the default and is a designed reading view: Shantell Sans body and headings at 17–18px
  with 1.9 line height, JetBrains Mono for code, labels and metadata, a 100ch reading measure, and 12px-radius
  cards with 24px padding for code, tables, diagrams, math and frontmatter. A blank source line is the
  paragraph gap, tightening under headings. Both fonts are bundled locally (+0.5 MB, SIL Open Font License).
  `markami.appearance.mode` now defaults to `document` and `markami.document.maxContentWidth` to 1200;
  VS Code appearance remains available.
- Document appearance uses the Catppuccin Mocha palette when VS Code uses a dark theme. It is a remap of the VS Code
  theme tokens, so the outline and popovers follow it; light and high-contrast themes and VS Code appearance keep
  your theme's colors. Set `markami.document.palette` to `vscode` to opt out.
- The outline docks as a 260px column (300px from 1760px) with a 40px gap in panes at least 1280px wide, so it no
  longer covers the document or its Copy buttons. Narrower panes show a small pill that opens a drawer; the drawer
  is session-only and never overwrites the per-file collapsed state.
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
- Fenced code is literal: a `# comment` line no longer renders as a heading with its marker hidden, and `>`, `-`
  or `**` lines inside a code block are no longer styled as quotes, lists, or bold. Nested list items are
  recognised as list lines.
- Frontmatter no longer appears as a heading in the outline.
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
