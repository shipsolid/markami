# Reliable Markdown, edited where you read it

markami keeps the open `vscode.TextDocument` canonical while projecting a focused rendered editing surface.

> [!NOTE]
> Untouched source ranges, line endings, and unknown syntax stay exactly as written.

## Release readiness

- [x] Edit headings, prose, links, lists, and tasks in place
- [x] Use VS Code save, undo, redo, and dirty state
- [x] Keep renderer assets local and private documents offline

| Capability | Behavior |
|---|---|
| Source reveal | Local to the active block |
| Multiple views | One canonical document |
| Recovery | Never silently overwrites work |

Select **Document** appearance or change the width without modifying Markdown.
