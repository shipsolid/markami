# VSIX package and installation smoke — 0.1.0

Date: 2026-10-09

## Artifact

| Field | Result |
|---|---|
| Package | `artifacts/markami-0.1.0.vsix` |
| Size | 4,182,803 bytes |
| SHA-256 | `6f18bd356d0415406f6d1adacafd5815c836d968f837f1398d4b59cdec5aa4c5` |
| Publisher | `markami-dev` — local testing only |
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

## Native-host checklist still required

1. Verify the checksum and install the exact VSIX with isolated `--user-data-dir` and
   `--extensions-dir` directories.
2. Confirm `markami-dev.markami@0.1.0` in **Extensions: Show Installed Extensions**.
3. Open representative LF and CRLF fixtures through **Reopen Editor With… → markami**.
4. Exercise direct text edit, source reveal, undo/redo, save/reopen, two views, table edit, slash menu,
   selection toolbar, block move, outline/find, local image, safe HTML, Mermaid, math, and source islands.
5. Disconnect networking and reopen Mermaid/math/code documents; verify packaged assets only.
6. Trigger an overlapping external edit and verify inspect/copy/reload/discard recovery choices.
7. Uninstall from the isolated extension directory, reopen the same Markdown with the native editor,
   and verify content plus line endings are unchanged.

## Upgrade and capture status

No prior preview VSIX exists, so upgrade/migration testing is not applicable to this first packaged
version and remains unverified. Actual-product screenshots/GIFs could not be captured because the
native runtime did not start. No generated mockup is presented as shipped UI; capture guidance is in
`media/marketplace/README.md`.
