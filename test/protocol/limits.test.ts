import { describe, expect, test } from 'vitest';
import {
  hostMessageSchema,
  parseHostMessage,
  patchRequestSchema,
  webviewMessageSchema
} from '../../src/protocol/schemas.js';
import { MAX_PROTOCOL_TEXT_BYTES, isProtocolTextWithinLimit } from '../../src/protocol/limits.js';
import { PROTOCOL_VERSION } from '../../src/protocol/version.js';

const viewPreferences = {
  schemaVersion: 1,
  rememberPerFile: true,
  effective: {
    appearance: 'vscode',
    width: 'auto',
    maxContentWidth: 960,
    syntaxReveal: 'activeBlock',
    outlineCollapsed: false
  }
};

describe('protocol payload limits', () => {
  test('measures the v1 text limit in UTF-8 bytes', () => {
    expect(isProtocolTextWithinLimit('a'.repeat(MAX_PROTOCOL_TEXT_BYTES))).toBe(true);
    expect(isProtocolTextWithinLimit('😀'.repeat((MAX_PROTOCOL_TEXT_BYTES / 4) + 1))).toBe(false);
  });

  test('rejects oversized recovery drafts and patch inserts before dispatch', () => {
    const base = {
      requestId: 'request',
      viewId: 'view',
      generation: 1,
      baseVersion: 1
    };

    expect(patchRequestSchema.safeParse({
      ...base,
      patches: [],
      draftText: '😀'.repeat((MAX_PROTOCOL_TEXT_BYTES / 4) + 1)
    }).success).toBe(false);
    expect(patchRequestSchema.safeParse({
      ...base,
      patches: [{ from: 0, to: 0, insert: 'x'.repeat(MAX_PROTOCOL_TEXT_BYTES + 1) }]
    }).success).toBe(false);
    expect(patchRequestSchema.safeParse({
      ...base,
      patches: [{ from: 0, to: 0, insert: 'x'.repeat(2 * 1024 * 1024) }],
      draftText: 'y'.repeat(3 * 1024 * 1024)
    }).success).toBe(false);
  });

  test('bounds independently published recovery drafts', () => {
    expect(webviewMessageSchema.safeParse({
      type: 'storeDraft', viewId: 'view', generation: 1, revision: 1, baseVersion: 1,
      draftText: 'x'.repeat(MAX_PROTOCOL_TEXT_BYTES)
    }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({
      type: 'storeDraft', viewId: 'view', generation: 1, revision: 1, baseVersion: 1,
      draftText: 'x'.repeat(MAX_PROTOCOL_TEXT_BYTES + 1)
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({ type: 'requestSourceFallback' }).success).toBe(true);
  });

  test('rejects malformed and oversized host state before webview dispatch', () => {
    expect(hostMessageSchema.safeParse({
      type: 'hydrate',
      protocolVersion: PROTOCOL_VERSION,
      viewId: 'view',
      generation: 1,
      document: { text: '# Safe\n', version: 1, eol: '\n' },
      viewPreferences
    }).success).toBe(true);
    expect(parseHostMessage({
      type: 'hydrate', protocolVersion: PROTOCOL_VERSION + 1, viewId: 'view', generation: 1,
      document: { text: '', version: 1, eol: '\n' }, viewPreferences
    })).toEqual({ ok: false, requestSnapshot: true });
    expect(hostMessageSchema.safeParse({
      type: 'hydrate',
      protocolVersion: PROTOCOL_VERSION,
      viewId: 'view',
      generation: 1,
      document: { version: 1, eol: '\n' },
      viewPreferences
    }).success).toBe(false);
    expect(hostMessageSchema.safeParse({
      type: 'hydrate',
      protocolVersion: PROTOCOL_VERSION,
      viewId: 'view',
      generation: 1,
      document: { text: 'x'.repeat(MAX_PROTOCOL_TEXT_BYTES + 1), version: 1, eol: '\n' },
      viewPreferences
    }).success).toBe(false);
    expect(hostMessageSchema.safeParse({
      type: 'documentChanged',
      beforeVersion: 1,
      version: 2,
      changes: [{ from: 0, to: 0, insert: 'safe' }],
      injected: true
    }).success).toBe(false);
    expect(parseHostMessage({
      type: 'documentChanged',
      beforeVersion: 1,
      version: 2,
      changes: [{ from: 4, to: 2, insert: 'unsafe' }]
    })).toEqual({ ok: false, requestSnapshot: true });
    expect(parseHostMessage({
      type: 'documentChanged', beforeVersion: 1, version: 2,
      changes: [{ from: 0, to: 2, insert: '' }, { from: 1, to: 3, insert: '' }]
    })).toEqual({ ok: false, requestSnapshot: true });
    expect(parseHostMessage({ type: 'documentChanged', version: 2 })).toEqual({
      ok: false,
      requestSnapshot: true
    });
    expect(parseHostMessage({ type: 'unknown' })).toEqual({ ok: false, requestSnapshot: false });
  });
});

describe('configuration message', () => {
  const configuration = {
    type: 'configuration',
    selectionToolbarEnabled: true,
    slashCommandsEnabled: true,
    mathEnabled: true,
    blockHandlesEnabled: true,
    outlineEnabled: true,
    renderMermaid: true,
    renderSafeHtml: true,
    showSourceIslandLabels: true,
    debugShowSourceRanges: false,
    codeBlockWrap: true,
    codeBlockLineNumbers: true,
    useEditorFont: true
  };

  test('carries the document palette and rejects unknown palettes', () => {
    for (const documentPalette of ['catppuccin-mocha', 'vscode']) {
      expect(hostMessageSchema.safeParse({ ...configuration, documentPalette }).success).toBe(true);
    }
    expect(hostMessageSchema.safeParse({ ...configuration, documentPalette: 'neon' }).success).toBe(false);
    expect(hostMessageSchema.safeParse(configuration).success).toBe(false);
  });
});

