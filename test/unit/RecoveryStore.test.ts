import { describe, expect, test } from 'vitest';
import { RecoveryStore, type RecoveryRecord, type RecoveryStorage } from '../../src/extension/RecoveryStore.js';
import { prepareRecoveredDraft } from '../../src/webview/bridge/recovery.js';

class MemoryStorage implements RecoveryStorage {
  public value: readonly RecoveryRecord[] = [];

  public get(): readonly RecoveryRecord[] {
    return this.value;
  }

  public update(records: readonly RecoveryRecord[]): Promise<void> {
    this.value = records;
    return Promise.resolve();
  }
}

describe('RecoveryStore', () => {
  test('stores_reads_and_clears_a_draft_by_full_uri', async () => {
    const storage = new MemoryStorage();
    const store = new RecoveryStore(storage, 1024);
    const record = {
      uri: 'file:///workspace/a/doc.md',
      baseVersion: 4,
      canonicalBaseHash: 'sha256:abc',
      draftText: 'local draft',
      timestamp: 10
    };

    expect(await store.put(record)).toEqual({ ok: true });
    expect(store.get(record.uri)).toEqual(record);
    await store.clear(record.uri);
    expect(store.get(record.uri)).toBeUndefined();
  });

  test('capacity_failure_preserves_existing_and_in_memory_draft', async () => {
    const storage = new MemoryStorage();
    const store = new RecoveryStore(storage, 64);
    const first = {
      uri: 'file:///a.md',
      baseVersion: 1,
      canonicalBaseHash: 'h',
      draftText: 'first',
      timestamp: 1
    };
    await store.put(first);

    const oversized = { ...first, uri: 'file:///b.md', draftText: 'x'.repeat(100), timestamp: 2 };
    expect(await store.put(oversized)).toEqual({ ok: false, reason: 'capacity exceeded', draft: oversized });
    expect(store.get(first.uri)).toEqual(first);
    expect(store.get(oversized.uri)).toBeUndefined();
  });

  test('newer_record_replaces_same_uri_without_duplicate', async () => {
    const storage = new MemoryStorage();
    const store = new RecoveryStore(storage, 1024);
    await store.put({ uri: 'file:///a.md', baseVersion: 1, canonicalBaseHash: 'one', draftText: 'one', timestamp: 1 });
    await store.put({ uri: 'file:///a.md', baseVersion: 2, canonicalBaseHash: 'two', draftText: 'two', timestamp: 2 });

    expect(storage.value).toHaveLength(1);
    expect(store.get('file:///a.md')?.draftText).toBe('two');
  });

  test('divergent canonical content retains draft for explicit recovery', () => {
    const recovery = prepareRecoveredDraft('new canonical', 'sha256:new', {
      canonicalBaseHash: 'sha256:old',
      draftText: 'unsaved local draft'
    });

    expect(recovery).toEqual({
      canonicalText: 'new canonical',
      draftText: 'unsaved local draft',
      baseMatches: false
    });
  });

  test('migrates renamed files and prunes deleted directory records', async () => {
    const storage = new MemoryStorage();
    const store = new RecoveryStore(storage, 1024);
    await store.put({
      uri: 'file:///workspace/docs/a.md', baseVersion: 1, canonicalBaseHash: 'a', draftText: 'a', timestamp: 1
    });
    await store.put({
      uri: 'file:///workspace/keep.md', baseVersion: 1, canonicalBaseHash: 'b', draftText: 'b', timestamp: 2
    });

    await store.rename('file:///workspace/docs', 'file:///workspace/renamed');
    expect(store.get('file:///workspace/renamed/a.md')?.draftText).toBe('a');
    expect(store.get('file:///workspace/docs/a.md')).toBeUndefined();

    await store.delete('file:///workspace/renamed');
    expect(store.get('file:///workspace/renamed/a.md')).toBeUndefined();
    expect(store.get('file:///workspace/keep.md')?.draftText).toBe('b');
  });

  test('serializes concurrent updates so drafts are not lost', async () => {
    const storage = new MemoryStorage();
    const store = new RecoveryStore(storage, 1024);

    await Promise.all([
      store.put({ uri: 'file:///a.md', baseVersion: 1, canonicalBaseHash: 'a', draftText: 'a', timestamp: 1 }),
      store.put({ uri: 'file:///b.md', baseVersion: 1, canonicalBaseHash: 'b', draftText: 'b', timestamp: 2 })
    ]);

    expect(storage.value.map((record) => record.uri)).toEqual(['file:///a.md', 'file:///b.md']);
  });

  test('compare-and-clear cannot delete a newer serialized draft', async () => {
    const storage = new MemoryStorage();
    const store = new RecoveryStore(storage, 1024);
    await store.put({ uri: 'file:///a.md', baseVersion: 1, canonicalBaseHash: 'a', draftText: 'A', timestamp: 1 });

    const newer = store.put({
      uri: 'file:///a.md', baseVersion: 1, canonicalBaseHash: 'a', draftText: 'AB', timestamp: 2
    });
    const cleared = store.clearIfDraftEquals('file:///a.md', 'A');
    await newer;

    await expect(cleared).resolves.toBe(false);
    expect(store.get('file:///a.md')?.draftText).toBe('AB');
  });
});
