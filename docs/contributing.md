# Contributing

## Non-negotiable contract

- `vscode.TextDocument` is the only canonical Markdown state.
- Webviews send validated, version-bound local patches; never serialize a rendered AST to Markdown.
- Preserve untouched UTF-16 ranges and line separators exactly.
- Keep renderer assets local, CSP restrictive, resource access host-controlled, and diagnostics
  content-free by default.
- Add a failing behavioral test before production changes and record evidence in
  `docs/delivery/progress.md`.

## Setup

Requirements: Node.js 22 or newer, npm, and VS Code 1.102 or newer.

```bash
npm ci
npm run verify
```

Use the smallest relevant red/green loop, then run the appropriate gates:

```bash
npm run test:webview
npm run test:visual
npm run build:integration
npm run bench
```

Native integration, browser visual, IME, accessibility, and cross-platform checks are release gates
when the host can run them. Never turn an unavailable environment into a passing claim.

## Change boundaries

- Put source parsing, ranges, and patch planning in `src/core`.
- Keep protocol schemas and versioning in `src/protocol`; treat every webview message as untrusted.
- Keep filesystem, VS Code API, navigation, and preference persistence in `src/extension`.
- Keep projection and interaction in `src/webview`; an interaction must resolve back to confirmed source
  ranges before it writes.
- Add fidelity fixtures for EOL, Unicode, malformed syntax, delimiters, and surrounding-byte invariants.

Run `npm run check:licenses` after dependency changes and regenerate
`THIRD_PARTY_NOTICES.txt` with `npm run generate:notices`.

## Package locally

```bash
npm run package
npm run check:package
```

The package command builds production bundles, creates `artifacts/markami-<version>.vsix`, checks its
strict contents allowlist, and writes a SHA-256 checksum. Inspect and install that exact artifact in a
clean profile before release work.

## Install a local build

1. Run `npm run package`, which writes `artifacts/markami-<version>.vsix`.
2. In VS Code, run **Extensions: Install from VSIX…** and select the file, or from a shell:

   ```bash
   code --install-extension artifacts/markami-<version>.vsix
   ```

3. Open a `.md` or `.markdown` file and click the markami icon in the editor title bar, or run
   **Reopen Editor With…** and select **markami**.

`npm run package` also writes a checksum file under `artifacts/` for the dev build; do not stage it (run
`git checkout artifacts` and delete any untracked `.sha256`).

The committed Marketplace publisher is `shipsolid`. Local packaging does not publish an extension.
Public delivery requires explicit owner authorization, protected Entra federation, and the release
preflight; do not publish outside that workflow.

## Commits and reviews

- Keep one logical change per imperative commit; explain why in the body when the motivation is not
  obvious.
- Do not bypass hooks or force-push protected branches.
- Review source fidelity, stale-version behavior, protocol bounds, CSP/resource boundaries, recovery,
  keyboard/accessibility behavior, and package contents—not only the rendered happy path.
