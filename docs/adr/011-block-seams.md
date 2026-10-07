# ADR-011: Preserve block cores and move adjacent separators

- Status: Accepted
- Date: 2026-10-07

## Decision

Block moves operate on parser-bounded top-level source ranges. The block core is never regenerated.

- Moving upward deletes the separator immediately before the source block together with its core, then inserts `core + separator` before the target.
- Moving downward deletes the source core together with its following separator, then inserts `separator + core` after the target.
- Frontmatter stays pinned. Unterminated fences and other ambiguous ranges cannot move.
- The planner applies the proposed old-coordinate patches to a copy and reparses it. It rejects any result whose top-level core sequence differs from the requested reorder.

This makes a move one host transaction while preserving LF/CRLF separators, EOF-without-newline state, and every byte inside moved and unrelated block cores.

## Consequences

- Whitespace travels only as the separator required to keep the moved block distinct.
- Nested container items are not independent drag targets in 1.0.
- A structurally ambiguous document keeps its source editable but disables unsafe movement.
