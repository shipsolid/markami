# Source-preserving editing

Edit **rendered prose**, `inline code`, and [safe links](https://code.visualstudio.com/) without rebuilding the document from an abstract syntax tree.

> Reveal the active block whenever exact Markdown syntax matters.

## Bounded changes

1. Validate the local operation.
2. Apply a minimal UTF-16 patch.
3. Preserve every untouched byte range.

Unknown directives remain source islands:

:::custom-directive
This syntax is preserved, not guessed.
:::
