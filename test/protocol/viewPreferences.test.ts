import { describe, expect, test } from 'vitest';
import { DocumentSession, type CanonicalDocument, type WebviewEndpoint } from '../../src/extension/DocumentSession.js';
import { webviewMessageSchema } from '../../src/protocol/schemas.js';
import type { HostMessage } from '../../src/protocol/messages.js';
import type { ViewPreferencesState } from '../../src/protocol/viewPreferences.js';
import { HostBridge } from '../../src/webview/bridge/hostBridge.js';
import { PROTOCOL_VERSION } from '../../src/protocol/version.js';

const preferences: ViewPreferencesState = {
  schemaVersion: 1,
  rememberPerFile: true,
  effective: {
    appearance: 'document',
    width: 'readable',
    maxContentWidth: 880,
    syntaxReveal: 'selection',
    outlineCollapsed: true
  }
};

function endpoint(id: string): WebviewEndpoint & { messages: HostMessage[] } {
  const messages: HostMessage[] = [];
  return {
    id,
    messages,
    postMessage(message) {
      messages.push(message);
      return Promise.resolve(true);
    }
  };
}

function document(): CanonicalDocument {
  return {
    uri: 'file:///workspace/doc.md',
    version: 1,
    getText: () => '# Canonical\n',
    apply: () => Promise.resolve({ ok: false, reason: 'not used', version: 1, text: '# Canonical\n' })
  };
}

describe('view preference protocol', () => {
  test('protocol_v3_rejects_a_retained_v1_hydration', () => {
    expect(PROTOCOL_VERSION).toBe(3);
    const bridge = new HostBridge({ postMessage: () => undefined });
    bridge.handle({
      type: 'hydrate',
      protocolVersion: 1,
      viewId: 'old',
      document: { text: 'old', version: 1, eol: '\n' },
      viewPreferences: preferences
    } as unknown as HostMessage);

    expect(bridge.queue).toBeUndefined();
  });

  test('accepts_allowlisted_changes_without_uri_and_rejects_spoofed_fields', () => {
    expect(webviewMessageSchema.safeParse({
      type: 'updateViewPreferences',
      changes: { appearance: 'document', width: 'full', maxContentWidth: 1200 }
    }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({
      type: 'updateViewPreferences',
      uri: 'file:///other.md',
      changes: { appearance: 'document' }
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      type: 'updateViewPreferences',
      changes: { remoteImages: 'allow' }
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      type: 'updateViewPreferences',
      changes: { maxContentWidth: Number.POSITIVE_INFINITY }
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({ type: 'resetFileViewPreferences' }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({ type: 'resetWorkspaceViewPreferences' }).success).toBe(true);
  });

  test('split_same_uri_converges_preferences_without_changing_source', () => {
    const canonical = document();
    const session = new DocumentSession(canonical);
    const first = endpoint('first');
    const second = endpoint('second');
    session.attach(first);
    session.attach(second);

    session.sendSnapshot(first.id, preferences);
    session.broadcastViewPreferences(preferences);

    expect(first.messages[0]).toMatchObject({ type: 'hydrate', viewPreferences: preferences });
    expect(first.messages[1]).toEqual({ type: 'viewPreferencesChanged', viewPreferences: preferences });
    expect(second.messages[0]).toEqual({ type: 'viewPreferencesChanged', viewPreferences: preferences });
    expect(canonical.getText()).toBe('# Canonical\n');
  });
});
