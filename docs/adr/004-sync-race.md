# ADR-004: Version-check and apply race

- Status: accepted for implementation; minimum-version verification remains a release gate
- Decision date: 2026-10-07

## Context

`workspace.applyEdit` applies a text-only `WorkspaceEdit` all-or-nothing, but the public extension API does not accept a `TextDocument.version` precondition. An extension-side version check is therefore not an atomic compare-and-swap.

Reference: [VS Code API — `workspace.applyEdit`](https://code.visualstudio.com/api/references/vscode-api#workspace.applyEdit).

## Decision

- Serialize markami-originated mutations per canonical document.
- Reject a request unless `baseVersion` and the exact source snapshot match immediately before dispatch.
- Put every local change into one text-only `WorkspaceEdit`; never mix resource edits into a document patch.
- Correlate the resulting canonical change using request ID, expected text, and resulting version.
- Treat a rejected edit, version gap, or unexpected canonical result as a conflict and retain the optimistic draft.
- Never describe the public VS Code edit API as compare-and-swap.

The protocol test injects an external version/text change between initial validation and adapter apply; the local edit is rejected and the external text remains intact. The VS Code 1.141.0 split-view test confirms one canonical `TextDocument` and a successful all-or-nothing external edit.

## Consequences

- A change observed before dispatch is rejected without mutation.
- VS Code owns ordering after dispatch; markami verifies the resulting canonical text before acknowledging.
- Declared-minimum VS Code 1.102.0 and cross-platform race experiments remain mandatory before release. Any evidence of partial or stale range application blocks release.
