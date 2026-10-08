# markami — End-to-End Implementation Plan

> **Product:** markami
>
> **Tagline:** Edit Markdown where you read it.
>
> **Revision:** 2 — 2026-10-07
>
> **Executor:** Codex. Read `spec.md` and execute the ordered tasks in §47; preserve existing phases as milestone descriptions.
>
> **Spec:** `./spec.md`
>
> **Implementation goal:** Build a source-preserving rendered Markdown editor as a VS Code custom text editor, from repository bootstrap through Marketplace release.

---

## 1. Architectural Thesis

markami must **not** use the conventional architecture:

```text
Markdown
  -> parse to rich document
  -> edit rich document
  -> serialize entire document back to Markdown
```

That model is convenient but conflicts with markami's defining source-fidelity contract.

Instead, use a **source-preserving projection architecture**:

```text
VS Code TextDocument (.md)  <-- canonical state
          |
          | source text + version
          v
  Incremental syntax model
          |
          v
 CodeMirror 6 editor surface
 + syntax-hiding decorations
 + rendered block widgets
 + source islands
          |
          | minimal source operations
          v
   Versioned text patches
          |
          v
 VS Code WorkspaceEdit
          |
          v
VS Code TextDocument (.md)
```

The visual editor is not an independent document model. It is an alternate interactive projection of the source document.

This is the most important implementation decision in the project.

---

## 2. VS Code Integration Strategy

Use VS Code's **Custom Text Editor** model.

### Provider

Implement:

```ts
vscode.CustomTextEditorProvider
```

and register it through:

```ts
vscode.window.registerCustomEditorProvider(...)
```

with a contributed custom editor for:

- `*.md`
- `*.markdown`

Recommended `viewType`:

```text
markami.editor
```

### Why CustomTextEditorProvider

Markdown is text. The standard VS Code `TextDocument` should remain authoritative so markami inherits the expected text-file lifecycle instead of reimplementing its own binary/custom document model.

Benefits:

- VS Code owns the underlying text document;
- normal dirty state remains meaningful;
- save/autosave stays compatible;
- filesystem changes surface through the document model;
- other extensions and source control still see the real file;
- the product does not need an independent persistence format.

### Webview

The custom editor view is a VS Code webview.

Use the webview only because a normal `TextEditor` cannot provide the required level of inline layout replacement and interactive rendered blocks.

The webview should contain:

- CodeMirror 6 editing surface;
- rendered widgets;
- lightweight toolbar/inline controls;
- optional outline;
- diagnostics overlays.

---

## 3. Recommended Technology Stack

### Extension host

- TypeScript
- VS Code Extension API
- esbuild for extension-host bundling
- Zod for webview messages; pin its compatible version at bootstrap

### Webview/editor

- TypeScript
- CodeMirror 6
- Vite for webview build
- CodeMirror Markdown / Lezer Markdown for incremental syntax information
- minimal framework usage; prefer framework-free CodeMirror + small UI components

React is not required for the core editor. If a component framework is later necessary for complex panels, keep it outside the document model.

### Semantic Markdown pipeline

Use a semantic parser/render pipeline for constructs that need richer interpretation than the live CodeMirror syntax tree provides.

Selected semantic pipeline:

- unified / remark ecosystem;
- `remark-parse`;
- `remark-gfm`;
- frontmatter plugin;
- optional math plugin;
- AST position metadata retained for source mapping.

Do **not** use remark serialization as the ordinary write path.

### Renderers

- Mermaid for `mermaid` fenced blocks;
- KaTeX for math;
- CodeMirror language/highlighter integration for code blocks; plain monospace fallback for unknown languages;
- DOMPurify or a strict allowlist sanitizer for optional safe HTML rendering.

### Testing

- Vitest for unit and property tests;
- `fast-check` for source-fidelity/property-based tests;
- VS Code extension test runner / `@vscode/test-electron` for integration tests;
- Playwright for browser-level webview interaction tests, alongside deterministic unit tests around CodeMirror state and protocol logic.

### Packaging

- `@vscode/vsce` for `.vsix` and Marketplace packaging;
- GitHub Actions for CI/release.

---

## 4. Repository Layout

Recommended initial structure:

```text
markami/
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml
│  │  ├─ release.yml
│  │  └─ security.yml
│  ├─ ISSUE_TEMPLATE/
│  └─ pull_request_template.md
├─ docs/
│  ├─ architecture.md
│  ├─ fidelity.md
│  ├─ security.md
│  ├─ syntax-support.md
│  └─ contributing.md
├─ fixtures/
│  ├─ commonmark/
│  ├─ gfm/
│  ├─ frontmatter/
│  ├─ mermaid/
│  ├─ html/
│  ├─ malformed/
│  ├─ line-endings/
│  └─ real-world/
├─ src/
│  ├─ extension/
│  │  ├─ extension.ts
│  │  ├─ MarkamiProvider.ts
│  │  ├─ DocumentSession.ts
│  │  ├─ DocumentSessionRegistry.ts
│  │  ├─ applyPatch.ts
│  │  ├─ commands.ts
│  │  ├─ configuration.ts
│  │  ├─ resources.ts
│  │  ├─ security.ts
│  │  └─ diagnostics.ts
│  ├─ protocol/
│  │  ├─ messages.ts
│  │  ├─ schemas.ts
│  │  └─ version.ts
│  ├─ core/
│  │  ├─ source/
│  │  │  ├─ SourceRange.ts
│  │  │  ├─ Patch.ts
│  │  │  ├─ PatchSet.ts
│  │  │  ├─ lineEndings.ts
│  │  │  └─ rebase.ts
│  │  ├─ markdown/
│  │  │  ├─ syntax.ts
│  │  │  ├─ semanticAst.ts
│  │  │  ├─ sourceMap.ts
│  │  │  ├─ dialect.ts
│  │  │  └─ featureRegistry.ts
│  │  └─ fidelity/
│  │     ├─ invariants.ts
│  │     └─ normalizations.ts
│  └─ webview/
│     ├─ main.ts
│     ├─ app.css
│     ├─ vscode.ts
│     ├─ bridge/
│     │  ├─ hostBridge.ts
│     │  ├─ patchQueue.ts
│     │  └─ syncState.ts
│     ├─ editor/
│     │  ├─ createEditor.ts
│     │  ├─ extensions.ts
│     │  ├─ keymap.ts
│     │  ├─ commands.ts
│     │  ├─ selection.ts
│     │  └─ viewport.ts
│     ├─ projection/
│     │  ├─ ProjectionPlugin.ts
│     │  ├─ syntaxReveal.ts
│     │  ├─ marks.ts
│     │  ├─ replacements.ts
│     │  └─ sourceIsland.ts
│     ├─ features/
│     │  ├─ headings/
│     │  ├─ emphasis/
│     │  ├─ lists/
│     │  ├─ tasks/
│     │  ├─ links/
│     │  ├─ images/
│     │  ├─ codeBlocks/
│     │  ├─ tables/
│     │  ├─ frontmatter/
│     │  ├─ mermaid/
│     │  ├─ math/
│     │  └─ html/
│     ├─ ui/
│     │  ├─ toolbar/
│     │  ├─ inlinePopover/
│     │  ├─ outline/
│     │  ├─ find/
│     │  └─ notifications/
│     └─ security/
│        ├─ sanitize.ts
│        └─ urls.ts
├─ test/
│  ├─ unit/
│  ├─ fidelity/
│  ├─ protocol/
│  ├─ webview/
│  └─ integration/
├─ media/
│  ├─ icon.png
│  └─ marketplace/
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ esbuild.mjs
├─ vitest.config.ts
├─ eslint.config.js
├─ .prettierrc
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ SECURITY.md
├─ PRIVACY.md
├─ spec.md
└─ impl.md
```

Keep `core`, `protocol`, extension-host code, and webview code logically separate even if they remain inside one npm package initially.

---

## 5. Package Manifest Design

`package.json` must contribute the custom editor and commands.

Illustrative shape:

```jsonc
{
  "name": "markami",
  "displayName": "markami",
  "description": "Edit Markdown where you read it — rendered editing without sacrificing source fidelity.",
  "engines": {
    "vscode": "^1.102.0"
  },
  "main": "./dist/extension.js",
  "activationEvents": [
    "onCustomEditor:markami.editor"
  ],
  "contributes": {
    "customEditors": [
      {
        "viewType": "markami.editor",
        "displayName": "markami",
        "selector": [
          { "filenamePattern": "*.md" },
          { "filenamePattern": "*.markdown" }
        ],
        "priority": "option"
      }
    ],
    "commands": [],
    "configuration": {},
    "menus": {},
    "keybindings": []
  }
}
```

During early development, keep priority `option`. Do not take over Markdown by default.

---

## 6. Core Data Model

### 6.1 Canonical state

The canonical state is always:

```ts
interface CanonicalDocumentState {
  uri: string;
  version: number;       // VS Code TextDocument.version
  text: string;
  eol: 'LF' | 'CRLF';
}
```

No ProseMirror/Tiptap/HTML representation is allowed to become canonical.

### 6.2 Source positions

Use host UTF-16 offsets on the wire, but distinguish them from CodeMirror offsets. CodeMirror counts a line break as one position; a raw host CRLF string occupies two UTF-16 units. Implement the explicit mapping in §6.5 before exchanging edits. Never pass a CodeMirror offset directly to `TextDocument.positionAt` in a CRLF file.

Define utilities for:

- offset → VS Code Position;
- VS Code Position → offset;
- source range transformation after edits;
- line/column mapping;
- handling surrogate pairs correctly.

### 6.3 Patch model

All visual operations ultimately produce patches.

```ts
interface TextPatch {
  from: number;
  to: number;
  insert: string;
}

interface PatchRequest {
  requestId: string;
  viewId: string;
  uri: string;
  baseVersion: number;
  patches: TextPatch[];
  reason:
    | 'typing'
    | 'delete'
    | 'paste'
    | 'format'
    | 'structure'
    | 'widget'
    | 'undo'
    | 'redo';
}
```

Patch invariants:

- sorted by `from`;
- non-overlapping;
- valid for `baseVersion`;
- no negative ranges;
- no out-of-bounds ranges;
- schema-validated in the extension host;
- transformed into a single logical VS Code workspace edit where possible.

### 6.4 Operation-level intent

The webview may internally represent semantic operations such as:

```ts
toggleStrong(range)
setTaskChecked(markerRange, true)
setHeadingLevel(blockRange, 2)
replaceLinkDestination(destRange, newHref)
insertTableRow(tableNode, index)
```

but before crossing into the extension host they should resolve to deterministic source patches.

This keeps the privileged extension side small and auditable.

---

### 6.5 Newline and source-coordinate adapter — mandatory early gate

Create `src/core/source/CoordinateMap.ts`. Maintain original decoded host text plus per-line host starts and EOL sequences; CodeMirror uses its logical line model. All patches crossing the protocol use host-text offsets. Local editor helpers use CodeMirror offsets and map before sending. Semantic AST offsets must declare whether their input was host raw text or logical text; normalize them through one adapter.

```ts
type HostOffset = number & { readonly hostOffset: unique symbol };
type EditorOffset = number & { readonly editorOffset: unique symbol };
interface CoordinateMap {
  toHost(offset: EditorOffset): HostOffset;
  toEditor(offset: HostOffset, affinity: 'before' | 'after'): EditorOffset;
  toHostPatch(patch: TextPatch, editorBefore: string): TextPatch;
}
```

Implement `createCoordinateMap(hostText: string): CoordinateMap`. Define positions inside CRLF as non-editable separator interiors; use affinity when importing a host selection there. Map old transaction ranges against the old map, then update map after applying accepted canonical text. Newline insertion uses `TextDocument.eol`; existing host EOL outside the patch is copied unchanged. One logical newline in CodeMirror is not evidence of one host UTF-16 unit.

Tests: `a\r\nb\r\nc` maps editor offset 4 to host offset 6; editing `c` affects host range `[6,7)`. Verify inverse positions, empty lines, final newline/no final newline, emoji, combining marks, CRLF deletion, multiline paste, BOM handled by host, and mixed separators where the host exposes them. Reconstruct expected disk bytes after save. `state.doc.toString()` is not a raw-file byte serialization.

### 6.6 Patch validation and limits

Use one patch validator for typing, widget, slash, formatting, and move actions. Reject NaN/fractional offsets, overlaps, duplicate request IDs with different payloads, wrong view/session identity, impossible lengths, and unsupported reason values. Consolidate multiple insertions at the same offset into a deterministic single insertion. Set a **4 MiB UTF-8** message payload limit for v1 and show a supported-size message for requests above it; never silently truncate. For files larger than the supported snapshot limit, offer the native source editor without sending a truncated snapshot.

