import { describe, expect, test } from 'vitest';
import { applyPatchSet, createTextPatch, type TextPatch } from '../../src/core/source/PatchSet.js';
import {
  DocumentSession,
  type CanonicalDocument,
  type DocumentApplyResult,
  type WebviewEndpoint
} from '../../src/extension/DocumentSession.js';
import type { HostMessage, PatchRequest } from '../../src/protocol/messages.js';
import { webviewMessageSchema } from '../../src/protocol/schemas.js';
import { PatchQueue } from '../../src/webview/bridge/patchQueue.js';

class MemoryDocument implements CanonicalDocument {
  public readonly uri = 'file:///stress.md';
  public version = 1;
  public applyCount = 0;

  public constructor(public text = '') {}

  public getText(): string {
    return this.text;
  }

  public apply(baseVersion: number, patches: readonly TextPatch[]): Promise<DocumentApplyResult> {
    if (baseVersion !== this.version) {
      return Promise.resolve({ ok: false, reason: 'stale version', version: this.version, text: this.text });
    }
    this.text = applyPatchSet(this.text, patches);
    this.version += 1;
    this.applyCount += 1;
    return Promise.resolve({ ok: true, version: this.version, text: this.text });
  }
}

function endpoint(id: string): WebviewEndpoint & { readonly messages: HostMessage[] } {
  const messages: HostMessage[] = [];
  return { id, messages, postMessage: (message) => { messages.push(message); return Promise.resolve(true); } };
}

function request(requestId: string, viewId: string, baseVersion: number, insert: string): PatchRequest {
  return {
    requestId,
    viewId,
    generation: 1,
    baseVersion,
    patches: [createTextPatch(baseVersion, baseVersion, insert)]
  };
}

describe('protocol stress and spoof resistance', () => {
  test('converges after hundreds of delayed acknowledgements', () => {
    const sent: PatchRequest[] = [];
    const queue = new PatchQueue('view', 1, '', 1, (message) => sent.push(message));

    for (let index = 0; index < 250; index += 1) {
      queue.enqueueLocal([createTextPatch(index, index, String(index % 10))]);
    }
    for (let index = 0; index < 250; index += 1) {
      const message = sent[index];
      if (message === undefined) throw new Error(`missing request ${String(index)}`);
      queue.accept(`out-of-order-${String(index)}`, index + 2);
      queue.accept(message.requestId, index + 2);
      queue.accept(message.requestId, index + 2);
    }

    expect(queue.state).toBe('synced');
    expect(queue.acknowledgedText).toBe(queue.optimisticText);
    expect(queue.acknowledgedText).toHaveLength(250);
  });

  test('ignores duplicate or older external deliveries and conflicts on a version gap', () => {
    const queue = new PatchQueue('view', 1, 'a', 2, () => undefined);
    const change = [createTextPatch(1, 1, 'b')];

    queue.applyExternal(change, 2, 3);
    queue.applyExternal(change, 2, 3);
    queue.applyExternal([], 1, 2);
    expect(queue.state).toBe('synced');
    expect(queue.acknowledgedText).toBe('ab');
    expect(queue.acknowledgedVersion).toBe(3);

    queue.applyExternal([], 4, 5);
    expect(queue.state).toBe('conflict');
    expect(queue.conflictReason).toBe('external change version gap');
  });

  test('binds requests to their sending view and rejects changed duplicate payloads', async () => {
    const document = new MemoryDocument('a');
    const first = endpoint('first');
    const second = endpoint('second');
    const session = new DocumentSession(document);
    session.attach(first);
    session.attach(second);

    await session.enqueuePatch(request('same', first.id, 1, 'b'), first.id);
    await session.enqueuePatch(request('same', first.id, 1, 'c'), first.id);
    await session.enqueuePatch(request('spoof', first.id, 2, 'x'), second.id);

    expect(document.text).toBe('ab');
    expect(document.applyCount).toBe(1);
    expect(first.messages.at(-1)).toMatchObject({ type: 'patchRejected', reason: 'request id reused with different payload' });
    expect(second.messages.at(-1)).toMatchObject({ type: 'patchRejected', reason: 'request view does not match sender' });
  });

  test('strictly rejects extra fields and non-integral offsets', () => {
    const valid = {
      type: 'applyPatch',
      request: {
        requestId: 'r', viewId: 'v', generation: 1, baseVersion: 1,
        patches: [{ from: 0, to: 0, insert: 'x' }]
      }
    };

    expect(webviewMessageSchema.safeParse({ ...valid, injected: true }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      ...valid,
      request: { ...valid.request, injected: true }
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      ...valid,
      request: { ...valid.request, patches: [{ from: 0, to: 0, insert: 'x', injected: true }] }
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({
      ...valid,
      request: { ...valid.request, patches: [{ from: 0.5, to: 0.5, insert: 'x' }] }
    }).success).toBe(false);
    expect(webviewMessageSchema.safeParse({ type: 'recoveryChoice', choice: 'inspect' }).success).toBe(true);
    expect(webviewMessageSchema.safeParse({ type: 'recoveryChoice', choice: 'restore' }).success).toBe(false);
  });
});
