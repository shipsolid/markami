# Release verification evidence

This report records the checks actually run for Task 16. It is evidence for the tested revision, not a claim that unavailable platforms or native input/accessibility paths passed.

## Tested revision and environment

| Field | Value |
|---|---|
| Tested revision | Task 16 follow-up tree based on `6eb5d14` (tests ran before the follow-up commit; code content is identical) |
| Extension version | `0.1.0` |
| Host | WSL2 Linux `6.6.87.1-microsoft-standard-WSL2`, x86-64 |
| CPU | 13th Gen Intel Core i7-13800H, 6 logical CPUs exposed |
| Node/npm | Node `24.21.0`, npm `11.19.0` |
| Declared VS Code compatibility | `^1.102.0` |
| Installed VS Code attempted | `1.141.0` |

Node 22, VS Code 1.102, native Windows, native macOS, and a native Linux desktop were not available in this environment.

## Automated checks

| Command | Result | Evidence boundary |
|---|---|---|
| `npm run verify` | Pass | Lint, strict typecheck, 89 unit, 32 protocol, 55 fidelity tests, license allowlist, production builds |
| `npm run test:webview` | Pass | 74 deterministic jsdom tests; this is not a native VS Code webview run |
| `npm run test:visual` | Pass | 5 deterministic CSS/theme/focus baselines |
| `npm run build:integration` | Pass | Extension-host integration suite type-compiles against VS Code APIs; it was not executed |
| `npm run bench` | Pass | Synthetic Node parser/projection proxy; measurements below |
| `npm run test:visual:browser` | Blocked before tests | Chromium could not load `libnspr4.so` |
| `npm run test:integration` | Blocked before Mocha | Update lookup first failed with `EAI_AGAIN`; installed VS Code 1.141.0 then could not load `libnspr4.so` |
| `npm audit --omit=dev` | 2 low findings | Mermaid 12.1.0 transitively resolves KaTeX 0.16.47; details below |

The executed deterministic suites cover source-range locality, exact inverse operations, EOL/BOM/final-newline combinations, randomized Unicode coordinates, stale/duplicate/generation-rotated protocol messages, bounded payloads/replay state/draft publication, per-view recovery ordering and atomic clearing, recovery choices, composition deferral/conflict handling, sanitization, URL/resource policy, and CSP construction. Save All, large-document fallback, and non-file document lifecycle cases are present in the compiled integration suite but remain behaviorally unrun because the VS Code host could not launch.

## Performance measurements

The benchmark ran five opening samples per size after bundling the production parser/projection path. The typing figure contains 100 samples against a 100 KiB document. Times are milliseconds.

| Workload | Median | p95 | Target | Result |
|---|---:|---:|---:|---|
| 10 KiB open/projection proxy | 5.44 | 9.80 | 200 | Pass |
| 100 KiB open/projection proxy | 37.21 | 56.01 | 500 | Pass |
| 1 MiB open/projection proxy | 490.51 | 507.05 | 1,500 | Pass |
| 100 KiB typing-to-projection proxy | 30.37 | 33.73 | 50 | Pass |

Twenty-five repeated projections produced a post-forced-GC heap delta of 821,264 bytes. This is a process-level diagnostic, not proof that a browser webview is leak-free. The benchmark does not measure VS Code activation, DOM layout, paint, native IME latency, or repeated Electron open/close behavior.

## Security and dependency review

- Protocol request objects reject unknown keys, authenticate the sending view, bind replay identity to view/generation/request ID, reject changed replay payloads, and enforce a 4 MiB aggregate UTF-8 text limit.
- Documents above 4 MiB fall back to the complete canonical VS Code source editor; content is not truncated or copied into the rendered webview.
- Webview assets remain local, resource messages are schema-validated, filesystem traversal and symlink escapes fail closed, and the generated CSP is covered by a regression test.
- `npm run check:licenses` reviewed 242 production dependency manifests/license files against the repository allowlist.
- `npm audit --omit=dev` reports two low-severity findings for Mermaid's nested KaTeX 0.16.47 (`GHSA-238p-pmpm-9mq7`). The offered automatic fix force-downgrades Mermaid to 10.8.0, a breaking renderer change, so it was not applied silently. Current Mermaid rendering uses local assets, strict security configuration, and no trusted KaTeX execution, but the advisory remains open and must be re-evaluated before public release.

## Platform, input, and accessibility matrix

| Surface | Status | Notes |
|---|---|---|
| WSL2 deterministic Node/jsdom suites | Pass | Commands and counts recorded above |
| Chromium production-CSS visual run | Blocked | Missing host `libnspr4.so` |
| VS Code 1.141.0 extension host | Blocked | Electron failed before Mocha for the same missing library |
| Minimum VS Code 1.102 | Not run | Binary/runtime unavailable |
| Node 22 | Not run | Node 24.21.0 was available |
| Native Windows stable | Not run | Platform unavailable |
| Native macOS stable | Not run | Platform unavailable |
| Native Linux desktop stable | Not run | WSL2 has no working Electron/Chromium runtime |
| Real IME composition | Not run | Synthetic composition ordering passes; it is not native IME proof |
| Screen reader / AT-SPI | Not run | No native assistive-technology session available |

## Release disposition

No deterministic data-integrity failure is open in the tested suites. Public release evidence is incomplete: the native VS Code/browser gates, declared minimum runtime, Windows/macOS matrix, real IME, and screen-reader smoke remain outstanding. The low-severity transitive KaTeX advisory also remains an explicit dependency exception. A local VSIX may be prepared and inspected in Task 17, but this report does not authorize Marketplace publishing or describe the extension as fully platform-verified.
