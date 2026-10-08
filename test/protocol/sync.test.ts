import { describe, expect, test } from 'vitest';
import { createTextPatch, type TextPatch } from '../../src/core/source/PatchSet.js';
import {
  DocumentSession,
  type CanonicalDocument,
  type DocumentApplyResult,
  type WebviewEndpoint
} from '../../src/extension/DocumentSession.js';
import { PatchQueue } from '../../src/webview/bridge/patchQueue.js';
import type { HostMessage, PatchRequest } from '../../src/protocol/messages.js';
import { RecoveryStore, type RecoveryRecord, type RecoveryStorage } from '../../src/extension/RecoveryStore.js';
import { MAX_PROTOCOL_TEXT_BYTES } from '../../src/protocol/limits.js';

class MemoryDocument implements CanonicalDocument {
  public readonly uri = 'file:///doc.md';
  public version = 1;
  public text: string;
  public applyCount = 0;
  public failNext = false;
  public throwNext = false;
  public beforeApply: (() => void) | undefined;
  public saveCount = 0;

  public constructor(text: string) {
    this.text = text;
  }

  public getText(): string {
    return this.text;
  }

  public save(): Promise<boolean> {
    this.saveCount += 1;
    return Promise.resolve(true);
  }

  public async apply(baseVersion: number, patches: readonly TextPatch[]): Promise<DocumentApplyResult> {
    if (this.throwNext) {
      this.throwNext = false;
      throw new Error('transport failed');
    }
    this.beforeApply?.();
    this.beforeApply = undefined;
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, reason: 'apply failed', version: this.version, text: this.text };
    }
    if (baseVersion !== this.version) {
      return { ok: false, reason: 'stale version', version: this.version, text: this.text };
    }
    const { applyPatchSet } = await import('../../src/core/source/PatchSet.js');
    this.text = applyPatchSet(this.text, patches);
    this.version += 1;
    this.applyCount += 1;
    return { ok: true, version: this.version, text: this.text };
  }
}

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

class MemoryRecoveryStorage implements RecoveryStorage {
  public records: readonly RecoveryRecord[];
  public failUpdates = false;

  public constructor(records: readonly RecoveryRecord[] = []) {
    this.records = records;
  }

  public get(): readonly RecoveryRecord[] {
    return this.records;
  }

  public update(records: readonly RecoveryRecord[]): PromiseLike<void> {
    if (this.failUpdates) return Promise.reject(new Error('storage unavailable'));
    this.records = records;
    return Promise.resolve();
  }
}

function request(
  requestId: string,
  viewId: string,
  baseVersion: number,
  patches: readonly TextPatch[]
): PatchRequest {
  return { requestId, viewId, generation: 1, baseVersion, patches };
}

function sentRequest(requests: readonly PatchRequest[], index: number): PatchRequest {
  const value = requests[index];
  if (value === undefined) {
    throw new Error(`missing request ${String(index)}`);
  }
  return value;
}

