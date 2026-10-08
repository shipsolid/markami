# Changelog

All notable changes to markami are documented here.

## 0.1.0 — 2026-10-09

Developer-preview VSIX for local evaluation.

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

### Known limitations

- The package uses the local-only `markami-dev` publisher and is not a Marketplace release.
- Files larger than 4 MiB UTF-8 fall back to the native source editor.
- Desktop local-filesystem workspaces are the initial supported platform; browser extension hosts are
  deferred and remote workspaces are best-effort.
- Native Windows/macOS/Linux, IME, screen-reader, clean-profile GUI, and upgrade smoke evidence remains
  pending where documented in `docs/delivery/`.
- Mermaid's nested KaTeX dependency currently carries two documented low-severity audit findings; the
  available automated fix is breaking and has not been applied silently.
