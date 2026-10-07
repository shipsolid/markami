# ADR-010: Table edits use cell patches or a table-only rewrite

- Status: Accepted
- Date: 2026-10-07

## Decision

markami maps GFM table cells directly from source, recognizing escaped pipes and pipes inside code spans.

- Direct cell edits replace only the mapped content range and retain its surrounding whitespace.
- Alignment edits replace only the selected delimiter cell.
- Row/column changes may serialize the table boundary, but never surrounding Markdown, and retain the table's existing line-ending style and alignment intent.
- A stale or malformed mapping disables the grid and exposes source.

Stage A decorated source did not meet direct cross-cell editing needs, so 1.0 uses a source-mapped grid widget. Tab follows the DOM cell order; Tab in the final cell appends one row as one editor transaction.