describe('versioned synchronization', () => {
  test('delayed_ack_three_local_edits_preserve_order', () => {
    const sent: PatchRequest[] = [];
    const queue = new PatchQueue('view-a', 1, '', 1, (message) => sent.push(message));

    queue.enqueueLocal([createTextPatch(0, 0, 'A')]);
    queue.enqueueLocal([createTextPatch(1, 1, 'B')]);
    queue.enqueueLocal([createTextPatch(2, 2, 'C')]);

    expect(sent).toHaveLength(1);
    expect(queue.optimisticText).toBe('ABC');
    queue.accept(sentRequest(sent, 0).requestId, 2);
    expect(sent).toHaveLength(2);
    expect(sentRequest(sent, 1).baseVersion).toBe(2);
    queue.accept(sentRequest(sent, 1).requestId, 3);
    expect(sent).toHaveLength(3);
    expect(sentRequest(sent, 2).baseVersion).toBe(3);
    queue.accept(sentRequest(sent, 2).requestId, 4);

    expect(queue.acknowledgedText).toBe('ABC');
    expect(queue.optimisticText).toBe('ABC');
    expect(queue.state).toBe('synced');
  });

  test('stale_overlapping_edit_rejected', async () => {
    const document = new MemoryDocument('canonical');
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);
    document.text = 'external canonical';
    document.version = 2;

    await session.enqueuePatch(request('r1', view.id, 1, [createTextPatch(0, 9, 'local')]));

    expect(document.text).toBe('external canonical');
    expect(view.messages.at(-1)).toMatchObject({ type: 'patchRejected', requestId: 'r1', reason: 'stale version' });
  });

  test('same_request_replay_applied_once', async () => {
    const document = new MemoryDocument('a');
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);
    const patchRequest = request('same', view.id, 1, [createTextPatch(1, 1, 'b')]);

    await session.enqueuePatch(patchRequest);
    await session.enqueuePatch(patchRequest);

    expect(document.text).toBe('ab');
    expect(document.applyCount).toBe(1);
    expect(view.messages.filter((message) => message.type === 'patchAccepted')).toHaveLength(2);
  });

  test('rotated webview generation accepts new sequence and rejects delayed old requests', async () => {
    const document = new MemoryDocument('a');
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);

    await session.enqueuePatch(request('view-a:1:1', view.id, 1, [createTextPatch(1, 1, 'b')]), view.id);
    const generation = session.rotateGeneration(view.id);
    await session.enqueuePatch({
      ...request('view-a:2:1', view.id, 2, [createTextPatch(2, 2, 'c')]),
      generation
    }, view.id);
    await session.enqueuePatch(request('view-a:1:2', view.id, 3, [createTextPatch(3, 3, 'old')]), view.id);

    expect(document.text).toBe('abc');
    expect(generation).toBe(2);
    expect(view.messages.at(-1)).toMatchObject({ type: 'patchRejected', reason: 'stale webview generation' });
  });

  test('recovery storage failure warns but does not strand the canonical patch', async () => {
    const document = new MemoryDocument('a');
    const view = endpoint('view-a');
    const storage = new MemoryRecoveryStorage();
    storage.failUpdates = true;
    const session = new DocumentSession(document, new RecoveryStore(storage));
    session.attach(view);

    await session.enqueuePatch({
      ...request('r', view.id, 1, [createTextPatch(1, 1, 'b')]),
      draftText: 'ab'
    }, view.id);

    expect(document.text).toBe('ab');
    expect(view.messages).toContainEqual(expect.objectContaining({ type: 'showError', code: 'RECOVERY_STORAGE' }));
    expect(view.messages).toContainEqual(expect.objectContaining({ type: 'patchAccepted', requestId: 'r' }));
  });

  test('pre-existing divergent recovery survives accepted edits until explicit discard', async () => {
    const original: RecoveryRecord = {
      uri: 'file:///doc.md', baseVersion: 1, canonicalBaseHash: 'sha256:old',
      draftText: 'irreplaceable recovered draft', timestamp: 1
    };
    const storage = new MemoryRecoveryStorage([original]);
    const document = new MemoryDocument('a');
    const view = endpoint('view-a');
    const session = new DocumentSession(document, new RecoveryStore(storage));
    session.attach(view);

    await session.enqueuePatch({
      ...request('new', view.id, 1, [createTextPatch(1, 1, 'b')]),
      draftText: 'ab'
    }, view.id);

    expect(document.text).toBe('ab');
    expect(session.recoveredDraft()?.draftText).toBe(original.draftText);
    await session.clearRecoveredDraft();
    expect(session.recoveredDraft()).toBeUndefined();
  });

  test('newer queued optimistic draft survives failure of the earlier patch', async () => {
    const storage = new MemoryRecoveryStorage();
    const document = new MemoryDocument('');
    document.failNext = true;
    const view = endpoint('view-a');
    const session = new DocumentSession(document, new RecoveryStore(storage));
    session.attach(view);

    await session.storeDraft(view.id, 1, 1, 1, 'A');
    const applying = session.enqueuePatch({
      ...request('first', view.id, 1, [createTextPatch(0, 0, 'A')]),
      draftText: 'A'
    }, view.id);
    await session.storeDraft(view.id, 1, 2, 1, 'AB');
    await applying;

    expect(session.recoveredDraft()?.draftText).toBe('AB');
  });

  test('accepted earlier patch cannot clear its newer queued draft', async () => {
    const storage = new MemoryRecoveryStorage();
    const document = new MemoryDocument('');
    const view = endpoint('view-a');
    const session = new DocumentSession(document, new RecoveryStore(storage));
    session.attach(view);
    await session.storeDraft(view.id, 1, 1, 1, 'A');

    const applying = session.enqueuePatch(request('first', view.id, 1, [createTextPatch(0, 0, 'A')]), view.id);
    await session.storeDraft(view.id, 1, 2, 1, 'AB');
    await applying;

    expect(document.text).toBe('A');
    expect(session.recoveredDraft()?.draftText).toBe('AB');
  });

  test('accepted view cannot erase another views stale recovery draft', async () => {
    const storage = new MemoryRecoveryStorage();
    const document = new MemoryDocument('');
    const first = endpoint('first');
    const second = endpoint('second');
    const session = new DocumentSession(document, new RecoveryStore(storage));
    session.attach(first);
    session.attach(second);
    await session.storeDraft(second.id, 1, 1, 1, 'B');
    await session.storeDraft(first.id, 1, 1, 1, 'A');

    await session.enqueuePatch(request('first-edit', first.id, 1, [createTextPatch(0, 0, 'A')]), first.id);
    await session.enqueuePatch(request('second-stale', second.id, 1, [createTextPatch(0, 0, 'B')]), second.id);

    expect(document.text).toBe('A');
    expect(second.messages.at(-1)).toMatchObject({ type: 'patchRejected', reason: 'stale version' });
    expect(session.recoveredDraft()?.draftText).toBe('B');
  });

  test('oversized outbound canonical state falls back without posting the text', () => {
    const document = new MemoryDocument('a');
    const messages: HostMessage[] = [];
    let fallbacks = 0;
    const session = new DocumentSession(document);
    session.attach({
      id: 'view-a',
      postMessage: (message) => { messages.push(message); return Promise.resolve(true); },
      fallbackToSource: () => { fallbacks += 1; }
    });
    document.text = 'x'.repeat(MAX_PROTOCOL_TEXT_BYTES + 1);
    document.version = 2;

    session.handleCanonicalDocumentChanged(1, 2, [createTextPatch(1, 1, document.text.slice(1))]);

    expect(fallbacks).toBe(1);
    expect(messages).toHaveLength(0);
  });

  test('replay metadata stays bounded for a near-limit rejected draft', async () => {
    const document = new MemoryDocument('canonical');
    document.version = 2;
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);
    await session.enqueuePatch({
      ...request('large-stale', view.id, 1, [createTextPatch(0, 0, '')]),
      draftText: 'x'.repeat(MAX_PROTOCOL_TEXT_BYTES - 1)
    }, view.id);

    const internal = session as unknown as { processed: Map<string, unknown> };
    expect(JSON.stringify([...internal.processed.values()]).length).toBeLessThan(2_000);
  });

  test('failed_apply_preserves_draft', () => {
    const sent: PatchRequest[] = [];
    const queue = new PatchQueue('view-a', 1, 'host', 1, (message) => sent.push(message));
    queue.enqueueLocal([createTextPatch(4, 4, ' draft')]);

    queue.reject(sentRequest(sent, 0).requestId, 'host', 1, 'apply failed');

    expect(queue.optimisticText).toBe('host draft');
    expect(queue.acknowledgedText).toBe('host');
    expect(queue.state).toBe('conflict');
  });

  test('external_change_between_validation_and_apply', async () => {
    const document = new MemoryDocument('abc');
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);
    document.beforeApply = () => {
      document.text = 'external abc';
      document.version = 2;
      session.handleCanonicalDocumentChanged(1, 2, [createTextPatch(0, 0, 'external ')]);
    };

    await session.enqueuePatch(request('race', view.id, 1, [createTextPatch(3, 3, '!')]));

    expect(document.text).toBe('external abc');
    expect(document.applyCount).toBe(0);
    expect(view.messages.at(-1)).toMatchObject({ type: 'patchRejected', requestId: 'race' });
    expect(view.messages).toContainEqual(expect.objectContaining({ type: 'documentChanged', version: 2 }));
  });

  test('thrown_apply_rejects_without_poisoning_session_queue', async () => {
    const document = new MemoryDocument('a');
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);
    document.throwNext = true;

    await session.enqueuePatch(request('throws', view.id, 1, [createTextPatch(1, 1, 'x')]));
    await session.enqueuePatch(request('recovers', view.id, 1, [createTextPatch(1, 1, 'b')]));

    expect(document.text).toBe('ab');
    expect(view.messages).toContainEqual(expect.objectContaining({ type: 'patchRejected', requestId: 'throws' }));
    expect(view.messages).toContainEqual(expect.objectContaining({ type: 'patchAccepted', requestId: 'recovers' }));
  });

  test('save_flushes_pending_before_success', async () => {
    const document = new MemoryDocument('a');
    const view = endpoint('view-a');
    const session = new DocumentSession(document);
    session.attach(view);
    let releaseApply: (() => void) | undefined;
    const originalApply = document.apply.bind(document);
    document.apply = async (baseVersion, patches) => {
      await new Promise<void>((resolve) => {
        releaseApply = resolve;
      });
      return originalApply(baseVersion, patches);
    };

    const applying = session.enqueuePatch(request('pending', view.id, 1, [createTextPatch(1, 1, 'b')]));
    const saving = session.save();
    await Promise.resolve();
    expect(document.saveCount).toBe(0);
    releaseApply?.();

    await expect(applying).resolves.toBeUndefined();
    await expect(saving).resolves.toBe(true);
    expect(document.text).toBe('ab');
    expect(document.saveCount).toBe(1);
  });
});
