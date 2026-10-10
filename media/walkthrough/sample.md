# Welcome to markami

You are editing this document in its rendered form. Click into any text and type.

## Try it

- [ ] Tick this task
- [ ] Rewrite this line, then save with Ctrl/Cmd+S
- [ ] Run **markami: Open Source Editor** to see the plain Markdown behind this page

| Try | Where |
| --- | --- |
| Edit a table cell in place | Click any cell |
| Insert a block | Type `/` in an empty paragraph |
| Reveal exact syntax | Put the caret in a block and press Ctrl/Cmd+Shift+M |

## Technical content

Inline math such as $e^{i\pi} + 1 = 0$ renders locally, and so do diagrams:

```mermaid
flowchart LR
  Rendered[Rendered edit] --> Patch[Small source patch] --> File[Your Markdown file]
```

```ts
export const greeting = 'Code blocks are highlighted and numbered.';
```

> Everything here works offline, and nothing leaves your machine.