Keep an idempotency cache of the last 256 completed requests per document session. A replay returns its original result without applying the source edit twice. Request identity is scoped to viewId/session generation, not document filename alone. Schema version mismatches stop mutation and trigger an explicit compatible resync path.

---

## 7. Document Session Architecture

Create one `DocumentSession` per `TextDocument` URI.

Responsibilities:

- serialize incoming patch requests;
- track attached webview instances;
- subscribe to `workspace.onDidChangeTextDocument`;
- broadcast canonical changes to every attached view;
- reject stale patch requests;
- supply full resync snapshots;
- manage resource resolution for the document;
- dispose when no view remains and no retained work is required.

Sketch:

```ts
class DocumentSession {
  readonly uri: vscode.Uri;
  private views = new Map<string, WebviewEndpoint>();
  private queue = Promise.resolve();

  attach(view: WebviewEndpoint): void;
  detach(viewId: string): void;
  enqueuePatch(request: PatchRequest): Promise<void>;
  handleDocumentChanged(event: vscode.TextDocumentChangeEvent): void;
  sendSnapshot(viewId: string): void;
  dispose(): void;
}
```

### Multi-view rule

All views render the same canonical `TextDocument`. Do not create a copy per view.

---

## 8. Webview ↔ Extension Protocol

Version the protocol from day one.

```ts
const PROTOCOL_VERSION = 2; // v2 adds host-owned view preferences to hydration
```

### Host → webview messages

```ts
HostMessage =
  | { type: 'hydrate'; protocolVersion; viewId; document; viewPreferences }
  | { type: 'documentChanged'; version; changes; originRequestId? }
  | { type: 'patchAccepted'; requestId; version }
  | { type: 'patchRejected'; requestId; reason; document? }
  | { type: 'viewPreferencesChanged'; viewPreferences }
  | { type: 'configurationChanged'; config }
  | { type: 'resourceResolved'; requestId; result }
  | { type: 'themeChanged'; theme }
  | { type: 'commandResult'; requestId; result }
  | { type: 'showError'; code; message };
```

### Webview → host messages

```ts
WebviewMessage =
  | { type: 'ready'; protocolVersion }
  | { type: 'applyPatch'; request: PatchRequest }
  | { type: 'requestSnapshot' }
  | { type: 'save' }
  | { type: 'openSourceEditor'; offset? }
  | { type: 'openLink'; href; sourceRange }
  | { type: 'resolveResource'; requestId; rawPath }
  | { type: 'log'; level; code; metadata }
  | { type: 'reportPerformance'; measurements };
```

Every inbound message must be schema-validated.

Never treat a webview message as trusted merely because the webview was created by the extension.

---

## 9. Synchronization Algorithm

### 9.1 Initial hydration

1. VS Code opens custom editor.
2. Provider attaches webview to the document session.
3. Webview loads bundled JS/CSS under restrictive CSP.
4. Webview posts `ready`.
5. Extension sends `hydrate` containing full source text and `TextDocument.version`.
6. Webview creates CodeMirror state and the coordinate map from exact host source; its logical newline model is mapped explicitly.
7. Projection decorations are computed.

### 9.2 User typing

1. User types in CodeMirror.
2. CodeMirror transaction modifies its local source document immediately.
3. Transaction filter/listener derives exact change ranges.
4. Webview sends `applyPatch(baseVersion = acknowledgedVersion)`.
5. Document session validates request.
6. If version matches, apply one `WorkspaceEdit`.
7. VS Code updates `TextDocument` and emits document-change event.
8. Session broadcasts the canonical change with `originRequestId`.
9. Originating view recognizes its own accepted change and advances acknowledged version without reapplying it.
10. Other views apply the canonical change to their CodeMirror documents.

### 9.3 Stale edit

If `request.baseVersion !== TextDocument.version`:

- reject patch;
- send current canonical snapshot or change set when rebase is safe;
- webview attempts deterministic rebase only if the pending edit ranges do not overlap external changes;
- otherwise show a conflict banner and preserve the user's temporary local text in memory until they choose a recovery action.

Never blindly apply a stale absolute range.

### 9.4 Echo suppression

Use `requestId`/`originRequestId` rather than boolean “ignore next change” flags. Multiple views and external edits make global ignore flags unsafe.

---

## 10. CodeMirror as the Source-Preserving Surface

CodeMirror 6 is the core enabling technology because it lets markami keep plain source text in the editor state while replacing or styling portions of the visible presentation.

Use:

- `Decoration.mark` for semantic formatting;
- `Decoration.replace` to hide syntax tokens;
- `Decoration.widget` for checkboxes, images, Mermaid, rendered math, table affordances, etc.;
- `Decoration.line` for headings/quotes/block styles;
- view plugins/state fields for incremental recomputation;
- viewport-aware decorations for heavyweight blocks.

The source text remains present in CodeMirror's document even when syntax characters are visually replaced.

---

## 11. Projection Engine

Create a `ProjectionPlugin` that converts source syntax into visual decorations.

Conceptual pipeline:

```text
CodeMirror state
   |
   +--> Lezer syntax tree --------------+
   |                                     |
   +--> selection / active block --------+--> ProjectionPlan
   |                                     |       |
   +--> semantic block cache ------------+       v
                                         DecorationSet
```

### ProjectionPlan

```ts
interface ProjectionPlan {
  marks: MarkDecoration[];
  hiddenTokens: HiddenToken[];
  lineStyles: LineStyle[];
  widgets: WidgetSpec[];
  sourceIslands: SourceIslandSpec[];
}
```

### Rules

- never create a replacement decoration across the current editable selection if doing so makes caret behavior ambiguous;
- syntax reveal depends on the active block and selected range;
- malformed regions receive fewer decorations, not more;
- widgets must always map back to stable source ranges or syntax-node identities;
- if mapping is uncertain, render a source island.

---

## 12. Active-Block Syntax Reveal

Recommended default:

```text
markami.syntaxReveal = activeBlock
```

States:

- **inactive block:** maximize rendered appearance;
- **active block:** reveal only syntax required for unambiguous editing;
- **source reveal:** show raw syntax for entire block;
- **source island:** raw source because no safe visual representation exists.

Implementation:

1. determine block syntax node containing primary selection head;
2. store `activeBlockRange` in a state field;
3. projection rules check overlap with this range;
4. active-block decorations omit hiding/replacing ambiguous syntax tokens;
5. selection changes trigger projection recomputation without changing document text.

This yields a live rendered editing interaction while remaining one editor. `selection` reveals syntax only where it intersects the selection and its confirmed enclosing construct; `manual` keeps supported constructs projected until explicit source reveal. Unknown/ambiguous islands remain source-editable in all policies, and caret safety may expose syntax even under manual policy rather than trap selection. Preference policy changes are projection-only transactions.

---

## 13. Feature Implementation Details

## 13.1 Headings

### Visual projection

For ATX headings:

```md
## Architecture
```

- hide `##` and following spacing when inactive;
- apply heading typography to the line;
- retain source line exactly.

For Setext headings:

```md
Architecture
============
```

- style as heading;
- suppress underline marker visually when inactive;
- preserve style unless heading-level command intentionally transforms it.

### Editing

Typing heading text patches only text content.

Changing level through a command may replace the heading marker range. Do not rewrite the heading body.

---

## 13.2 Emphasis

Use syntax tree ranges to identify opening/closing delimiters and content.

- apply strong/emphasis/strike mark to content;
- replace delimiters visually when safe;
- keep original delimiters in source;
- toggle command reads existing delimiter form before editing.

New syntax defaults:

- strong: `**text**`;
- emphasis: `*text*`;
- strike: `~~text~~`.

Existing syntax should be preserved.

---

## 13.3 Inline Code

- hide backtick delimiters;
- style content as inline code;
- delimiter length must be preserved for existing spans;
- when inserting content containing backticks, choose a valid delimiter length without touching neighboring source.

---

## 13.4 Lists

### Visuals

- suppress raw bullet marker when inactive;
- display normal list marker through styling/widget;
- preserve indentation and marker style in source.

### Enter behavior

Implement custom command using current list item's source structure:

- non-empty item → insert newline + same indentation + appropriate marker;
- empty item → remove marker and exit list;
- nested item → retain nested indentation;
- ordered list → configurable behavior: preserve source numbering by default; new item can increment visible number while respecting Markdown semantics.

Do not globally renumber existing ordered lists.

---

## 13.5 Task Lists

Detect task marker source range:

```text
[ ]
[x]
[X]
```

Replace marker with an accessible checkbox widget.

On toggle:

- patch only one marker character when possible;
- preserve surrounding whitespace;
- use `[x]` for newly checked state by default;
- preserve `[X]` if user manually authored it and toggles through an option if desired.

The checkbox widget must stop event propagation so clicking does not accidentally reposition the caret unpredictably.

---

## 13.6 Links

Projection:

- hide brackets/destination for inactive normal links;
- style label;
- attach metadata for destination.

Editing:

- click/select label normally;
- `Ctrl/Cmd+Click` requests host to open the resolved link;
- `Ctrl/Cmd+K` opens inline link popover;
- changing URL patches only destination range;
- changing label edits label source;
- removing link deletes only syntax wrappers/destination while retaining label.

Reference-style links must preserve reference syntax. Do not silently convert them to inline links.

---

## 13.7 Images

Detect normal and reference-style images.

Inactive:

- render image widget when resource resolution succeeds;
- display alt text placeholder on failure;
- never delete source because an image is missing.

Focused:

- display controls for alt text, path, title, open asset, and source reveal;
- text-field edits map to exact source ranges.

Resource resolution must happen through the extension host.

---

## 13.8 Fenced Code Blocks

Prefer keeping actual code text as CodeMirror text rather than putting a nested CodeMirror instance inside every code block.

Projection strategy:

- hide/opening and closing fences when inactive;
- decorate code lines with block background and monospace styling;
- show language badge as a widget near opening fence;
- keep inner code directly editable in the primary CodeMirror surface;
- when caret approaches boundary, reveal fence information as needed.

Benefits:

- no nested-editor focus complexity;
- source ranges remain natural;
- copy/paste and selection work across block boundaries.

Mermaid is a special case because its inactive representation becomes a rendered diagram.

---

## 13.9 Mermaid Blocks

For fenced `mermaid` blocks:

### Inactive

- replace block interior + fences with a block widget only when the caret/selection is outside the block;
- widget renders Mermaid SVG locally;
- cache by hash of source + theme;
- offscreen rendering can be lazy.

### Active

- remove replacement widget;
- reveal the source code block in-place;
- optionally show a non-editable preview widget after the block;
- debounce Mermaid parsing/rendering 150–300 ms.

### Failure

Display render error with **Edit source** action. Never mutate the Mermaid source in response to parse errors.

---

## 13.10 Tables

Tables are the highest-complexity standard feature.

Implement in two stages.

### Stage A — visualized source table

- detect GFM table;
- style rows/cells in the primary CodeMirror surface;
- suppress some pipe/alignment syntax where caret-safe;
- keep content directly editable;
- provide row/column commands.

### Stage B — grid widget

If Stage A UX is insufficient, implement an inactive table widget with editable cell controls.

Each cell must retain a source mapping.

Operations:

- cell content edit → patch cell range;
- alignment edit → patch delimiter row cell;
- insert/delete row → patch table block only;
- insert/delete column → may rewrite the table block, but not the rest of the document.

A table rewrite must preserve:

- surrounding blank lines;
- line-ending style;
- content text;
- alignment intent.

Avoid supporting merged cells in GFM mode.

---

## 13.11 Frontmatter

Do not parse YAML into an object and serialize it back for normal editing.

Architecture:

- identify exact frontmatter source block;
- show compact metadata header when valid;
- for scalar field edits, use a YAML concrete-syntax-tree or targeted source-range patch;
- for comments/anchors/complex values/parse ambiguity, use source reveal;
- editing raw frontmatter should use the primary CodeMirror source text.

If introducing a YAML parser, choose one capable of retaining CST/token ranges. Never use lossy JSON conversion.

---

## 13.12 Math

- detect syntax conservatively;
- inactive expression may be replaced with KaTeX widget;
- active expression reveals source delimiters and text;
- rendering errors show a warning without changing source.

Dollar-sign ambiguity must bias toward not rendering.

---

