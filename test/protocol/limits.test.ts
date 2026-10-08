import { describe, expect, test } from 'vitest';
import { patchRequestSchema } from '../../src/protocol/schemas.js';
import { MAX_PROTOCOL_TEXT_BYTES, isProtocolTextWithinLimit } from '../../src/protocol/limits.js';

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
});
