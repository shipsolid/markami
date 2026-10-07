# markami contributor contract

- `vscode.TextDocument` is the only canonical Markdown state.
- Webview edits cross the protocol as validated local patches; never serialize a full AST back to Markdown.
- Preserve untouched UTF-16 ranges and original line separators exactly.
- Keep renderer assets local and webview CSP restrictive.
- Add a failing behavioral test before production changes and record task evidence in `docs/delivery/progress.md`.
- Run `npm run verify`; run platform integration, webview, visual, and benchmark checks for release work.
- Use the development publisher only for local VSIX builds. Public publishing requires the owner's real publisher and explicit authorization.