## 13.13 Raw HTML

Maintain raw source as canonical.

Three classifications:

1. known safe/simple HTML → sanitized visual render when inactive;
2. complex but non-executable HTML → source island by default;
3. explicitly dangerous/executable HTML → source island only.

Never serialize sanitized DOM back into Markdown source.

---

## 13.14 Unknown / Custom Syntax

Any syntax range the parser cannot confidently project becomes a Source Island.

Source Island implementation:

- use primary CodeMirror text with special block styling where possible;
- avoid nested editor unless widget architecture requires it;
- badge: `Markdown source`, `Unknown directive`, `MDX`, etc.;
- source remains editable;
- re-evaluate block after changes.

This mechanism is not a failure state. It is an intentional safety feature.

---

## 13.15 Shared action registry and floating toolbar

Create `src/webview/editor/actionRegistry.ts` and `src/core/markdown/formatting.ts`. One action registry serves toolbar, slash palette, shortcuts, and explicit host-dispatched commands.

```ts
interface ActionContext {
  hostVersion: number;
  editorRevision: number;
  selection: { anchor: number; head: number };
  source: string;
  capabilities: Readonly<Record<string, boolean>>;
}
interface PlannedEdit {
  patches: TextPatch[]; // editor offsets until coordinate adapter conversion
  selectionAfter: { anchor: number; head: number };
  allowedRanges: { from: number; to: number }[];
  label: string;
}
type ActionResult = { ok: true; edit: PlannedEdit } | { ok: false; reason: string };
interface EditorAction {
  id: string;
  label: string;
  isAvailable(ctx: ActionContext): boolean;
  plan(ctx: ActionContext, args?: unknown): ActionResult;
}
```

UI owns interaction, core planners own syntax decisions, bridge owns synchronization. `planInlineFormat(ctx, kind)` supports `strong`, `emphasis`, `strike`, `code`, `link`, and `clear`. Preserve existing delimiters; reject ambiguous partial unwraps. Heading conversion calls `planHeading(ctx, level: 0|1|2|3|4|5|6)`, with 0 meaning paragraph. A link dialog is asynchronous UI that revalidates its captured selection before planning.

Implement `src/webview/ui/toolbar/SelectionToolbar.ts`. Capture editor revision and selection; pointer buttons prevent the initial mousedown from collapsing the editor selection. Explicit keyboard invocation may move focus to the toolbar but retains an anchor snapshot. Use `coordsAtPos`, viewport intersection, and collision handling to place the toolbar; remeasure after scroll, resize, zoom, width, and theme changes. Hide during composition/drag; invalidate on overlapping canonical edits. Use `aria-pressed`, mixed-state labels, roving tabindex, and Escape focus restoration.

Do not persist toolbar selection in file preferences. Multi-range selections and selections crossing unknown islands are ineligible; show disabled reasons through accessible text. All action paths must produce the same source patches for the same input. Opening the toolbar produces no transaction with docChanged.

## 13.16 Slash palette and deterministic insertion

Create `src/webview/ui/slash/SlashPalette.ts`, `src/core/markdown/insertBlock.ts`, and `src/webview/editor/slashState.ts`. Trigger eligibility comes from the parser plus current editor revision, not a regex over the rendered DOM. State holds `{from, to, query, editorRevision, hostVersion}` and is mapped through compatible local edits.

`planInsertBlock(ctx, kind, args): ActionResult` consumes the trigger range or explicit supported insertion point. Use defaults: bullet `- `, ordered `1. `, task `- [ ] `, quote `> `, divider `---`, backtick code fence with language, table `| Column 1 | Column 2 |` plus alignment/header/body lines, Mermaid starter `flowchart TD` with `A --> B`, math `$$` with an empty editable expression. Host EOL conversion occurs at the patch boundary. Insert only enough local separators to avoid accidental Markdown merging. Raw Markdown invokes source reveal and removes the active slash query only after acceptance.

Local image selection uses a host request/result message, not browser filesystem access. URL insertion validates allowed image schemes and honors remote policy. Dialog cancellation leaves original trigger text. Math is absent when disabled. Palette search matches case-insensitive label/keywords, preserves deterministic ordering, and returns no-results state.

Do not modify the document merely to open/filter/dismiss the palette. Typed slash/query characters are ordinary text edits. Acceptance is one structural transaction that replaces the active query range; Undo restores that range as it was immediately before acceptance. Revalidate at commit if dialog focus allowed source changes meanwhile.

## 13.17 Block index, exact-source moves, and handles

Create `src/core/markdown/blockIndex.ts`, `src/core/markdown/moveBlock.ts`, and `src/webview/ui/blocks/BlockHandles.ts`. Build the move index from versioned top-level syntax; never infer ownership from DOM paragraphs. Record core range, adjacent separator ranges, pinned status, and structural confidence.

```ts
interface MovableBlock {
  id: string;
  kind: string;
  version: number;
  core: { from: number; to: number };
  separatorAfter: { from: number; to: number };
  movable: boolean;
}
interface MoveRequest {
  blockId: string;
  targetBoundary: number;
  hostVersion: number;
}
function planBlockMove(source: string, blocks: readonly MovableBlock[],
  request: MoveRequest): HostActionResult;
```

`planBlockMove` is the explicit raw-host-coordinate planner: `source`, core/separator ranges, and targetBoundary refer to acknowledged host text. Define `HostPlannedEdit` with `patches: TextPatch[]`, `allowedRanges`, a host-offset `selectionAfter`, and `label`; define `HostActionResult = {ok:true;edit:HostPlannedEdit}|{ok:false;reason:string}`. Do not send its patches through the editor-to-host newline converter again. Move controls wait for local typing to settle before capturing the host-versioned block index. Map accepted host selection back into CodeMirror afterwards.
+
+Other formatting/insertion planners use logical editor coordinates through `ActionResult` and the normal coordinate adapter. This distinction is explicit to prevent CRLF moves from losing original separators.
+
+Core ranges include complete container/fence text but exclude inter-block blank-line separators. Compute an owned move slice using the core plus its following separator when present. At EOF with no separator, move the exact core and add only required seam separators at destination. Preserve the removed slice's exact text wherever syntactically safe. Plan against old source offsets; deletion and insertion are separate non-overlapping patches in one request, with deterministic same-position merging if needed. The moved core remains byte-identical; seam normalization is bounded and surfaced to UI.

Before acceptance, simulate the patches and parse the neighborhood around both seams. Verify the moved core's kind/content and untouched neighbors' syntax identities; allow ordering changes but reject interpretation changes. A top-level list moves as a whole. Unknown islands require trusted boundaries. Frontmatter stays pinned. Reject targets inside the source range, ambiguous containers, and targets that would move a heading as an implicit section.

Handle state derives from editor selection/hover. Legal targets are top-level boundaries including document end after pinned metadata. Overlay gutter and insertion-line geometry must come from CodeMirror measurements. Auto-scroll is requestAnimationFrame-based, cancelled on Escape/dispose. Any docChanged event during drag cancels. A keyboard move command uses the same planner, applies one history step, and maps the caret into the moved block. Test identical results for pointer and keyboard operations.

---

## 14. Semantic Parser Strategy

Use two layers carefully.

### Layer 1 — incremental interaction parser

CodeMirror/Lezer provides:

- fast syntax tree updates;
- source positions;
- token identification;
- active-block projection;
- common Markdown structure.

### Layer 2 — semantic renderer parser

Unified/remark pipeline provides:

- GFM semantics;
- frontmatter recognition;
- richer AST for heavyweight block renderers;
- extension points.

### Avoid parser divergence

The source is always authoritative. If the two parsers disagree about a range:

- do not transform it structurally;
- fall back to a source island;
- optionally log a diagnostic in debug mode.

The semantic AST must never be used to replace the whole document source.

---

## 15. Minimal-Patch Algorithms

Create a dedicated `core/source` library and test it heavily.

### 15.1 Replace text

```ts
replaceRange(from, to, insert)
```

### 15.2 Wrap selection

```ts
wrapRange(range, open, close)
```

Must account for selections already inside matching delimiters.

### 15.3 Unwrap construct

Remove only known opening/closing delimiter ranges.

### 15.4 Insert block prefix

For heading/list/quote operations, insert or replace prefix on affected lines only.

### 15.5 Multi-line operations

Represent as a PatchSet and apply from highest offset to lowest when performing local transformations, or rely on VS Code range semantics through one `WorkspaceEdit`.

### 15.6 Table block rewrite

Treat table rewrite as an explicit normalization boundary. Tests must assert that the rewrite starts and ends exactly at the table range.

---

## 16. Undo/Redo Strategy

This area must be implemented deliberately.

### Requirements

- visual operations are undoable;
- source and visual state stay synchronized;
- menu/command undo does not create a second diverging history;
- external text changes remain representable.

### Required model and empirical gate

Use VS Code document history as the single canonical undo authority. Route markami-focused undo/redo requests to the appropriate host `undo`/`redo` command for the active custom editor and receive the resulting TextDocument event. Do not enable an independent CodeMirror history that submits inverse edits as new host edits; that creates two conflicting histories.

Prototype routing on the declared minimum and current stable VS Code with source/custom/split views. Flush or settle queued typing before undo. Show a synchronization state while waiting; do not undo unrelated active-file edits. Formatting, slash acceptance, task toggle, and block move must each form one verified logical step. WorkspaceEdit undo grouping is an empirical requirement, not an assumption that every keystroke can be merged through a public API.

If host command routing or grouping does not meet the acceptance criteria, stop feature expansion, document the observed failure in ADR-009, and resolve the provider/bridge design. Do not quietly ship a CodeMirror-only fallback or mark history passed after checking only the visual text. Verify both disk/host text and source-editor redo after visual undo.

### Transaction annotations

Annotate transactions with:

- local user edit;
- remote/canonical sync;
- projection-only state change;
- undo/redo;
- composition.

Canonical sync transactions must not be re-sent as new user patches.

---

## 17. IME and Composition

IME correctness is mandatory for global usability.

Rules:

- do not rerender/recreate the editor during active composition;
- avoid projection changes that replace DOM under the composition range;
- queue conflicting external document changes until composition end when safe;
- after composition completes, reconcile against canonical version;
- include Japanese/Chinese/Korean composition tests.

CodeMirror already handles much of input composition, but markami's decoration and sync layers must not interfere.

---

## 18. External Change Handling

Subscribe to:

```ts
vscode.workspace.onDidChangeTextDocument
```

For each event affecting a session:

1. capture exact VS Code content changes;
2. convert `Range` to old-document offsets carefully;
3. tag origin if associated with a pending markami request;
4. broadcast canonical change to all attached views;
5. views map decorations/selection through changes;
6. invalidate semantic render caches intersecting changed ranges.

### Full resync conditions

Use a full snapshot when:

- protocol versions mismatch;
- offset mapping cannot be trusted;
- a stale request overlaps external edits;
- view was suspended long enough that incremental history was discarded;
- parser/editor enters an inconsistent state.

A full resync is safe because canonical Markdown remains in VS Code.

---

## 19. Webview Lifecycle

### `resolveCustomTextEditor`

Responsibilities:

- generate CSP-protected HTML;
- set `webview.options.enableScripts = true`;
- restrict `localResourceRoots` to extension assets and approved document resource roots;
- assign `viewId`;
- attach session;
- register message listener;
- send configuration/theme/document data after `ready`;
- detach and cleanup on dispose.

### State restoration

Use `vscode.getState()` / `setState()` for lightweight view state only:

- scroll position;
- outline collapsed state;
- current source-reveal block ID where meaningful.

Never treat webview persisted state as document content.

The canonical document is always rehydrated from VS Code.

---

### 19.1 Host-owned view preferences

Create `src/extension/ViewPreferencesStore.ts`, `src/protocol/viewPreferences.ts`, and `src/webview/ui/appearance/DocumentControls.ts`.

```ts
interface FileViewOverrides {
  appearance?: 'vscode' | 'document';
  width?: 'auto' | 'readable' | 'full';
  maxContentWidth?: number;
  syntaxReveal?: 'activeBlock' | 'selection' | 'manual';
  outlineCollapsed?: boolean;
}
interface PreferenceRecord {
  schemaVersion: 1;
  overrides: FileViewOverrides;
  updatedAt: number;
}
interface ViewPreferencesStore {
  get(uri: string): Promise<FileViewOverrides>;
  update(uri: string, changes: Partial<FileViewOverrides>): Promise<void>;
  resetFile(uri: string): Promise<void>;
  resetWorkspace(): Promise<void>;
  rename(oldUri: string, newUri: string): Promise<void>;
}
```

