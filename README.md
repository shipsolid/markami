# markami

Edit Markdown where you read it.

markami is a source-preserving rendered Markdown editor for VS Code. The open
`vscode.TextDocument` remains canonical: markami applies validated local edits to the source and
never regenerates the document from a rendered tree.

> **Developer preview:** this repository packages local VSIX builds with the development publisher
> `markami-dev`. That identifier is not a claim to a Visual Studio Marketplace namespace. Replace
> it with the owner's verified publisher before any public release.

## What ships

- Rendered editing for CommonMark and GitHub Flavored Markdown, including lists, tasks, tables,
  links, images, code, math, Mermaid, alerts, and safe HTML.
- Source reveal for the active block, selection, or explicit command; unsupported and ambiguous
  syntax remains editable in a source island.
- A slash-command insertion menu, selection formatting toolbar, and source-preserving block handles.
- Outline navigation and rendered-text/source-text find.
- VS Code and Document appearance modes with Auto, Readable, and Full width controls.
- Per-file presentation preferences stored outside the Markdown source and synchronized across views.
- Conflict-safe external edit handling, bounded local recovery drafts, and native source fallback for
  documents larger than 4 MiB UTF-8.

See [syntax support](docs/syntax-support.md) for the detailed behavior and fallback matrix.

## Install a local build

Requirements: VS Code 1.102 or newer and a desktop local-filesystem workspace.

1. Download or build `artifacts/markami-<version>.vsix`.
2. In VS Code, run **Extensions: Install from VSIX…** and select the file.
3. Open a `.md` or `.markdown` file, run **Reopen Editor With…**, and select **markami**.

Command-line installation:

```bash
code --install-extension artifacts/markami-0.1.0.vsix
```

The extension does not silently replace the native Markdown editor. To opt in by default, use
**Reopen Editor With… → Configure default editor for '*.md'**. Use **markami: Open Source Editor**
at any time to return to the native text editor.

## Editing

- Type and select text directly in rendered blocks. `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, and `Ctrl/Cmd+K`
  share the same bounded source-edit operations as the toolbar.
- Type `/` in an empty top-level paragraph for the insertion menu. The command
  **markami: Open Slash Commands** remains available when the automatic trigger is disabled.
- Focus a supported top-level block to use its handle. Copy or reveal its Markdown, or move it with
  **Move Block Up**, **Move Block Down**, or **Move Block To…**.
- Use **Toggle Source Reveal for Current Block** when exact syntax is more useful than projection.
- Use **Find in Document Text** for visible content or **Find in Markdown Source** for literal source.
- Table cells support `Tab`/`Shift+Tab`; `Tab` from the last cell can append a row as one undoable edit.

Opening, changing appearance, revealing source, navigating the outline, and finding text do not edit
the document. Accepted edits participate in VS Code save, autosave, undo, redo, dirty state, and
multi-view synchronization.

## Appearance and file preferences

Use the document toolbar or these commands:

- **markami: Set Document Appearance** — VS Code or Document typography.
- **markami: Set Document Width** — Auto, Readable, or Full.
- **markami: Reset File View Preferences** — clear overrides for the active file.
- **markami: Reset Workspace View Preferences** — clear remembered overrides for the workspace.

Preferences never enter Markdown or frontmatter. Disable per-file persistence with
`markami.viewPreferences.rememberPerFile`; session changes continue to work.

## Resources, privacy, and offline behavior

- Relative links and local images are resolved by the extension host and constrained to the workspace.
- Remote HTTPS images follow `markami.remoteImages`: `block`, `prompt` (default), or `allow`.
- Mermaid, math, code highlighting, fonts, and editor assets are packaged locally and work offline.
- Unsafe URLs, executable schemes, unsafe HTML, and filesystem escapes fail closed while source stays
  editable.
- markami has no telemetry, account, cloud sync, or document upload. See [PRIVACY.md](PRIVACY.md).

## Fidelity boundaries

markami preserves untouched UTF-16 source ranges, line endings, BOM state, final-newline state, and
unknown syntax. An operation may normalize only its documented local construct (for example, a GFM
table changed structurally). If a safe mapping cannot be proven, strict mode leaves source visible
instead of guessing.

Files over 4 MiB UTF-8 open in the native source editor. Browser extension hosts are deferred; the
initial platform is desktop VS Code with local filesystem workspaces. MDX and custom directives are
preserved as source islands, not executed components.

## Recovery and troubleshooting

When an external edit overlaps unsynchronized local work, markami offers inspection, copy, reload,
or discard choices and never silently overwrites either version. Recovery drafts are local, bounded,
and separate from the Markdown file.

If rendering or editing behaves unexpectedly:

1. Run **markami: Open Source Editor** and confirm the canonical file is intact.
2. Run **markami: Show Diagnostics**. Diagnostics contain versions, counts, and feature state—not
   document content by default.
3. Disable the affected optional renderer (`markami.renderMermaid`, `markami.renderMath`, or
   `markami.renderSafeHtml`) and reopen the editor.
4. For remote images, inspect `markami.remoteImages` and workspace trust.

Report bugs at <https://github.com/shipsolid/markami/issues> with VS Code/OS versions, exact source or
a minimal redacted reproduction, the command or keystroke used, expected/actual behavior, whether the
native source changed, and reproduction steps from a clean profile. Never attach secrets or private
documents.

## Build and verify

```bash
npm ci
npm run verify
npm run test:webview
npm run test:visual
npm run package
```

`npm run package` builds production bundles, validates the VSIX allowlist, and writes a SHA-256 file
beside the versioned artifact. Contributor workflow and release evidence live in
[docs/contributing.md](docs/contributing.md) and [docs/delivery](docs/delivery/).

## License

markami is released under the [MIT License](LICENSE). Bundled dependency licenses are reproduced in
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
