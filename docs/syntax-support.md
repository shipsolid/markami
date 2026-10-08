# Syntax support

markami treats the VS Code text document as canonical. “Rendered editing” means a user action maps to a
validated local Markdown patch; “source island” means exact source remains directly editable because a
safe rendered interaction is unavailable.

| Syntax | Presentation | Editing contract |
|---|---|---|
| Paragraphs, ATX/Setext headings | Rendered | Direct text; heading conversion preserves local form where safe |
| Bold, italic, strike, inline code | Rendered | Direct text, shortcuts, selection toolbar; local delimiters only |
| Links and images | Rendered controls | Inline/reference forms preserved; host validates navigation/resources |
| Ordered, unordered, nested, task lists | Rendered | Continue/exit/indent/outdent; checkbox uses a minimal marker patch |
| Blockquotes, dividers, alerts | Rendered | Direct text or local insertion; original markers retained where possible |
| GFM tables | Accessible grid | Cell edits are local; row/column changes may normalize only the table |
| Fenced code | Render plus source editing | Fence character/length/info string preserved; code is never executed |
| Mermaid fences | Local diagram plus source | Source is canonical; failures retain editable source |
| Inline/display math | Local KaTeX plus source | Conservative recognition; trust disabled; source always reachable |
| YAML frontmatter | Compact metadata/source block | Exact CST ranges; invalid/ambiguous YAML stays source; no form serialization |
| Safe raw HTML | Sanitized display | Narrow allowlist; unsafe or ambiguous HTML becomes source, never changes on view |
| MDX, custom directives, unknown syntax | Source island | Exact source editing; never executed or discarded |

## Preservation guarantees

- Viewing, scrolling, finding, opening the outline, changing appearance, and toggling source reveal do
  not modify Markdown.
- Untouched UTF-16 ranges, original LF/CRLF separators, BOM, and final-newline state remain exact.
- Each accepted edit is version-bound, bounded, validated, and one VS Code undo operation where the
  command contract says so.
- Concurrent views converge through the canonical document. Stale or overlapping patches are rejected
  or recovered, not guessed.
- `markami.fidelity.strict` defaults to `true`; uncertain constructs degrade to source.

## Configuration-sensitive rendering

| Setting | Default | Effect |
|---|---:|---|
| `markami.renderMath` | `true` | Local KaTeX display and math insertion |
| `markami.renderMermaid` | `true` | Local Mermaid display; source insertion remains available when off |
| `markami.renderSafeHtml` | `true` | Sanitized allowlisted HTML display |
| `markami.remoteImages` | `prompt` | Block, confirm, or allow remote HTTPS images |
| `markami.syntaxReveal` | `activeBlock` | Active-block, selection, or manual delimiter reveal |
| `markami.fidelity.strict` | `true` | Prefer editable source over an unsafe visual transformation |

## Limits

- The protocol snapshot limit is 4 MiB UTF-8; larger documents open in the native source editor rather
  than being truncated.
- Local recovery is bounded to 10 MiB per scope and warns before local work would exceed capacity.
- Initial support is desktop VS Code in local filesystem workspaces. Remote workspace operations fail
  closed when an equivalent URI-safe operation is unavailable; browser extension hosts are deferred.
- HTML is not a general browser surface, MDX components do not execute, and merged-table-cell UI is not
  invented for syntax Markdown cannot express.
