import { describe, expect, test } from 'vitest';
import { webviewMessageSchema } from '../../src/protocol/schemas.js';

describe('resource protocol', () => {
  test('accepts bounded typed requests and rejects spoofed or oversized payloads', () => {
    expect(webviewMessageSchema.safeParse({
      type: 'resourceRequest', requestId: 'image-1', action: 'resolveImage', rawPath: './image.png'
    }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({
      type: 'resourceRequest', requestId: 'link-1', action: 'openLink', rawPath: 'javascript:alert(1)'
    }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({
      type: 'resourceRequest', requestId: '', action: 'pickImage'
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      type: 'resourceRequest', requestId: 'image-2', action: 'resolveImage', rawPath: 'x'.repeat(16_385)
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      type: 'resourceRequest', requestId: 'x', action: 'readFile', rawPath: './secret'
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      type: 'resourceRequest', requestId: 'x', action: 'resolveImage', rawPath: './image.png', injected: true
    }).success).toBe(false);
  });
});
