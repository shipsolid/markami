// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { ResourceClient } from '../../src/webview/features/images/ResourceClient.js';

describe('ResourceClient', () => {
  afterEach(() => vi.useRealTimers());
  test('correlates image selection and fragment navigation by request ID', async () => {
    const sent: unknown[] = [];
    const navigate = vi.fn();
    const client = new ResourceClient({ postMessage: (message) => sent.push(message) }, navigate);
    const pendingImage = client.pickImage();
    const request = sent[0] as { requestId: string };
    expect(client.handle({ type: 'resourceResult', requestId: request.requestId, action: 'pickImage', ok: true, markdown: '![a](a.png)' })).toBe(true);
    await expect(pendingImage).resolves.toBe('![a](a.png)');

    const pendingLink = client.openLink('#target');
    const linkRequest = sent[1] as { requestId: string };
    client.handle({ type: 'resourceResult', requestId: linkRequest.requestId, action: 'openLink', ok: true, fragment: 'target' });
    await expect(pendingLink).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('target');
  });

  test('does not resolve a request with a spoofed request ID', () => {
    const sent: unknown[] = [];
    const client = new ResourceClient({ postMessage: (message) => sent.push(message) }, vi.fn());
    void client.resolveImage('./a.png');
    expect(client.handle({ type: 'resourceResult', requestId: 'other', action: 'resolveImage', ok: true, uri: 'x' })).toBe(false);
  });

  test('times out and disposes pending requests without retaining callbacks', async () => {
    vi.useFakeTimers();
    const client = new ResourceClient({ postMessage: vi.fn() }, vi.fn(), 100);
    const timedOut = client.resolveImage('./slow.png');
    await vi.advanceTimersByTimeAsync(100);
    await expect(timedOut).resolves.toBeUndefined();

    const disposed = client.openLink('./pending.md');
    client.dispose();
    await expect(disposed).resolves.toBe(false);
  });
});
