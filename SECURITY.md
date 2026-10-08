# Security policy

## Supported versions

The `0.1.x` developer preview receives security fixes. No public Marketplace build is currently
published.

## Report a vulnerability

Do not open a public issue for an unpatched vulnerability or include a private Markdown document,
workspace path, token, or credential in a report.

Use GitHub's private vulnerability reporting flow at
<https://github.com/shipsolid/markami/security/advisories/new>. Include the affected version, VS Code
and OS versions, impact, minimal reproduction, and whether workspace trust or remote resources are
involved. If private reporting is unavailable, open a content-free issue asking the owner for a
private contact channel.

The project will acknowledge a complete report, reproduce it, assess affected versions, and coordinate
disclosure after a fix is available. No response-time SLA is promised for this developer preview.

## Security boundaries

- Webview scripts, styles, fonts, Mermaid, and math assets are local and governed by a nonce-based CSP.
- Webview messages are schema-, size-, view-, and generation-validated by the extension host.
- File access and external navigation remain host-controlled; traversal, symlink escape, and executable
  URL schemes fail closed.
- Raw HTML is allowlist-sanitized for display and never serialized back to the source DOM.
- Diagnostics exclude document content by default.
