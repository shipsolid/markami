# Accessibility

markami keeps the VS Code text document canonical while presenting Markdown through a keyboard-operable webview. Accessibility defects that could cause a source change are treated as fidelity defects.

## Keyboard workflows

| Workflow | Keyboard interaction | Focus after completion or cancellation |
|---|---|---|
| Save | `Ctrl+S` / `Cmd+S` | Editor |
| Find rendered document text | `Ctrl+F` / `Cmd+F` | Find field; `Enter` moves forward, `Shift+Enter` moves backward, `Escape` returns to the editor |
| Find Markdown source | Run **markami: Find in Markdown Source** | Same behavior as document-text find |
| Bold / italic / link | `Ctrl+B`, `Ctrl+I`, `Ctrl+K` / Command equivalents | Editor; link `Escape` cancels and restores editor focus |
| Reveal current block source | `Ctrl+Shift+M` / `Cmd+Shift+M` | Editor |
| Selection toolbar | Run **markami: Show Selection Toolbar**, then use Left/Right arrows and `Enter` or `Space` | `Escape` returns to the editor |
| Slash insertion | Type `/` in an eligible empty paragraph, then use Up/Down and `Enter` | Editor; `Escape` closes without changing typed source |
| List editing | `Enter`, `Tab`, and `Shift+Tab` | Editor |
| Block movement | `Alt+Up` / `Alt+Down`, or use a block action button and its toolbar | Editor; `Escape` cancels drag or closes the toolbar |
| Image and link fields | Tab through labelled fields and buttons; submit with `Enter` | `Escape` cancels and restores editor focus |
| Mermaid, math, and safe HTML source | Focus the rendered block and press `Enter` or `Space` | Source selection in the editor |
| Outline | Tab to **Outline**, expand or collapse it, then activate a heading | Editor caret at the heading source offset |

VS Code command keybindings are scoped to `activeCustomEditorId == markami.editor`; they do not replace shortcuts in the native text editor or other custom editors. Every command remains available from the Command Palette.

## Semantics and announcements

- The editor mount is labelled **Markdown document**.
- Find and link/image forms use labelled non-modal dialog semantics. Find counts and active match positions use a polite status region.
- Formatting and block controls use labelled toolbar semantics. Toggle formatting buttons expose `aria-pressed`, including the mixed state.
- Slash commands use listbox/option semantics, a roving tab stop, selection state, and an active descendant.
- Rendered task markers remain native checkboxes with action-specific labels and checked state.
- GFM tables expose grid, row, column-header, and grid-cell roles with row/column counts, indices, and header-derived cell labels.
- Block moves and cancellations are announced through a polite live region. Color is supplementary; status text carries the result.
- The outline is a labelled navigation region. The active heading uses `aria-current="location"`, and the collapse control exposes `aria-expanded`.
- Unsupported source islands remain CodeMirror text rather than an inaccessible rendered substitute.

## Display behavior

- Controls use VS Code foreground, background, border, focus, warning, and high-contrast tokens.
- Keyboard focus is visibly outlined for controls inside the document shell and for floating find, outline, toolbar, slash, block, link, and image controls.
- The layout remains bounded at 320 CSS pixels. The outline overlays the document on narrow panes instead of reducing the writing column.
- VS Code zoom scales the webview normally. Wide tables and code blocks scroll locally.
- `prefers-reduced-motion: reduce` disables presentation transitions and forced smooth scrolling in the document surface.

## Verification boundary

Automated jsdom and browser checks cover labels, roles, checked/pressed/current state, keyboard activation, Escape focus restoration, tab stops, live-region text, high-contrast token use, reduced motion, and narrow-pane layout. These checks do not emulate a native screen reader or VS Code/Electron accessibility tree.

Native screen-reader smoke testing is not recorded as passing on the current headless Linux environment: no desktop screen reader or AT-SPI session is available, and the installed Electron runtime cannot start because `libnspr4.so` is missing. Before a public release, run the keyboard workflows above in VS Code with NVDA or Narrator on Windows, VoiceOver on macOS, and Orca on a Linux desktop where supported. Record the VS Code version, OS, screen reader/version, focus order, announcements, and any workaround in the release verification report.
