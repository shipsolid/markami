# Privacy

markami does not collect telemetry, create an account, upload document contents, or use a hosted
rendering service.

## Data kept locally

- Markdown remains in the VS Code `TextDocument` and the user's workspace.
- Presentation preferences may be stored in VS Code workspace/global state by document URI.
- A bounded recovery draft may be stored locally while an edit is awaiting synchronization or after a
  conflict. It can contain unsaved Markdown and is cleared after verified synchronization or explicit
  discard.
- Diagnostic output contains version/state/count information, not document content by default.

Use **markami: Reset File View Preferences** or **Reset Workspace View Preferences** to remove remembered
presentation overrides. Recovery choices are shown when a divergent draft exists.

## Network and external resources

Packaged editor, font, syntax-highlighting, Mermaid, and math assets work offline. markami makes no
product analytics or cloud-sync requests. A document can cause an HTTPS image request only according to
the user-controlled `markami.remoteImages` setting (`prompt` by default). Opening an external link is an
explicit user action routed through VS Code. Remote servers can observe normal request metadata when a
remote image or link is allowed.

Local image insertion reads only the file explicitly selected by the user and copies it only after
confirmation into a workspace-confined destination. Clipboard access occurs only for an explicit copy
operation; this release does not monitor the clipboard.
