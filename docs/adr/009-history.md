# ADR-009: Canonical history and save routing

- Status: accepted for current stable; minimum-version/platform verification remains open
- Decision date: 2026-10-07

## Decision

- VS Code `TextDocument` history is the only undo/redo authority.
- CodeMirror does not keep or submit an independent inverse-patch history.
- A markami history request first flushes the document session, verifies that the requesting custom tab is active, then invokes VS Code's `undo` or `redo` command.
- Save first awaits the canonical mutation queue, then calls `TextDocument.save()`. A failed save remains dirty and is never reported as successful.
- Unacknowledged full draft text is stored separately from presentation state, capped at 10 MiB per scope, and cleared only after verified acknowledgement.

## Evidence

On VS Code 1.141.0 for Linux under Xvfb:

- one text-only `WorkspaceEdit` produced one undo step;
- undo restored exact source and returned the document to clean state;
- redo restored exact edited source and dirty state;
- a filesystem provider write failure returned `false`, retained dirty text, and did not alter the provider's canonical bytes.

Node-level protocol tests also prove that save does not begin until an in-flight patch finishes.

## Remaining gate

Repeat the routing/grouping experiment on VS Code 1.102.0 and stable Windows/macOS. Native IME composition/history interaction remains part of Task 16; these checks are not marked passed here.