Use `workspaceState` where a workspace exists, otherwise local `globalState` without Settings Sync registration. URI key includes scheme and authority; serialize it consistently with DocumentSession keys. Persist only allowlisted fields; remote-image/trust policy is never overrideable through this channel. Serialize store updates and bound records to 1000 per scope. Undefined override means inherit config; reset removes rather than copies defaults. Migrate observed rename, prune observed delete, do not transfer preferences to copied files. Handle Save As for untitled documents by applying session overrides only after confirmed new URI association.

Extend host messages with `viewPreferencesChanged` and hydrate with effective preferences and schema version. Extend inbound messages with `updateViewPreferences`, `resetFileViewPreferences`, `resetWorkspaceViewPreferences`, and host-dispatched action requests. Validate sender identity against its attached document; the webview cannot set arbitrary URI preferences. Configuration change recomputes effective preferences. A preference update broadcasts to all views, while caret/scroll stays local.

Ephemeral `getState/setState` holds selection/scroll/revealed block IDs. It is not the durable preferences store. Pending-text recovery has its own versioned store and is never mixed into FileViewOverrides.

---

## 20. Webview Security

Generate a strict CSP similar to:

```text
default-src 'none';
img-src <webview-source> data: https:;
style-src <webview-source> 'unsafe-inline';
font-src <webview-source>;
script-src 'nonce-<random>' <webview-source>;
```

Adjust `img-src` according to the remote-image policy rather than always enabling remote HTTPS.

Security rules:

- random nonce for scripts;
- no arbitrary inline scripts;
- no `eval`;
- no unrestricted network `connect-src`;
- sanitize raw HTML render output;
- Mermaid configured under restrictive security mode;
- extension host validates every URL before opening;
- disallow `javascript:`, `data:` navigation, and `command:` from document links unless a specifically reviewed safe case exists;
- resolve local filesystem resources in the extension host;
- prevent path traversal outside approved roots;
- do not expose workspace filesystem APIs to the webview.

---

## 21. Remote Images

Implement policy in the extension/webview configuration.

### `block`

CSP omits remote hosts; widget shows placeholder.

### `prompt`

Initial render blocks remote URL and shows `Load remote image` action. User action can allow per-image/per-document/session based on chosen UX.

### `allow`

Permit HTTPS image loading. Continue to block executable URL schemes.

Do not proxy images through any markami server.

---

## 22. Link Resolution

Link opening should be performed in the extension host.

Pseudo-flow:

```text
webview Ctrl/Cmd+click
  -> openLink message
  -> parse/validate URI in extension
  -> if relative .md: resolve against current document and open in VS Code
  -> if #fragment: navigate current file heading
  -> if http/https: vscode.env.openExternal
  -> otherwise: block or handle explicit allowlisted scheme
```

Never assign untrusted Markdown URLs directly to privileged webview navigation behavior.

---

## 23. Find Implementation

Prefer CodeMirror's search facilities so visible and source content share one search domain.

When a match falls in visually hidden Markdown syntax:

- source token matches may be hidden from normal text search if user-facing find is configured for document text;
- optional `Search Markdown Source` command can search literal source.

Suggested commands:

- normal `Ctrl/Cmd+F`: rendered/document text semantics;
- `markami: Find in Markdown Source`: literal source search.

---

## 24. Outline Implementation

Generate outline from heading syntax ranges.

Data:

```ts
interface OutlineItem {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  from: number;
  to: number;
  slug?: string;
}
```

Recompute incrementally or debounce 100 ms after document changes.

Clicking an item dispatches selection/scroll in CodeMirror.

---

## 25. Styling Architecture

Use VS Code variables, for example conceptually:

```css
:root {
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}
```

Derive:

- heading colors;
- border colors;
- link colors;
- code block background;
- table borders;
- selection;
- focus;
- warning/error surfaces.

Avoid shipping a bespoke light/dark theme as the default.

### Typography

Default to VS Code editor or UI font based on setting.

Implement the exact appearance and width contract in `spec.md` §8.6–8.8 and §23. Use a default maxContentWidth of **960 CSS pixels**; `full` ignores the maximum. Appearance is independent of light/dark/high-contrast theme and of syntax reveal. §25.1 below defines the implementation.

---

### 25.1 Appearance and width implementation

Create `src/webview/styles/appearance.css`, `layout.css`, `src/webview/ui/appearance/DocumentControls.ts`, and `src/webview/editor/scrollAnchor.ts`. Apply data attributes `data-appearance` and `data-width` to the editor shell. Set validated CSS custom property `--markami-max-content-width` from the effective numeric preference, never arbitrary user CSS strings.

`vscode` uses editor/UI font preferences and compact spacing. `document` uses VS Code UI font with comfortable spacing and heading hierarchy. Both use VS Code colors, focus/selection tokens, high contrast adaptations, and mono code/source blocks. Do not load fonts remotely. A boolean editor-font preference affects VS Code mode; Document mode uses the proportional UI font.

Implement `auto` max-width 960px default, `readable` max-width min(80ch, configured pixels), and `full` 100% of content space. Padding and handle gutter fit a 320px pane. Code/tables use local overflow containers. Reconfigure through CodeMirror Compartments where appropriate; avoid destroying the EditorView. Capture nearest visible source position and pixel displacement, remeasure, then restore that anchor and selection. Cancel obsolete layout callbacks when disposed.

Test width at 320/768/1440 CSS pixels, zoomed UI, outline open/closed, both modes, light/dark/high contrast, reduced motion, dirty content, and pending sync. Snapshot source before/after every appearance change; source and history must be unchanged.

---

## 26. Accessibility Implementation

Add explicit testing for:

- tab order;
- screen reader naming;
- checkbox role/state;
- link role;
- table navigation;
- toolbar buttons;
- source-reveal actions;
- visible focus;
- keyboard-only block controls;
- high-contrast theme.

Widgets replacing source tokens must expose semantic equivalents.

Do not create decorative DOM that traps keyboard focus.

---

## 27. Diagnostics and Error Boundaries

Each heavyweight renderer should have an error boundary.

A renderer failure must produce:

```text
[Could not render Mermaid]
<short error>
[Edit source] [Retry]
```

and never remove source.

### Diagnostic codes

Use stable codes, e.g.:

- `MSYNC001` stale patch rejected;
- `MSYNC002` full resync requested;
- `MPARSE001` parser disagreement;
- `MMERMAID001` render failure;
- `MSEC001` blocked unsafe URL;
- `MRESOURCE001` local asset resolution failed.

Logs must avoid recording document text by default.

---

## 28. Fidelity Test Harness

This is the most important test suite.

### 28.1 Fixture shape

Each fixture contains:

```text
fixture.md
operations.json
expected.md
```

Example operation:

```json
{
  "name": "toggle second task",
  "operation": "setTaskChecked",
  "target": { "line": 8, "occurrence": 1 },
  "value": true
}
```

### 28.2 Invariants

For every fixture:

#### No-op

```text
open(source) -> project -> close
assert bytes(source) == bytes(output)
```

#### Targeted edit

```text
before
  -> perform semantic edit at target
  -> after
assert semantic result is correct
assert diff outside allowed source range == empty
```

### 28.3 Required fixture categories

- LF;
- CRLF;
- BOM/no BOM;
- Unicode;
- emoji/surrogate pairs;
- combining marks;
- tabs;
- trailing whitespace;
- unusual indentation;
- alternate emphasis delimiters;
- alternate fence characters/lengths;
- nested lists;
- reference links;
- tables;
- escaped pipes;
- HTML;
- frontmatter comments;
- malformed syntax;
- Mermaid;
- math;
- repository-specific unknown blocks.

---

## 29. Property-Based Testing

Use `fast-check` to generate random Markdown-ish documents and text edits.

Useful properties:

### Property A — projection purity

Creating/deleting visual decorations never changes source text.

### Property B — unrelated text preservation

Given a valid local edit `[a,b)`, bytes outside the transformed range remain equal after accounting for offset shift.

### Property C — patch round trip

Applying patch then its generated inverse restores exact source.

### Property D — synchronized views

Given two views and a sequence of accepted patches, both views eventually equal canonical document text.

### Property E — stale edit safety

A stale patch that overlaps a newer canonical edit is rejected, never silently applied at the wrong offset.

---

## 30. Integration Tests

Use VS Code extension tests for:

1. open Markdown with markami;
2. provider hydration;
3. apply patch → `TextDocument` changes;
4. save → file on disk updates;
5. external `WorkspaceEdit` → webview receives update;
6. split custom editor → both views synchronize;
7. source editor modifies same file → markami synchronizes;
8. close/reopen → source preserved;
9. configuration change → webview updates;
10. unsafe external link blocked;
11. local resource resolution.

Avoid requiring screenshots for correctness tests where source/DOM state can be asserted deterministically.

---

## 31. End-to-End Visual Tests

Maintain a small set of visual regression scenarios for:

- headings/prose;
- nested lists/tasks;
- code;
- table;
- Mermaid;
- frontmatter;
- source island;
- dark theme;
- light theme;
- high contrast.

Visual tests are secondary to source-fidelity tests.

---

## 32. Performance Engineering

Instrument locally without uploading telemetry.

Measure:

- webview bootstrap;
- hydrate → editor created;
- parse duration;
- projection duration;
- time to first interactive paint;
- transaction duration;
- Mermaid render duration;
- table render duration;
- memory for large fixtures.

### Performance rules

- CodeMirror syntax tree drives immediate typing behavior;
- semantic parse is debounced after changes;
- Mermaid/math rendering is independently debounced;
- only render heavyweight widgets in/near viewport;
- hash block source and reuse render output while unchanged;
- cancel obsolete render jobs;
- do not rebuild the entire editor DOM after every transaction.

---

## 33. Development Phases

## Phase 0 — Repository and quality gates

Deliver:

- repository scaffold;
- TypeScript strict mode;
- lint/typecheck/test scripts;
- CI;
- extension activation smoke test;
- `spec.md` and `impl.md` committed;
- MIT or chosen open-source license;
- security/privacy/contributing docs.

Exit criteria:

```text
npm/pnpm install
build
unit test
package VSIX
```

all succeed on clean checkout.

---

## Phase 1 — Custom editor skeleton

Implement:

- custom editor contribution;
- `CustomTextEditorProvider`;
- CSP-protected webview;
- CodeMirror initialized from canonical source through the coordinate adapter;
- extension/webview protocol;
- DocumentSession;
- save command;
- source-editor escape hatch;
- configuration plumbing.

No visual Markdown projection required yet.

Exit criteria:

- editing text in webview edits actual `TextDocument`;
- source editor sees changes immediately;
- external source edits appear in webview;
- no-op open/close changes nothing.

---

## Phase 2 — Synchronization correctness

Implement:

- versioned patch requests;
- serialized per-document patch queue;
- origin IDs;
- stale edit rejection;
- multiple-view sync;
- full resync;
- local selection mapping;
- undo/redo experiment and finalized design;
- IME-safe transaction boundaries.

Exit criteria:

- automated two-view synchronization tests pass;
- external edits cannot be overwritten by stale ranges;
- no known echo loops.

Do not proceed to elaborate rendering until this layer is stable.

---

## Phase 3 — Projection fundamentals

Implement rendered behavior for:

- paragraphs;
- ATX headings;
- strong/emphasis/strike;
- inline code;
- blockquotes;
- horizontal rules;
- bullet/ordered lists;
- syntax reveal based on active block.

Exit criteria:

- all features remain direct-editable;
- open/render does not modify source;
- delimiter-preservation tests pass.

---

## Phase 4 — Structural editing

Implement:

- mandatory selection toolbar and shared command registry (§13.15);
- block handles and drag/keyboard reorder (§13.17);
- bold/italic/link shortcuts;
- heading changes;
- list continuation/exit;
- task list checkbox;
- mandatory slash command palette (§13.16), including default-on setting and cancellation;
- source reveal/current-block source island.

Exit criteria:

A user can write a normal README without opening native source editor.

---

## Phase 5 — Technical blocks

Implement:

- fenced code styling;
- code language label;
- Mermaid render/source focus behavior;
- frontmatter detection;
- raw HTML safety classification;
- unknown syntax Source Islands;
- math rendering if enabled.

Exit criteria:

Technical documents with advanced blocks remain fully editable and source-safe.

---

## Phase 6 — Links, images, and resources

Implement:

