---
adr: 012
title: Keep document view preferences in host-owned URI-keyed state
status: accepted
date: 2026-10-08
deciders: Amit
domain: platform
---

## Context

markami must remember presentation choices without weakening its central guarantee that the VS Code `TextDocument` is the only canonical Markdown state. Appearance, width, maximum content width, syntax reveal policy, and outline collapse state need to converge across split views and survive reopen. Defaults remain resource-scoped VS Code configuration, while files with the same basename, remote authorities, untitled documents, rename, copy, deletion, disabled remembrance, and corrupt or future preference schemas require unambiguous behavior.

The preference channel must not accept a URI from the webview or permit document content, trust, remote-image, or network policy fields. Pending text recovery and transient caret, selection, scroll, and individually revealed blocks have separate lifecycles.

## Decision

Store sparse, allowlisted presentation overrides in extension-host state keyed by the complete canonical document URI, resolve them over validated resource configuration, and broadcast the resulting versioned effective state to every attached view of that document.

Use workspace state when a workspace exists and local global state otherwise, without Settings Sync registration. Saved-document records use schema version 1, an access timestamp, and a 1,000-record least-recently-used bound. Untitled documents and saved documents while `rememberPerFile` is disabled use in-memory session overrides. Reset removes overrides so changed defaults can flow through. Observed rename moves the old key, observed deletion prunes the key and descendants, and copy creates no preference record.

Webviews submit only validated partial changes for their attached document; they never submit an arbitrary URI. Hydration and subsequent `viewPreferencesChanged` messages carry schema version, remembrance state, and effective preferences. Presentation messages do not enter the source-patch queue.

## Alternatives Considered

- **Write preferences into YAML frontmatter or Markdown comments** — rejected because presentation state would modify portable document content and violate the no-touch guarantee.
- **Use resource configuration keys per file** — rejected because it would pollute user/workspace settings, complicate full-URI identity, and risk Settings Sync propagation of local paths.
- **Persist webview state only** — rejected because it is panel-local, cannot guarantee split-view convergence, and is not an authoritative durable store across reopen.
- **Key records by basename or filesystem path** — rejected because duplicate basenames collide and path-only keys discard URI scheme and authority for remote workspaces.
- **Persist full effective preferences** — rejected because copied defaults would become stale and prevent later resource-configuration changes from flowing to files without explicit overrides.

## Consequences

**Positive:** Markdown bytes remain untouched; duplicate names and remote authorities stay independent; split views converge through the host; reset restores inheritance; invalid fields and unsupported schemas degrade safely; storage cannot grow without bound.

**Negative / accepted costs:** Preference reads and writes are serialized through extension state; LRU access updates add small host-state writes; workspace and no-workspace scopes are intentionally separate; transient session overrides disappear on close when remembrance is disabled.

**Follow-ups required:** Task 15 completes outline UI and keyboard-accessible preference/reset workflows. Task 16 repeats lifecycle stress for Save As, external rename ambiguity, corrupt state, and platform-specific VS Code behavior.

## Links

- [Implementation plan §19.1](../impl.md#191-host-owned-view-preferences)
- [Product specification §8.8](../spec.md#88-per-file-view-preferences--required)
- [ADR-004 sync race](004-sync-race.md)
- [ADR-009 canonical history](009-history.md)
