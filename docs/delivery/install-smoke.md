# VSIX package and installation smoke — 0.1.0

Date: 2026-10-10

## Artifact

| Field | Result |
|---|---|
| Package | `artifacts/markami-0.1.0.vsix` |
| Size | 4,210,861 bytes |
| SHA-256 | `78769743b641bbf1818bbe543734cbc39c407fcd1aea3e38691bf2bb2fde6727` |
| Publisher | `shipsolid` — owner-controlled public publisher |
| VSIX contents | 282 files; strict package policy passed |
| Archive integrity | `unzip -t` passed for every entry |
| License notices | 242 production dependency records grouped into 86 reproduced notices |

The packaged surface contains the extension manifest, user/legal documents, icon, extension bundle,
webview entrypoint, local renderer chunks, and local fonts. The package policy rejects source, tests,
scripts, fixtures, delivery logs, source maps, credentials, workspace files, and marketplace captures.
It also resolves every static import, re-export, dynamic import, `new URL(..., import.meta.url)`, and
CSS URL against the archive and rejects absolute packaged-asset URLs.

Commands executed successfully:

```bash
npm run package
npm run check:package
(cd artifacts && sha256sum -c markami-0.1.0.vsix.sha256)
unzip -t artifacts/markami-0.1.0.vsix
```

## Host

- Linux `6.6.87.1-microsoft-standard-WSL2` x86_64
- Node.js `24.21.0`; npm `11.19.0`
- VS Code CLI `1.141.0`, commit `2a59476c9bfcb90b3ddc372c36762471b7dfad1c`
- Cached VS Code Linux x64 `1.141.0`

## Clean-profile attempt

The launch attempt below used an earlier package candidate. The native runtime failed before VS Code
could install or load that candidate, so it provides environment evidence only and makes no behavioral
claim about the final artifact identified above.

A unique profile was created at `/tmp/markami-install.Qx4ISS` with separate `user-data` and
`extensions` directories. The WSL remote CLI ignored those desktop-only directory switches and could
not connect to its existing IPC socket (`EPERM`). Retrying with the cached native CLI and the remote
CLI environment removed reached the expected Electron binary, which exited before VS Code startup:

```text
code: error while loading shared libraries: libnspr4.so: cannot open shared object file
```

Therefore this host did **not** execute install, representative-document open, edit/save/undo, offline
Mermaid/math/code widgets, uninstall, or native-Markdown reopen. None is recorded as passing. The VSIX
is structurally valid and complete, but a supported native host must run the checklist below before a
public release.

The 2026-10-10 publisher-migration candidate was retried with `npm run test:integration` and
`npm run test:visual:browser`. Both cached runtimes again exited with code 127 before test execution
because `libnspr4.so` is unavailable; no native or browser result is claimed from those attempts.

## Native-host checklist still required

1. Verify the checksum and install the exact VSIX with isolated `--user-data-dir` and
   `--extensions-dir` directories.
2. Confirm `shipsolid.markami@0.1.0` in **Extensions: Show Installed Extensions**.
3. Open representative LF and CRLF fixtures through **Reopen Editor With… → markami**.
4. Exercise direct text edit, source reveal, undo/redo, save/reopen, two views, table edit, slash menu,
   selection toolbar, block move, outline/find, local image, safe HTML, Mermaid, math, and source islands.
5. Disconnect networking and reopen Mermaid/math/code documents; verify packaged assets only.
6. Trigger an overlapping external edit and verify inspect/copy/reload/discard recovery choices.
7. Uninstall from the isolated extension directory, reopen the same Markdown with the native editor,
   and verify content plus line endings are unchanged.

## Scripted installed-VSIX smoke (2026-10-10)

`npm run smoke:install` replaces the unreachable WSL attempt above with a repeatable run of the packaged
artifact. It verifies the `.sha256`, installs the VSIX with the VS Code CLI into isolated
`--extensions-dir` and `--user-data-dir` directories, confirms `shipsolid.markami@<version>` is listed,
runs the integration suite against the installed extension (a throwaway development extension only hosts
the runner), uninstalls it, confirms it is gone, and checks that a BOM+CRLF Markdown file opens in the
native editor with identical bytes.

| Run | Host | Result |
|---|---|---|
| Container with networking disabled | Playwright Ubuntu 24.04 image on WSL2, VS Code 1.141.0 Linux x64, Xvfb | pass: 16 integration tests against the installed VSIX, clean uninstall |
| CI `install-smoke` job | GitHub `ubuntu-latest`, VS Code stable | pass in run 38039775318 |

The two view-preference integration tests are skipped because they drive a command that is registered
only in extension test mode. Offline rendering of Mermaid, math, and code is covered separately by
`test/visual-browser/technical.spec.ts`, which aborts every non-local request. Not covered: Windows and
macOS installs, upgrade from a prior version (none exists), and the hand-driven interaction steps 4 and 6
in the checklist above (slash menu, selection toolbar, block move, outline/find, table edit, and the
overlapping-edit recovery choices by hand).

## Capture status

The capture workflow was dispatched on `main` twice. The first run exposed a Mermaid sanitizer defect,
fixed in PR #5; the second produced the committed images (PR #6). Review notes and accepted cosmetic
issues are recorded in [`release-notes.md`](release-notes.md). No generated mockup is presented as
shipped UI; the capture contract is in `media/marketplace/README.md`.