- inline/reference links;
- relative Markdown navigation;
- fragment navigation;
- external-link validation;
- image resolution;
- remote-image policy;
- broken-resource placeholders.

Exit criteria:

Common repository documentation navigates correctly without escaping into browser behavior unexpectedly.

---

## Phase 7 — Tables

Implement Stage A table experience first.

Only build full grid widget if user testing shows the decorated-source table is insufficient.

Exit criteria:

- cell editing works;
- row/column operations work;
- normalization stays inside table block;
- escaped content is covered by fixtures.

---

## Phase 8 — Navigation and polish

Implement:

- find;
- outline;
- context menus;
- keyboard completeness;
- accessibility pass;
- VS Code/Document appearance modes and auto/readable/full width (§25);
- host-owned per-file preferences and reset/migration tests (§19.1);
- theme polish;
- error UI;
- diagnostic command.

---

## Phase 9 — Hardening

Focus on:

- real-world fixture corpus;
- fuzz/property tests;
- large-file performance;
- multi-view stress;
- IME testing;
- Windows/macOS/Linux;
- remote workspace smoke tests;
- security review;
- resource/path traversal tests;
- corrupted/malformed documents.

No new feature work until fidelity defects are below release threshold.

---

## Phase 10 — Marketplace release

Prepare:

- icon;
- Marketplace banner assets;
- screenshots/GIF;
- concise README;
- syntax support matrix;
- known limitations;
- privacy statement;
- security policy;
- changelog;
- license notices;
- install/use instructions;
- issue templates emphasizing source-fidelity reproduction cases.

Release pipeline:

```text
tag
 -> CI
 -> lint
 -> typecheck
 -> unit tests
 -> fidelity tests
 -> integration tests
 -> build
 -> package .vsix
 -> attach artifact to GitHub Release
 -> publish to VS Code Marketplace after approval gate
```

Use explicit manual approval for Marketplace publishing at first.

---

## 34. CI Pipeline

Suggested GitHub Actions matrix:

### Pull request

- Node LTS;
- install with frozen lockfile;
- lint;
- typecheck;
- unit tests;
- fidelity tests;
- build;
- package smoke test.

### Main branch

All above plus:

- VS Code integration tests on Linux;
- optional Windows/macOS scheduled matrix;
- dependency/security checks.

### Release tag

- full test matrix;
- deterministic build;
- create `.vsix`;
- generate checksums;
- GitHub Release artifact;
- Marketplace publish approval.

---

## 35. Branch and Contribution Policy

Recommended:

- protected `main`;
- pull requests required;
- status checks required;
- no direct release from local machine after initial bootstrap;
- conventional or clearly structured commit messages;
- changelog generated/maintained deliberately;
- source-fidelity bug label has highest severity.

Issue labels:

- `fidelity`;
- `data-integrity`;
- `sync`;
- `rendering`;
- `syntax-support`;
- `security`;
- `performance`;
- `accessibility`;
- `good-first-issue`.

A `data-integrity` regression blocks release.

---

## 36. Security Review Checklist

Before 1.0:

- [ ] CSP reviewed;
- [ ] no `eval` or dynamic code execution;
- [ ] raw HTML sanitizer tests;
- [ ] Mermaid security configuration reviewed;
- [ ] URL scheme allowlist tests;
- [ ] local path traversal tests;
- [ ] remote-image behavior verified;
- [ ] webview message validation complete;
- [ ] no document body in logs/diagnostics by default;
- [ ] dependency audit;
- [ ] extension permissions/activation minimized;
- [ ] unsafe VS Code command URI handling blocked;
- [ ] malformed message fuzzing performed.

---

## 37. Source-Fidelity Review Checklist

For every feature PR:

- [ ] What exact source range can this feature modify?
- [ ] Can opening/rendering invoke a write? It must not.
- [ ] Does it preserve delimiter style when editing an existing construct?
- [ ] What happens if parsing is ambiguous?
- [ ] Does it fall back to source rather than normalize uncertain syntax?
- [ ] Does it preserve CRLF?
- [ ] Does it preserve surrounding whitespace?
- [ ] Are reference-style forms preserved?
- [ ] Is the operation covered by a golden fixture?
- [ ] Is unrelated-source equality asserted?

---

## 38. Definition of Done for a Syntax Feature

A syntax feature is done only when all of the following exist:

1. parser/range recognition;
2. rendered projection;
3. direct editing behavior;
4. source reveal behavior;
5. malformed/partial syntax behavior;
6. keyboard behavior;
7. accessibility behavior;
8. source-fidelity tests;
9. external-change synchronization test where relevant;
10. documentation in `syntax-support.md`.

Rendering alone is not completion.

---

## 39. Recommended First Vertical Slice

Do **not** attempt all Markdown features immediately.

Build this exact vertical slice first:

```text
Open .md with markami
  -> hydrate exact source
  -> CodeMirror editor
  -> render H1/H2 and **bold** through decorations
  -> hide syntax when block inactive
  -> edit rendered text
  -> send minimal versioned patch
  -> update VS Code TextDocument
  -> reflect external source edit back into surface
  -> save file
  -> close/reopen
  -> assert source fidelity
```

Fixture:

```md
# markami

Edit **Markdown** where you read it.
```

Required test:

Change `Markdown` → `technical Markdown` visually.

Expected disk diff:

```diff
-Edit **Markdown** where you read it.
+Edit **technical Markdown** where you read it.
```

Nothing else changes.

Once this slice is reliable, the rest of the product is feature expansion on top of a proven architecture.

---

## 40. Engineering Decision Records to Create

Create ADRs early for:

- ADR-001: `CustomTextEditorProvider` as host integration;
- ADR-002: Markdown source as sole canonical document model;
- ADR-003: CodeMirror 6 projection instead of rich-text serialization;
- ADR-004: minimal patch protocol;
- ADR-005: Source Islands for unsupported/ambiguous syntax;
- ADR-006: dual parser roles and parser disagreement fallback;
- ADR-007: remote image privacy policy;
- ADR-008: raw HTML rendering/security policy;
- ADR-009: undo/redo ownership after prototype validation;
- ADR-010: table editing normalization boundary;
- ADR-011: block move units and bounded separator seams;
- ADR-012: host-owned preferences and URI identity;
- ADR-013: host/editor newline coordinate mapping;
- ADR-014: pending local recovery drafts and capacity limits.

This prevents future contributors from casually replacing source-preserving decisions with easier but lossy approaches.

---

## 41. Suggested Implementation Order for a Coding Agent

A coding agent should receive work in architecture-preserving batches.

### Batch 1 — Bootstrap

Prompt outcome:

- scaffold VS Code extension;
- custom editor opens `.md`;
- Vite webview loads;
- strict CSP;
- CodeMirror displays canonical source with separator-aware offset mapping;
- CI/build/test scripts.

### Batch 2 — Canonical sync

- DocumentSession;
- protocol schemas;
- versioned patch application;
- document-change broadcast;
- stale edit rejection;
- source editor interoperability.

### Batch 3 — Projection core

- Markdown language support;
- projection state field;
- active block detection;
- heading and emphasis decorations;
- fidelity tests.

### Batch 4 — Editing commands

- format toggle utilities;
- shared action registry, floating selection toolbar, mandatory slash palette;
- block index, drag handles, exact-source move planner, keyboard alternatives;
- list behavior;
- tasks;
- source reveal;
- Source Island abstraction.

### Batch 5 — Technical blocks

- fenced code;
- frontmatter;
- Mermaid;
- raw HTML safety;
- semantic parser cache.

### Batch 6 — Repository UX

- links;
- local images;
- remote image policy;
- outline/find;
- document appearance, width controls, and persistent per-file view preferences;
- tables.

### Batch 7 — Quality

- property testing;
- large-file benchmarks;
- accessibility;
- integration tests;
- Marketplace assets and release workflow.

For every batch, instruct the agent:

> Do not reserialize entire Markdown documents. Any implementation that writes generated Markdown for an unchanged region violates the architecture unless explicitly approved as a bounded normalization operation.

---

## 42. Things the Implementation Must Avoid

### Do not use a rich editor as canonical state

Tiptap/ProseMirror/Milkdown can be excellent editors, but a standard rich-editor round trip makes markami's strongest promise harder to guarantee.

### Do not regenerate Markdown after every edit

This creates noisy diffs and destroys unsupported formatting.

### Do not render arbitrary raw HTML unsandboxed

The Markdown file is untrusted content.

### Do not trust absolute source positions across document versions

Every edit must be versioned.

### Do not implement “ignore the next change event” globally

Multiple views/external edits will break this approach.

### Do not parse YAML then stringify it merely to edit one field

This can destroy comments, anchors, quoting, order, and formatting.

### Do not let Mermaid or image failures affect source persistence

Renderers are projections only.

### Do not make source mode the expected workaround for routine features

Source reveal is a safety valve, not the primary product experience.

---

## 43. Initial Risk Register

| Risk | Impact | Mitigation |
|---|---:|---|
| Caret behavior around hidden syntax is unstable | High | active-block syntax reveal; conservative decorations; heavy interaction tests |
| VS Code custom-editor history routing or grouping is unreliable | High | prototype in Phase 2; ADR after empirical validation |
| Tables become effectively a second editor | Medium/High | start with decorated source; bounded table-block rewrite only |
| Parser disagreement corrupts mapping | High | source island fallback; never structural-write ambiguous region |
| Webview feels unlike VS Code | Medium | VS Code tokens, minimal chrome, keyboard-first design |
| Large files become slow | Medium | incremental parser, viewport widgets, debounce semantic parsing |
| Mermaid/raw HTML security issue | High | strict CSP, sanitizer, local rendering, security tests |
| External edits race with local patch | High | base versions, serialized session queue, stale rejection |
| Frontmatter form destroys YAML formatting | High | targeted CST patches; source fallback |
| Feature pressure weakens fidelity promise | High | ADRs, fidelity CI gate, data-integrity label blocks release |

---

## 44. Milestone Completion Tests

### Architecture milestone

```text
source editor + markami open same file
edit either one
both converge
save
reopen
exact expected bytes
```

### Projection milestone

```text
heading and emphasis look rendered
move cursor in/out
source never changes
```

### Structural edit milestone

```text
select text
Ctrl+B
diff contains only inserted ** delimiters
undo
exact original bytes restored
```

### Mermaid milestone

```text
inactive -> diagram
focus -> source
edit edge
preview refreshes
only Mermaid block content changes
```

### External agent milestone

```text
markami open
external process changes another paragraph
markami refreshes
local typing continues safely
no external change is lost
```

---

## 45. 1.0 Technical Exit Criteria

markami 1.0 can ship when:

### Architecture

- [ ] CustomTextEditorProvider stable;
- [ ] canonical TextDocument design enforced;
- [ ] protocol versioned and validated;
- [ ] multi-view synchronization stable;
- [ ] stale-edit safety proven.

### Editing

- [ ] prose/headings;
- [ ] emphasis/strike/inline code;
- [ ] lists/tasks;
- [ ] links/images;
- [ ] code blocks;
- [ ] tables;
- [ ] frontmatter;
- [ ] Mermaid;
- [ ] Source Islands;
- [ ] raw HTML safe behavior;
- [ ] required slash palette;
- [ ] floating selection toolbar;
- [ ] block handles and drag/keyboard reordering;
- [ ] VS Code and Document appearance modes;
- [ ] auto/readable/full widths and maxContentWidth;
- [ ] per-file view preferences, rename migration, and reset. 

### Quality

- [ ] no-op byte preservation corpus passes;
- [ ] localized edit tests pass;
- [ ] property tests pass;
- [ ] CRLF/BOM/Unicode tests pass;
- [ ] IME smoke tests pass;
- [ ] Windows/macOS/Linux smoke tests pass;
- [ ] large-file performance within targets;
- [ ] accessibility review completed;
- [ ] security checklist completed.

### Release

- [ ] installable VSIX;
- [ ] CI release artifacts;
- [ ] Marketplace listing;
- [ ] README/screenshots;
- [ ] privacy/security/contribution docs;
- [ ] syntax support matrix;
- [ ] known limitations documented.

---

## 46. Final Architecture Rule

If a future implementation decision forces a choice between:

1. a more visually polished editing experience; and
2. preserving the user's Markdown source accurately,

choose source integrity and fall back to a Source Island.

That constraint is not a temporary limitation. It is markami's product identity.


---

## 47. Ordered Codex Implementation Tasks

**Goal:** Deliver markami as an installable, source-preserving VS Code extension and prepare its public Marketplace release.

