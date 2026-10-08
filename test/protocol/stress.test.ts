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
import { HostBridge, shouldApplyExternalChange } from '../../src/webview/bridge/hostBridge.js';
import { PROTOCOL_VERSION } from '../../src/protocol/version.js';

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

  test('publishes every optimistic draft while an earlier patch is in flight', () => {
    const sent: PatchRequest[] = [];
    const drafts: string[] = [];
    const queue = new PatchQueue('view', 1, '', 1, (message) => sent.push(message), (draft) => drafts.push(draft));

    queue.enqueueLocal([createTextPatch(0, 0, 'A')]);
    queue.enqueueLocal([createTextPatch(1, 1, 'B')]);

    expect(sent).toHaveLength(1);
    expect(drafts).toEqual(['A', 'AB']);
  });

  test('applies a duplicate host delivery to the visible editor only once', () => {
    let visibleApplications = 0;
    const bridge = new HostBridge({ postMessage: () => undefined }, (message, owned, disposition) => {
      if (message.type === 'documentChanged' && shouldApplyExternalChange(disposition.externalChange, owned)) {
        visibleApplications += 1;
      }
    });
    bridge.handle(hydration(1, 'a', 1));
    const changed: HostMessage = {
      type: 'documentChanged', beforeVersion: 1, version: 2,
      changes: [createTextPatch(1, 1, 'b')]
    };

    bridge.handle(changed);
    bridge.handle(changed);

    expect(visibleApplications).toBe(1);
    expect(bridge.queue?.acknowledgedText).toBe('ab');
  });

  test('ignores a delayed rejection from the previous hydrated generation', () => {
    const matched: boolean[] = [];
    const sent: unknown[] = [];
    const bridge = new HostBridge({ postMessage: (message) => sent.push(message) }, (message, _owned, disposition) => {
      if (message.type === 'patchRejected') matched.push(disposition.rejectionMatched === true);
    });
    bridge.handle(hydration(1, 'a', 1));
    bridge.queue?.enqueueLocal([createTextPatch(1, 1, 'b')]);
    const requestId = (sent.find((message) => (message as { type?: string }).type === 'applyPatch') as {
      request: PatchRequest;
    }).request.requestId;
    bridge.handle(hydration(2, 'canonical', 2));

    bridge.handle({
      type: 'patchRejected', requestId, reason: 'old generation',
      document: { text: 'a', version: 1 }
    });

    expect(matched).toEqual([false]);
    expect(bridge.queue?.state).toBe('synced');
    expect(bridge.queue?.optimisticText).toBe('canonical');
  });

  test('coalesces rapid full-draft publication to one in-flight and one latest', () => {
    const sent: unknown[] = [];
    const bridge = new HostBridge({ postMessage: (message) => sent.push(message) });
    bridge.handle(hydration(1, '', 1));

    bridge.queue?.enqueueLocal([createTextPatch(0, 0, 'A')]);
    bridge.queue?.enqueueLocal([createTextPatch(1, 1, 'B')]);
    bridge.queue?.enqueueLocal([createTextPatch(2, 2, 'C')]);
    const drafts = () => sent.filter((message) => (message as { type?: string }).type === 'storeDraft') as Array<{
      revision: number;
      draftText: string;
    }>;
    expect(drafts().map((draft) => draft.draftText)).toEqual(['A']);

    bridge.handle({ type: 'draftStored', viewId: 'view', generation: 1, revision: 1 });

    expect(drafts().map((draft) => draft.draftText)).toEqual(['A', 'ABC']);
    expect(drafts().map((draft) => draft.revision)).toEqual([1, 3]);
  });

  test('restores the exact latest webview draft before a slow durable acknowledgement', () => {
    let state: unknown;
    const storage = {
      getState: () => state,
      setState: (value: unknown) => { state = value; }
    };
    const firstSent: unknown[] = [];
    const first = new HostBridge({ postMessage: (message) => firstSent.push(message) }, undefined, storage);
    first.handle(hydration(1, '', 1));
    first.queue?.enqueueLocal([createTextPatch(0, 0, 'A')]);
    first.queue?.enqueueLocal([createTextPatch(1, 1, 'B')]);
    first.queue?.enqueueLocal([createTextPatch(2, 2, 'C')]);

    const secondSent: unknown[] = [];
    let restored: string | undefined;
    const second = new HostBridge(
      { postMessage: (message) => secondSent.push(message) },
      (message, _owned, disposition) => {
        if (message.type === 'hydrate') restored = disposition.restoredDraft;
      },
      storage
    );
    second.handle(hydration(2, '', 1));

    expect(state).toEqual({ draftText: 'ABC', baseVersion: 1 });
    expect(restored).toBe('ABC');
    expect(secondSent).toContainEqual(expect.objectContaining({
      type: 'storeDraft', viewId: 'view', generation: 2, revision: 1, draftText: 'ABC'
    }));
  });

  test('old-generation draft acknowledgement cannot release the new generation slot', () => {
    const sent: unknown[] = [];
    const bridge = new HostBridge({ postMessage: (message) => sent.push(message) });
    bridge.handle(hydration(1, '', 1));
    bridge.queue?.enqueueLocal([createTextPatch(0, 0, 'A')]);
    bridge.handle(hydration(2, '', 1));
    bridge.queue?.enqueueLocal([createTextPatch(0, 0, 'X')]);
    bridge.queue?.enqueueLocal([createTextPatch(1, 1, 'Y')]);

    bridge.handle({ type: 'draftStored', viewId: 'view', generation: 1, revision: 1 });
    const generationTwo = () => sent.filter((message) => {
      const candidate = message as { type?: string; generation?: number };
      return candidate.type === 'storeDraft' && candidate.generation === 2;
    }) as Array<{ draftText: string }>;
    expect(generationTwo().map((draft) => draft.draftText)).toEqual(['X']);

    bridge.handle({ type: 'draftStored', viewId: 'view', generation: 2, revision: 1 });
    expect(generationTwo().map((draft) => draft.draftText)).toEqual(['X', 'XY']);
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

function hydration(generation: number, text: string, version: number): HostMessage {
  return {
    type: 'hydrate', protocolVersion: PROTOCOL_VERSION, viewId: 'view', generation,
    document: { text, version, eol: '\n' },
    viewPreferences: {
      schemaVersion: 1,
      rememberPerFile: true,
      effective: {
        appearance: 'vscode', width: 'auto', maxContentWidth: 960,
        syntaxReveal: 'activeBlock', outlineCollapsed: false
      }
    }
  };
}