**Architecture:** VS Code TextDocument owns canonical content; CodeMirror provides a projection with explicit coordinate mapping. All mutations become validated local patches; deterministic source planners serve every interaction path. Host services own lifecycle, resources, durable preferences, and history.

**Tech stack:** TypeScript strict, Node.js 22 tooling, npm/lockfile, VS Code ^1.102.0, CodeMirror 6, esbuild/Vite, Zod, remark/Lezer, Mermaid/KaTeX, sanitizer, Vitest/fast-check, VS Code test-electron, browser interaction harness, vsce, GitHub Actions.

**Spec:** `./spec.md`, revision 2. These tasks are the execution order; §33 phases describe milestones. Execute each task with its predecessor interfaces available. Features can be developed incrementally, but all mandatory capabilities must pass before 1.0.

### 47.1 Global constraints

- Product display name, settings/command namespace, repo/package slug: `markami`; custom editor `markami.editor`; class `MarkamiProvider`.
- Markdown is canonical; no full-document Markdown serializer in any ordinary write path.
- Installation keeps custom editor priority `option`; no automatic editor-association takeover.
- Node.js 22, npm with committed lockfile and `npm ci`, strict TypeScript, desktop VS Code ^1.102.0.
- UTF-16 host offsets on the wire; CodeMirror line-break offsets mapped explicitly.
- `vscode` and `document` appearance; `auto`, `readable`, `full` width; 960 CSS-pixel default, range 480–2400.
- Required default-on slash palette, selection toolbar, block handles; complete keyboard alternatives.
- Presentation preferences outside Markdown; max 1000 records per state scope; no Settings Sync URI registration.
- No document upload/AI/telemetry; remote-image policy `prompt`; renderer assets bundled locally.
- No known data loss, false saved state, unsafe execution, or missing mandatory feature at release.

### 47.2 Review focus and owning tasks

1. **CRLF with emoji and multiline replacement:** offsets must target the same text on disk; Task 2 golden fixture and Task 16 disk tests.
2. **Typing faster than host acknowledgements with an external edit:** no echo duplication, stale offset, or lost local draft; Task 3 delayed-ack tests and Task 16 stress.
3. **Last block without newline moved before a list/fence:** preserve core and safe seams, reject semantic merging; Task 8 exact golden tests.
4. **Toolbar/link/image dialog held open while source changes:** remap or invalidate; never apply to a new selection; Tasks 6, 7, and 11.
5. **Split views and rename with duplicate basenames:** same-file preference convergence and independent different-file identity; Task 14 integration tests.

### 47.3 Task execution convention

For every task: create its named tests and confirm the expected assertion fails before implementing a new behavior; implement the smallest architecture-compliant change; run the task check; record evidence; commit the cohesive change if a git repository is present and commits are authorized. A missing import/module can be the initial red result; the final test must assert behavior, not merely existence.

Run commands from repository root. Task 1 establishes all npm script names below. `npm run test:unit -- <path>` filters Vitest fixtures; `test:fidelity` filters golden tests; `test:webview` runs UI interactions; `test:integration` launches a real VS Code extension host. A task's expected result is zero exit status plus its named behavior assertions. A skipped check is recorded as unverified. Do not manufacture output or mark a test passed because its implementation looks correct.

Keep task logs under `docs/delivery/progress.md`: task, commit, changed paths, commands/results, remaining blockers. Store concise evidence, not document bodies or credentials. After an interrupted session, read that file and current git status, verify the last checkpoint, and continue from the earliest incomplete task.

### Task 1 — Reproducible repository and custom-editor shell

**Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.mjs`, `vite.config.ts`, `vitest.config.ts`, `src/extension/extension.ts`, `src/extension/MarkamiProvider.ts`, `src/webview/main.ts`, `.github/workflows/ci.yml`, `AGENTS.md`, `test/integration/openEditor.test.ts`.

**Interfaces:** export `activate(context: vscode.ExtensionContext): void`, `deactivate(): void`; provider `resolveCustomTextEditor(document, panel, token): Promise<void>`. Build extension to `dist/extension.js` and webview assets to `dist/webview/`. Register `markami.editor` with multiple-view support after the session layer exists.

- [ ] Create `opens_md_as_optional_custom_editor`: assert `.md` and `.markdown` can be reopened with markami, a plain `.ts` file is unaffected, and opening/closing Markdown does not change disk bytes. Initially expect provider unavailable.
- [ ] Create npm scripts: `lint`, `typecheck`, `build`, `test:unit`, `test:fidelity`, `test:protocol`, `test:webview`, `test:integration`, `test:visual`, `bench`, `package`, `verify`. `verify` runs lint/typecheck/unit/protocol/fidelity/build; platform integration and visuals are separate mandatory release checks.
- [ ] Resolve compatible dependencies, pin them in lockfile, generate bundles, and render one CodeMirror source surface under nonce CSP. No CDN resources.
- [ ] Register open-rendered/open-source commands; generate scoped HTML with cancellation/disposal support. Start with no formatting UI.
- [ ] Run `npm ci`, `npm run verify`, `npm run test:integration -- openEditor`; expect clean build and no-touch test passing. Commit `chore: bootstrap markami custom editor`.

**Deliverable:** VS Code opens the real file in a secure alternate editor from a clean checkout.

### Task 2 — Source coordinates and patch primitives

**Files:** `src/core/source/CoordinateMap.ts`, `Patch.ts`, `PatchSet.ts`, `lineEndings.ts`, `test/unit/CoordinateMap.test.ts`, `test/fidelity/sourcePatches.test.ts`, `fixtures/line-endings/`.

**Consumes:** host decoded source and document EOL. **Produces:** `createCoordinateMap(hostText): CoordinateMap`; `validatePatchSet(source: string, patches: readonly TextPatch[]): ValidationResult`; `applyPatchSet(source: string, patches: readonly TextPatch[]): string`. Define `ValidationResult = {ok:true}|{ok:false;reason:string}`. All patches in one set refer to the same pre-edit text.

- [ ] Add `crlf_offsets_edit_final_word`: source `a\r\nb\r\nc`, editor offset 4 maps to host 6; replace `[6,7)` with `collector`, result exactly `a\r\nb\r\ncollector`.
- [ ] Add LF/CRLF/mixed-exposed-separator, final newline/no newline, empty line, emoji, combining character, and multiline paste tests; assert untouched raw source equal and patch plus inverse restores original.
- [ ] Implement branded offset types, separator-aware maps, deterministic patch ordering, and range/overlap validation. Reject fractional/negative/out-of-bounds ranges before mutation.
- [ ] Run `npm run test:unit -- CoordinateMap` and `npm run test:fidelity -- sourcePatches`; expect exact strings, not normalized snapshots. Commit `feat: map editor coordinates to canonical Markdown`.

**Deliverable:** Correct raw-source patches independent of rendered UI.

### Task 3 — Canonical session, acknowledgements, and external changes

**Files:** `src/extension/DocumentSession.ts`, `DocumentSessionRegistry.ts`, `applyPatch.ts`, `src/protocol/messages.ts`, `schemas.ts`, `version.ts`, `src/webview/bridge/hostBridge.ts`, `patchQueue.ts`, `syncState.ts`, `test/protocol/sync.test.ts`, `test/integration/multiView.test.ts`.

**Consumes:** Task 2 validation/mapping. **Produces:** `DocumentSession.attach/detach/enqueuePatch/handleDocumentChanged/sendSnapshot/dispose` from §7; protocol v1 schemas; bridge state `hydrating | synced | pending | conflict | disposed`. PatchRequest ranges are host offsets.

- [ ] Add `delayed_ack_three_local_edits_preserve_order`: simulate three typing transactions before acknowledgement, assert final host text contains each once and both views converge.
- [ ] Add `stale_overlapping_edit_rejected`, `same_request_replay_applied_once`, `failed_apply_preserves_draft`, and `external_change_between_validation_and_apply`. Assert no false acknowledgement and no newer external text overwritten.
- [ ] Implement **one in-flight host patch request per view**. Keep acknowledged canonical text/version separately from optimistic editor text. Compose unsent local transactions against that base; do not label a patch computed from optimistic positions with an older host version. After ack, rebase remaining non-overlapping edits against new canonical text; overlap enters conflict.
- [ ] Serialize own mutations per document, validate version immediately before applying, use one WorkspaceEdit, verify applyEdit result and expected canonical change before acknowledgement. Correlate request origin by expected changes/version, not “next event.” Maintain bounded idempotency cache and generation IDs.
- [ ] Prototype the actual VS Code version/range semantics in the validation/apply race. The public edit API must not be described as an atomic compare-and-swap without evidence. If the race can still overwrite intervening edits, resolve it in this task and record ADR-004 before proceeding; a final check after corruption is not a safety mechanism.
- [ ] Implement incoming changes with before/after versions; resync on gaps. Queue or cancel affected widget/UI actions. Preserve pending local text on stale rejection; dispose listeners when views close.
- [ ] Run `npm run test:protocol -- sync`, `npm run test:integration -- multiView`; include real source/custom split-view edits. Commit `feat: synchronize versioned Markdown views safely`.

**Deliverable:** Multi-view text convergence with verified stale-edit safety and usable conflict state.

### Task 4 — Save, canonical history, and pending-text recovery

**Files:** `src/extension/history.ts`, `RecoveryStore.ts`, `src/webview/bridge/recovery.ts`, `src/webview/ui/notifications/ConflictBanner.ts`, `test/integration/history.test.ts`, `saveRecovery.test.ts`, `docs/adr/009-history.md`.

**Consumes:** Task 3 session state. **Produces:** `requestHistoryAction(viewId: string, action: 'undo'|'redo'): Promise<void>`; `RecoveryStore.put/get/clear` with URI, baseVersion, canonical-base hash, draft text, timestamp. No draft is automatically applied over a changed host document.

- [ ] Add `visual_undo_source_redo_same_history`: edit visual text, undo from visual editor, redo from source editor; assert exact text and dirty-state transitions.
- [ ] Add `save_flushes_pending_before_success`: save waits for accepted local patches, then actual host save succeeds; failed disk save leaves dirty/recoverable content.
- [ ] Implement host-authoritative undo/redo with active-document guard, no independent CodeMirror inverse patch stack. Run routing/grouping experiment on minimum/stable VS Code; structural actions are one undo step. Record exact observed behavior in ADR-009.
- [ ] Implement conflict choices: inspect diff, copy local draft, reload canonical after retaining draft, or explicit discard. Bound recovery storage to 10 MiB per scope and prune acknowledged drafts; when limit would be exceeded, show an unsaved-draft warning and preserve the in-memory draft for copying.
- [ ] Test webview reload with accepted content, unacknowledged content, divergent canonical content, and read-only save failure. Never show “saved” based only on optimistic editor state.
- [ ] Run `npm run test:integration -- history` and `npm run test:integration -- saveRecovery`; commit `feat: preserve canonical history and recover pending edits`.

**Deliverable:** Reliable file lifecycle and recoverable local work.

### Task 5 — Parser, projection, and editable source islands

**Files:** `src/core/markdown/syntax.ts`, `semanticAst.ts`, `sourceMap.ts`, `dialect.ts`, `featureRegistry.ts`, `src/webview/projection/ProjectionPlugin.ts`, `syntaxReveal.ts`, `marks.ts`, `replacements.ts`, `sourceIsland.ts`, `test/webview/projection.test.ts`.

**Consumes:** synchronized CodeMirror state and coordinate adapter. **Produces:** versioned `ProjectionPlan` (§11), source-bounded feature recognition, active-block state, SourceIslandSpec.

- [ ] Add `projection_never_mutates_source`: toggle selection/reveal/render/scroll repeatedly over headings/emphasis/quotes/lists; assert no docChanged transaction and exact host text.
- [ ] Add `parser_disagreement_exposes_editable_source`, `unterminated_fence_remains_editable`, `selection_through_hidden_tokens_keeps_copy_behavior`, and caret/Backspace/Delete boundary tests.
- [ ] Implement conservative decorations and source mappings. Provide height-changing block decorations directly through a StateField; viewport-derived indirect decorations must not change vertical layout. Implement atomic cursor behavior only where source access remains available.
- [ ] Render prose, ATX/Setext headings, emphasis/strike/inline code, quote, divider, and lists. Add source reveal policies and invalid/malformed fallback; no AST-to-Markdown writing.
- [ ] Run `npm run test:webview -- projection` and `npm run test:fidelity`; commit `feat: project rendered Markdown over preserved source`.

**Deliverable:** The initial rendered editing vertical slice passes the exact-diff requirement.

### Task 6 — Formatting commands and floating selection toolbar

**Files:** `src/core/markdown/formatting.ts`, `src/webview/editor/actionRegistry.ts`, `commands.ts`, `src/webview/ui/toolbar/SelectionToolbar.ts`, `src/webview/ui/inlinePopover/LinkPopover.ts`, `test/unit/formatting.test.ts`, `test/webview/selectionToolbar.test.ts`.

**Consumes:** Task 5 syntax/ranges, Task 3 bridge. **Produces:** ActionContext/EditorAction/ActionResult from §13.15; planners `planInlineFormat` and `planHeading`; shared action IDs used by all later UI.

- [ ] Add `bold_on_selected_collector_inserts_only_delimiters`: input `The collector receives OTLP.`, selection `collector`, output `The **collector** receives OTLP.`; undo exact original.
- [ ] Add `preserves_existing_underscore_bold`, `clear_partial_span_rejects_unsafe_unwrap`, and `external_edit_invalidates_toolbar_anchor` with exact patch assertions.
- [ ] Implement bold/italic/strike/code/link/clear and heading/paragraph conversion planners. Test code containing backticks and Setext conversion boundaries.
- [ ] Build floating toolbar, pointer selection retention, viewport positioning, active/mixed states, keyboard focus/Escape, composition/mixed-block exclusions. Wire shortcuts/context/host commands to registry.
- [ ] Run `npm run test:unit -- formatting`, `npm run test:webview -- selectionToolbar`, `npm run test:integration -- history`; commit `feat: edit selections through source-aware formatting controls`.

**Deliverable:** UX-04–06 and stale-selection safety verified.

### Task 7 — Required slash palette and block insertion

**Files:** `src/core/markdown/insertBlock.ts`, `src/webview/editor/slashState.ts`, `src/webview/ui/slash/SlashPalette.ts`, `test/unit/insertBlock.test.ts`, `test/webview/slashPalette.test.ts`.

**Consumes:** shared registry/ActionContext. **Produces:** `planInsertBlock(ctx, kind, args): ActionResult`; parser-based `canOpenSlash(ctx): boolean`; command `markami.openSlashCommands`.

- [ ] Add `slash_mer_replaces_query_only`: in a document with unchanged prefix/suffix, `/mer` becomes the default Mermaid fence; assert outside source identical and caret inside block.
- [ ] Add palette filter/navigation/no-results, escape unchanged, dialog cancellation unchanged, trigger suppressed in code/URL/island/nonempty text, math disabled, and external edit before acceptance tests.
- [ ] Implement all §11.5 entries, deterministic templates, keyboard/pointer accessibility, default-on setting, and explicit invocation with trigger disabled. Image picker reuses Task 11 service when available; until then record dependency, do not claim complete.
- [ ] Verify each accepted insertion is one host history step. Run `npm run test:unit -- insertBlock`, `npm run test:webview -- slashPalette`; commit `feat: insert Markdown blocks from the slash palette`.

**Deliverable:** All required slash actions available by completion of their dependent syntax/resource tasks.

### Task 8 — Block handles, drag moves, and keyboard alternatives

**Files:** `src/core/markdown/blockIndex.ts`, `moveBlock.ts`, `src/webview/ui/blocks/BlockHandles.ts`, `test/fidelity/blockMoves.test.ts`, `test/webview/blockHandles.test.ts`, `docs/adr/011-block-seams.md`.

**Consumes:** acknowledged host source, top-level syntax/ranges, history, registry. **Produces:** host-coordinate MovableBlock index and `planBlockMove(...): HostActionResult` from §13.17; commands `markami.moveBlockUp`, `moveBlockDown`, `moveBlockTo`.

- [ ] Add golden fixtures for paragraph/heading/list/quote/fence/table/island moves; assert moved core bytes equal original, unrelated blocks equal original, undo/redo exact.
- [ ] Add `move_eof_block_without_newline_preserves_boundaries`, first/last block in CRLF, no-op target, pinned frontmatter, ambiguous island, nested-container target, and external-edit-during-drag tests.
- [ ] Implement core/separator ownership, old-coordinate delete+insert planner, seam simulation/reparse, and allowed-range locality assertions. Document separator policy and refusal conditions in ADR-011.
- [ ] Build gutter handles, insertion line, bounded auto-scroll, Escape cleanup, keyboard move chooser, live-region announcements, and caret mapping into moved block. Do not use draggable rich-editor nodes.
- [ ] Run `npm run test:fidelity -- blockMoves`, `npm run test:webview -- blockHandles`, history integration; commit `feat: reorder blocks without rewriting Markdown`.

**Deliverable:** UX-07–10 verified with exact source preservation and accessible movement.

### Task 9 — Tasks, code, Mermaid, math, and alerts

**Files:** `src/webview/features/tasks/`, `codeBlocks/`, `mermaid/`, `math/`, `alerts/`, `test/fidelity/technicalBlocks.test.ts`, `test/webview/technicalBlocks.test.ts`, corresponding fixtures.

**Consumes:** projection, source planners, renderer error boundaries. **Produces:** feature modules registered through `featureRegistry`, local renderer job cache with version/hash, task checkbox planner.

- [ ] Add `checkbox_changes_one_character`, `edit_code_preserves_tilde_fence_and_info`, `mermaid_failure_leaves_source_unchanged`, `math_currency_ambiguity_keeps_source`, and `github_alert_marker_preserved`.
- [ ] Implement list Enter/exit/indent/outdent, accessible task widgets, embedded code editing/highlighting/copy, Mermaid inactive/source-on-focus, KaTeX source-on-focus, and GitHub note/warning rendering. Keep code in primary surface where possible.
- [ ] Use bundled assets, restrictive renderer settings, hashed bounded cache, cancelled obsolete jobs, and 150–300ms expensive-render debounce. Never execute code or remote-render Mermaid.
- [ ] Add malformed/partial fence and IME tests; verify slash inserts for these features now fully work. Run technical block fidelity/UI tests and build with networking disabled; commit `feat: render and edit technical Markdown blocks locally`.

**Deliverable:** Technical syntax is usable with source-safe failure behavior.

### Task 10 — GFM table editing and structural operations

**Files:** `src/core/markdown/tables.ts`, `src/webview/features/tables/`, `test/fidelity/tables.test.ts`, `test/webview/tables.test.ts`, `docs/adr/010-table-boundary.md`.

**Consumes:** GFM source map/ActionResult. **Produces:** cell/row/column/alignment planners returning minimal patches or an explicit table-only normalization boundary.

- [ ] Add fixtures for escaped pipes, code spans containing pipes, ragged rows, alignment, CRLF, Unicode, and blank lines. Assert a cell edit preserves neighbors and unrelated rows wherever safely possible.
- [ ] Implement Stage A decorated-source table first; evaluate against actual rendered-cell editing UX. If pipes/source editing still force routine source shuffling, implement grid mapping before declaring complete.
- [ ] Implement direct cell edit, Tab/Shift+Tab, last-cell row creation, insert/delete row/column, alignment, and source reveal. Bounded structural rewrites preserve surrounding text/EOL/content and alignment intent.
- [ ] Test keyboard cross-cell selection, paste with delimiters, malformed table fallback, and external edit while active. Run table fidelity/UI suites and record ADR-010; commit `feat: edit GFM tables with bounded source patches`.

**Deliverable:** Tables meet the spec's editing requirement rather than merely rendering as a grid.

### Task 11 — Links, image insertion, and resource policy

**Files:** `src/extension/resources.ts`, `security.ts`, `src/webview/features/links/`, `images/`, `src/protocol/resourceMessages.ts`, `test/unit/resources.test.ts`, `test/integration/resources.test.ts`.

**Consumes:** host document URI/trust/config, Task 6 link UI, Task 7 image entry. **Produces:** `resolveResource(documentUri, rawPath): Promise<ResourceResult>`; host image picker/copy service with validated schema and request IDs.

- [ ] Add relative/reference links, encoded filenames, duplicate heading fragments, missing images, path traversal/symlink escape, malicious scheme, and remote-image blocked/prompt/allow cases.
- [ ] Implement `Ctrl/Cmd+Click`, destination/label editing preserving reference form, relative Markdown open, same-file fragments, and host-controlled external open.
- [ ] Implement required existing-file image insertion and alt/path/title fields. If file is already inside allowed workspace roots, insert a relative path; external local file copy requires explicit picker selection and trusted workspace, unique collision-safe name, size/type validation, and error recovery. Optional clipboard image capture must not block required existing-image workflow.
- [ ] Add `image_dialog_external_edit_does_not_use_stale_range`: accept or cancel after external changes; assert no newer content overwritten. Preserve remote resource source even when blocked. Run resource unit/integration and slash-image test; commit `feat: navigate repository links and insert images safely`.

**Deliverable:** Complete required image insertion and repository navigation with policy enforcement.

### Task 12 — Frontmatter, HTML, and unknown syntax fidelity

**Files:** `src/webview/features/frontmatter/`, `html/`, `src/webview/security/sanitize.ts`, `src/core/markdown/frontmatter.ts`, `test/fidelity/frontmatterHtml.test.ts`, `test/unit/sanitize.test.ts`.

**Consumes:** Source Islands, parser/offset adapter, resources/security. **Produces:** safe HTML classifier and compact frontmatter projection with source edit fallback.

- [ ] Add YAML comments/anchors/quoted scalars/order/duplicate keys/invalid YAML and MDX/custom-directive fixtures. Assert no-touch bytes and edited-range locality.
- [ ] Add HTML script/event/iframe/form/unsafe link cases; assert no executable DOM and raw source remains exactly unchanged when rendering is denied.
- [ ] Implement compact metadata/source action, source-preserving frontmatter edits, safe HTML allowlist, and conservative island fallbacks. Optional scalar forms use CST ranges; omit them if fidelity is unproven.
- [ ] Run frontmatter/HTML fidelity and sanitizer tests plus CSP integration; commit `feat: preserve frontmatter and unsupported document syntax`.

**Deliverable:** Repository-specific content is preserved and remains editable.

### Task 13 — Appearance, width, and responsive document controls

**Files:** `src/webview/styles/appearance.css`, `layout.css`, `src/webview/ui/appearance/DocumentControls.ts`, `src/webview/editor/scrollAnchor.ts`, `test/webview/appearance.test.ts`, visual baselines.

**Consumes:** effective validated configuration and transient view state. **Produces:** `applyAppearance(view, prefs): void`, `captureScrollAnchor(view): ScrollAnchor`, `restoreScrollAnchor(view, anchor): void` with `ScrollAnchor = {sourceOffset:number;deltaY:number}`.

- [ ] Add matrix tests for vscode/document × auto/readable/full × 320/768/1440px. Assert full ignores cap, auto max 960 default, readable respects 80ch and max, shell never overflows at 320px.
- [ ] Assert switching styles with pending typing preserves text/selection/history and does not resend local patches. Wide tables/code may overflow only inside their block.
- [ ] Implement mode classes/variables, high contrast/focus tokens, local fonts, controls/overflow menu, layout remeasure, and source-anchor restoration without recreating EditorView.
- [ ] Run `npm run test:webview -- appearance`, `npm run test:visual -- appearance`; inspect light/dark/high contrast results. Commit `feat: add document appearance and width controls`.

**Deliverable:** UX-11, UX-15–16 implemented with zero source diff.

### Task 14 — Durable file preferences and multi-view presentation sync

**Files:** `src/extension/ViewPreferencesStore.ts`, `src/protocol/viewPreferences.ts`, `test/unit/viewPreferences.test.ts`, `test/integration/viewPreferences.test.ts`.

**Consumes:** Task 13 controls, host URI/config/session. **Produces:** FileViewOverrides/PreferenceRecord/store interface from §19.1; hydrate/preferences messages.

- [ ] Add `same_basename_different_uris_independent`, `split_same_uri_converges_preferences`, `rename_migrates_copy_does_not`, `reset_inherits_changed_defaults`, invalid schema fallback, disabled remembrance, and LRU 1001st-record eviction tests.
- [ ] Implement precedence, sparse override storage, serialized updates, allowlisted validation, observe rename/delete, session-only untitled overrides, and reset commands. Never store document text in this store.
- [ ] Test reopen VS Code/custom tabs restores preferences with unchanged source. Reset workspace clears only markami presentation state; transient scroll/selection remains per-view.
- [ ] Run preference unit/integration tests; commit `feat: remember document view preferences outside Markdown`.

**Deliverable:** UX-12–14 verified, with identity-preserving presentation state.

### Task 15 — Find, outline, command completeness, and accessibility

**Files:** `src/webview/ui/find/`, `outline/`, `src/extension/commands.ts`, `configuration.ts`, `src/webview/editor/keymap.ts`, `test/webview/navigation.test.ts`, `accessibility.test.ts`, `docs/accessibility.md`.

**Consumes:** all action/features registries and preferences. **Produces:** complete manifest command/settings entries, visible/document-text find and explicit source find, heading outline with source offsets.

- [ ] Add find next/previous/count/case/whole-word cases, hidden syntax vs explicit source search, outline duplicate slugs, source island search, and narrow-pane navigation.
- [ ] Audit every §22 command: correct active custom view routing, stable context keys, safe native-editor behavior, platform modifiers, no shortcut takeover outside markami. Test source reveal naming consistency.
- [ ] Exercise keyboard-only formatting, slash, task/table editing, link/image dialogs, moves, preferences/reset, and save. Verify ARIA labels/pressed/checkbox state, live move announcements, visible focus, Escape, tab order, zoom, high contrast, and reduced motion.
- [ ] Run navigation/accessibility UI tests. Record screen-reader smoke results or exact unavailable environment; commit `feat: complete keyboard navigation and accessible controls`.

**Deliverable:** Required workflows usable without mouse and with accessible semantics.

### Task 16 — Hardening, security, recovery stress, and performance

**Files:** `test/fidelity/corpus.test.ts`, `test/unit/properties.test.ts`, `test/protocol/stress.test.ts`, `test/integration/diskFidelity.test.ts`, `test/webview/ime.test.ts`, `scripts/bench.ts`, `docs/delivery/verification.md`.

**Consumes:** completed features. **Produces:** release-quality evidence, real-world fixture corpus, benchmarks and regression limits, documented environment.

- [ ] Build golden corpus covering all syntax combinations, not isolated headings only. Assert open/close/cursor/render/style no-touch, operation-specific allowed ranges, exact undo, and two-view convergence.
- [ ] Run fast-check properties: projection purity, patch inverse, outside-range equality, stale overlap rejection, idempotency, random EOL/Unicode, and move core preservation. Store reproducible failing seeds.
- [ ] Stress delayed/out-of-order duplicate messages, rapid typing, source/AI edits, Save All, autosave, webview reload, extension restart, untitled Save As, disk failure/read-only, rename/delete, and recovery store limit. Explain every unresolved race; release blocks data integrity defects.
- [ ] Test unsafe HTML/URLs/remote resources, message spoofing/oversized input, resource roots, symlinks, workspace trust, dependency licenses, packaged CSP, and no content in default diagnostics.
- [ ] Bench fixtures 10KB/100KB/1MB, p95 typing, memory/cache cleanup, repeated open/close. Use spec targets; record OS/CPU/VS Code/build, warm/cold conditions, five runs, and comparison to targets. Performance misses must be documented and resolved or explicitly accepted before release.
- [ ] Run minimum/stable VS Code on Linux and stable on Windows/macOS; include manual real IME smoke where possible. Browser synthetic composition alone does not prove native IME behavior.
- [ ] Run `npm run verify`, `npm run test:webview`, `npm run test:integration`, `npm run test:visual`, `npm run bench`; create verification report from actual results. Commit `test: harden fidelity and release reliability`.

**Deliverable:** Defensible evidence supporting every integrity and quality claim.

### Task 17 — Packaged VSIX, user docs, and clean-profile installation

**Files:** `.vscodeignore`, `README.md`, `CHANGELOG.md`, `LICENSE`, `SECURITY.md`, `PRIVACY.md`, `docs/syntax-support.md`, `docs/contributing.md`, `media/icon.png`, `media/marketplace/`, `scripts/checkPackage.mjs`, `docs/delivery/install-smoke.md`.

**Consumes:** Task 16 passing evidence. **Produces:** `artifacts/markami-<version>.vsix`, SHA-256 checksum, tested install/update/uninstall instructions and honest support matrix.

- [ ] Package production bundles only. Include local renderer assets/fonts/license notices; exclude tests, dev credentials, temp drafts, workspace files, screenshots not needed at runtime, and private diagnostics.
- [ ] Document opening/default association, rendering/source reveal, six required UX additions, file preference resets, resource policy, fidelity limits, troubleshooting, and bug-report reproduction. Create actual-product screenshots/GIFs; no mockups presented as shipped UI.
- [ ] Local packaging uses a clearly documented development publisher identifier only if the owner's real publisher is unavailable; mark the package as local testing and require replacement before public publish. It is not a claim to own that Marketplace namespace.
- [ ] Run `npm run package`, inspect VSIX ZIP manifest/assets, compute checksum, install using clean profile/extensions directory, open representative docs, edit/save/undo, test offline widgets, uninstall and reopen native Markdown. Record actual results.
- [ ] Test upgrade from prior preview if one exists; preserve preference migration and current Markdown content. Record untested upgrade scenario honestly when no prior build exists. Commit `build: package and document markami for installation`.

**Deliverable:** A real installable VSIX and user-facing operating documentation.

### Task 18 — Release automation and Marketplace delivery

**Files:** `.github/workflows/release.yml`, `security.yml`, `scripts/releasePreflight.mjs`, `docs/releasing.md`, `docs/delivery/release-notes.md`.

**Consumes:** packaged validated extension and owner release inputs. **Produces:** manual release workflow, checksummed GitHub release artifact if authorized/configured, Marketplace-ready metadata, and verified published result when credentials/authorization are available.

- [ ] Implement release preflight: clean revision, explicit semantic version, changelog/version match, required verification artifacts, real publisher, no placeholder metadata, allowed license/dependency notices, known blockers absent.
- [ ] Workflow re-runs quality checks and build from tagged revision, packages that exact commit, generates checksum, retains artifacts, and publishes through a protected environment/manual gate. Use repository/environment secrets; never write tokens to files/logs. Do not fetch secrets by asking them to be pasted into a document.
- [ ] Require owner inputs: Marketplace publisher identity/control, supported authentication secret, repository/release target, license decision if not already established, approved public version/listing. Missing inputs block only public publishing; do all package/docs/preflight work first.
- [ ] Dry-run packaging/preflight without credentials; verify bad publisher/version/failed fidelity prevents publish. Where publishing is authorized, execute workflow, inspect provider response, then verify listing version and installable public artifact. A workflow dispatch alone is not proof of publishing.
- [ ] Deliver VSIX/checksum, release notes, actual test/platform status, and Marketplace URL only when verified. If external inputs are missing, state “locally installable; Marketplace release prepared” and name the precise remaining input. Commit `ci: add gated markami release workflow`.

**Deliverable:** Reproducible release process, and a published extension only after the real provider confirms it.

## 48. Development Tooling and CI Contract

### 48.1 npm scripts

| Script | Contract | Failure conditions |
|---|---|---|
| `lint` | ESLint production/test TS | Errors; no blanket rule suppression |
| `typecheck` | Separate host/webview/test tsconfigs | Any type error; no unchecked protocol cast |
| `build` | Clean deterministic esbuild/Vite production output | Missing runtime assets or bundle error |
| `test:unit` | Vitest core planners/source maps | Assertion failure |
| `test:protocol` | Session/bridge/schema tests | Lost/duplicate/stale edits |
| `test:fidelity` | Golden exact-string/byte and allowed-range tests | Unrelated change or content loss |
| `test:webview` | Browser harness with VS Code API mock | Broken interaction, selection, focus, or source patch |
| `test:integration` | Real VS Code provider/document/file lifecycle | History/save/sync mismatch |
| `test:visual` | Small reviewed theme/layout baselines | Unexpected clipping/contrast/layout regression |
| `bench` | Recorded fixture timings and cleanup checks | Regression beyond agreed threshold |
| `package` | vsce plus package-content inspection | Invalid manifest/missing asset/private file |
| `verify` | lint + typecheck + unit + protocol + fidelity + build | Any constituent failure |

Choose a real browser harness for UI tests and connect it to the production webview entrypoint, not a second toy editor implementation. Playwright browser tests validate interaction logic but cannot prove VS Code save/history routing; integration tests cover that boundary. The transport mock uses production protocol schemas. Dependency versions are resolved once at bootstrap, locked, and updated deliberately; never rely on an unpinned CDN or a guessed “latest” library API.

### 48.2 CI scheduling

- Pull request: npm ci, verify, webview tests, Linux integration, package smoke, retained failure diagnostics without document secrets.
- Main: PR checks plus visual baselines and benchmark regression checks.
- Scheduled/manual: stable Windows/macOS/Linux and declared-minimum compatibility matrix; native input/accessibility manual results linked separately.
- Release: exact tagged commit, full quality matrix, license/dependency review, VSIX validation, checksum, guarded publishing.

Set least-privilege workflow permissions, explicit timeout, concurrency cancellation for superseded PR builds, and stable dependency caches keyed by lockfile. Never cancel an in-progress publishing job in a way that hides whether a release succeeded. No flaky check may be routinely skipped to make the pipeline green; quarantine with visible issue only when it is not a mandatory integrity gate.

## 49. Codex Operating Instructions

### 49.1 Startup prompt

Use this as the first implementation request after the documents are reviewed:

> Implement markami from `spec.md` and `impl.md`. Read both files completely and inspect the repository before edits. Execute §47 task-by-task, preserving the canonical TextDocument/source-projection architecture. Start with Tasks 1–4, prove coordinate mapping, synchronization, save/history, and recovery, then continue through all tasks. Maintain `docs/delivery/progress.md` and record actual check results. Do not claim end-to-end completion at the first vertical slice. Do not replace Markdown with a rich-text canonical model, skip required UX features, invent publisher credentials, or mark unavailable platform checks passed. Continue autonomously within the authorized development scope; report concrete blockers and preserve all completed work.

This text is an execution instruction for the future coding session; producing these documents does not itself create a repository or run product tests.

### 49.2 Checkpoint discipline

Before a session ends, record exact revision, completed task/checks, next task, unresolved defects, and instructions to reproduce current failing test. Keep checkpoint small enough to review. On resume, verify current files against the checkpoint before continuing. If code changed externally, inspect the diff and adapt; never overwrite it to recreate a remembered state.

Use a task branch/worktree when modifying an existing repository. Do not reset or delete unrelated working changes. Keep tasks cohesive and review source planners/protocol separately from presentation. Optional delegation is an execution choice, not a requirement or excuse to skip shared-interface verification. The plan is fully executable by one Codex agent.

### 49.3 Completion report format

Report: delivered capabilities; packaged VSIX/version/checksum; commands actually run and pass/fail; OS/VS Code versions tested; accessibility/IME manual status; known limitations; release/publication status. Link evidence and artifacts. Do not describe mocked browser tests as real VS Code end-to-end tests. Do not describe prepared Marketplace metadata as a published extension.

## 50. Final Feature Coverage Ledger

| Requested capability | Spec contract | Implementation | Required verification |
|---|---|---|---|
| Slash commands mandatory | §11.5 | §13.16, Task 7 | Trigger/filter/cancel/insert/history/external edits |
| Contextual floating toolbar | §11.6 | §13.15, Task 6 | Pointer/keyboard selection, formatting locality, stale anchors |
| Block handles and drag reorder | §11.7 | §13.17, Task 8 | Exact core bytes, seams, frontmatter, cancellation, one undo |
| Alternate document appearance | §8.6 | §25.1, Task 13 | Both modes × themes, zero source changes |
| Full/configurable document width | §8.7, §23 | §25.1, Task 13 | All modes, 960 default, 480–2400 validation, narrow pane |
| Per-file appearance/width/reveal preferences | §8.8 | §19.1, Task 14 | Reopen/split/rename/reset/LRU/copy independence |
| Source-preserving rendered editor | §§8–10, 20–21 | Tasks 2–5 | Byte/offset/sync/history golden corpus |
| Technical syntax and normal repository UX | §§9, 12–19 | Tasks 9–12, 15 | Syntax support matrix and interaction fixtures |
| Entire VS Code extension delivery | §38 | Tasks 1–18 | Build/tests/VSIX install/release evidence |

Focus mode, arbitrary nested drag reparenting, graphical Mermaid editing, browser hosts, and mandatory clipboard-image capture remain outside 1.0. These exclusions do not remove any missing or partially covered feature requested in the earlier comparison: both appearance choices, explicit full/max width, slash commands, selection formatting, block dragging, and file preference persistence are required.
