import { describe, expect, test } from 'vitest';
import {
  ScopedMementoViewPreferencesStorage,
  ViewPreferencesStore,
  resolveViewPreferences,
  type ViewPreferencesMemento,
  type ViewPreferencesStorage
} from '../../src/extension/ViewPreferencesStore.js';
import type { StoredViewPreferences } from '../../src/protocol/viewPreferences.js';

class MemoryStorage implements ViewPreferencesStorage {
  public value: unknown;
  public writes = 0;

  public constructor(value?: unknown) {
    this.value = value;
  }

  public read(): unknown {
    return this.value;
  }

  public update(value: StoredViewPreferences | undefined): Promise<void> {
    this.value = value;
    this.writes += 1;
    return Promise.resolve();
  }
}

class MemoryMemento implements ViewPreferencesMemento {
  private readonly values = new Map<string, unknown>();

  public get(key: string): unknown {
    return this.values.get(key);
  }

  public update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
    return Promise.resolve();
  }
}

function clock(): () => number {
  let value = 0;
  return () => ++value;
}

describe('ViewPreferencesStore', () => {
  test('workspace_scope_is_selected_dynamically_including_empty_workspaces', async () => {
    let hasWorkspace = false;
    const workspaceState = new MemoryMemento();
    const globalState = new MemoryMemento();
    const storage = new ScopedMementoViewPreferencesStorage(workspaceState, globalState, () => hasWorkspace);
    const store = new ViewPreferencesStore(storage, { now: clock() });

    await store.update('file:///outside.md', { width: 'full' });
    hasWorkspace = true;
    expect(await store.get('file:///outside.md')).toEqual({});
    await store.update('file:///inside.md', { appearance: 'document' });
    hasWorkspace = false;

    expect(await store.get('file:///outside.md')).toEqual({ width: 'full' });
    expect(await store.get('file:///inside.md')).toEqual({});
  });

  test('same_basename_different_uris_independent', async () => {
    const store = new ViewPreferencesStore(new MemoryStorage(), { now: clock() });
    const first = 'file:///workspace/a/README.md';
    const second = 'file:///workspace/b/README.md';

    await store.update(first, { appearance: 'document', width: 'readable' });
    await store.update(second, { appearance: 'vscode', width: 'full' });

    expect(await store.get(first)).toEqual({ appearance: 'document', width: 'readable' });
    expect(await store.get(second)).toEqual({ appearance: 'vscode', width: 'full' });
  });

  test('reset_inherits_changed_defaults_and_invalid_fields_are_ignored', async () => {
    const storage = new MemoryStorage({
      schemaVersion: 1,
      records: {
        'file:///doc.md': {
          schemaVersion: 1,
          overrides: {
            appearance: 'paper',
            width: 'readable',
            maxContentWidth: Number.POSITIVE_INFINITY,
            remoteImages: 'allow'
          },
          updatedAt: 1
        }
      }
    });
    const store = new ViewPreferencesStore(storage, { now: clock() });
    const uri = 'file:///doc.md';
    const initialDefaults = {
      appearance: 'vscode' as const,
      width: 'auto' as const,
      maxContentWidth: 960,
      syntaxReveal: 'activeBlock' as const,
      outlineCollapsed: false
    };

    expect(await store.get(uri)).toEqual({ width: 'readable' });
    expect(resolveViewPreferences(initialDefaults, await store.get(uri))).toMatchObject({ width: 'readable' });
    await store.resetFile(uri);
    expect(resolveViewPreferences({ ...initialDefaults, width: 'full' }, await store.get(uri))).toEqual({
      ...initialDefaults,
      width: 'full'
    });
  });

  test('unsupported_schema_falls_back_without_crashing_or_rewriting_state', async () => {
    const persisted = { schemaVersion: 9, records: { 'file:///doc.md': { documentText: 'never read' } } };
    const storage = new MemoryStorage(persisted);
    const store = new ViewPreferencesStore(storage, { now: clock() });

    expect(await store.get('file:///doc.md')).toEqual({});
    expect(storage.value).toBe(persisted);
    expect(storage.writes).toBe(0);
  });

  test('future_record_survives_unrelated_reads_and_can_be_explicitly_reset', async () => {
    const future = { schemaVersion: 2, overrides: { appearance: 'document' }, updatedAt: 1, future: true };
    const storage = new MemoryStorage({
      schemaVersion: 1,
      records: {
        'file:///future.md': future,
        'file:///current.md': {
          schemaVersion: 1,
          overrides: { width: 'full' },
          updatedAt: 2
        }
      }
    });
    const store = new ViewPreferencesStore(storage, { now: clock() });

    expect(await store.get('file:///future.md')).toEqual({});
    expect(await store.get('file:///current.md')).toEqual({ width: 'full' });
    expect((storage.value as StoredViewPreferences).records['file:///future.md']).toEqual(future);
    await store.resetFile('file:///future.md');
    expect((storage.value as StoredViewPreferences).records['file:///future.md']).toBeUndefined();
  });

  test('disabled_remembrance_uses_session_overrides_then_restores_durable_values', async () => {
    let remember = true;
    const store = new ViewPreferencesStore(new MemoryStorage(), {
      now: clock(),
      rememberPerFile: () => remember
    });
    const uri = 'file:///doc.md';
    await store.update(uri, { appearance: 'document' });

    remember = false;
    expect(await store.get(uri)).toEqual({});
    await store.update(uri, { width: 'full' });
    expect(await store.get(uri)).toEqual({ width: 'full' });
    await store.closeSession(uri);
    expect(await store.get(uri)).toEqual({});

    await store.update(uri, { width: 'readable' });

    remember = true;
    expect(await store.get(uri)).toEqual({ appearance: 'document' });
  });

  test('untitled_preferences_are_session_only_until_confirmed_promotion', async () => {
    const storage = new MemoryStorage();
    const store = new ViewPreferencesStore(storage, { now: clock() });
    const untitled = 'untitled:Untitled-1';
    const saved = 'file:///workspace/saved.md';

    await store.update(untitled, { width: 'readable' });
    expect(storage.writes).toBe(0);
    expect(await store.get(untitled)).toEqual({ width: 'readable' });
    await store.rename(untitled, saved);

    expect(await store.get(untitled)).toEqual({});
    expect(await store.get(saved)).toEqual({ width: 'readable' });
  });

  test('captured_untitled_preferences_survive_close_event_during_save_as', async () => {
    const store = new ViewPreferencesStore(new MemoryStorage(), { now: clock() });
    const untitled = 'untitled:Untitled-2';
    const saved = 'file:///workspace/saved-after-close.md';
    await store.update(untitled, { appearance: 'document', width: 'full' });
    const captured = await store.get(untitled);

    await store.closeSession(untitled);
    await store.rename(untitled, saved);
    await store.promoteSessionOverrides(saved, captured);

    expect(await store.get(saved)).toEqual({ appearance: 'document', width: 'full' });
  });

  test('reenabling_remembrance_ignores_stale_session_values_during_rename', async () => {
    let remember = true;
    const store = new ViewPreferencesStore(new MemoryStorage(), {
      now: clock(),
      rememberPerFile: () => remember
    });
    const oldUri = 'file:///workspace/old.md';
    const newUri = 'file:///workspace/new.md';
    await store.update(oldUri, { appearance: 'document' });
    remember = false;
    await store.update(oldUri, { width: 'full' });
    remember = true;

    await store.rename(oldUri, newUri);

    expect(await store.get(newUri)).toEqual({ appearance: 'document' });
  });

  test('rename_while_disabled_preserves_dormant_durable_and_active_session_layers', async () => {
    let remember = true;
    const store = new ViewPreferencesStore(new MemoryStorage(), {
      now: clock(),
      rememberPerFile: () => remember
    });
    const oldUri = 'file:///workspace/old.md';
    const newUri = 'file:///workspace/new.md';
    await store.update(oldUri, { appearance: 'document' });
    remember = false;
    await store.update(oldUri, { width: 'full' });

    await store.rename(oldUri, newUri);
    expect(await store.get(newUri)).toEqual({ width: 'full' });
    remember = true;
    expect(await store.get(newUri)).toEqual({ appearance: 'document' });
  });

  test('rename_migrates_old_record_copy_does_not_and_delete_prunes_descendants', async () => {
    const store = new ViewPreferencesStore(new MemoryStorage(), { now: clock() });
    const oldUri = 'file:///workspace/old/doc.md';
    const newUri = 'file:///workspace/new/doc.md';
    await store.update(oldUri, { appearance: 'document' });
    await store.update(newUri, { width: 'full' });

    await store.rename(oldUri, newUri);
    expect(await store.get(oldUri)).toEqual({});
    expect(await store.get(newUri)).toEqual({ appearance: 'document' });
    expect(await store.get('file:///workspace/copy/doc.md')).toEqual({});

    await store.delete('file:///workspace/new');
    expect(await store.get(newUri)).toEqual({});
  });

  test('folder_rename_migrates_descendant_records_and_leaves_other_uris_independent', async () => {
    const store = new ViewPreferencesStore(new MemoryStorage(), { now: clock() });
    await store.update('file:///workspace/old/a.md', { appearance: 'document' });
    await store.update('file:///workspace/old/nested/b.md', { width: 'readable' });
    await store.update('file:///workspace/other.md', { width: 'full' });

    await store.rename('file:///workspace/old', 'file:///workspace/new');

    expect(await store.get('file:///workspace/old/a.md')).toEqual({});
    expect(await store.get('file:///workspace/new/a.md')).toEqual({ appearance: 'document' });
    expect(await store.get('file:///workspace/new/nested/b.md')).toEqual({ width: 'readable' });
    expect(await store.get('file:///workspace/other.md')).toEqual({ width: 'full' });
  });

  test('serialized_concurrent_updates_do_not_lose_fields', async () => {
    const store = new ViewPreferencesStore(new MemoryStorage(), { now: clock() });
    const uri = 'vscode-remote://ssh-remote+host/workspace/doc.md';

    await Promise.all([
      store.update(uri, { appearance: 'document' }),
      store.update(uri, { width: 'readable' }),
      store.update(uri, { maxContentWidth: 1200 })
    ]);

    expect(await store.get(uri)).toEqual({
      appearance: 'document',
      width: 'readable',
      maxContentWidth: 1200
    });
  });

  test('lru_1001st_record_evicts_the_least_recently_used_uri', async () => {
    const store = new ViewPreferencesStore(new MemoryStorage(), { maxRecords: 1000, now: clock() });
    for (let index = 0; index < 1000; index += 1) {
      await store.update(`file:///doc-${String(index)}.md`, { width: 'full' });
    }
    await store.get('file:///doc-0.md');
    await store.update('file:///doc-1000.md', { width: 'readable' });

    expect(await store.get('file:///doc-0.md')).toEqual({ width: 'full' });
    expect(await store.get('file:///doc-1.md')).toEqual({});
    expect(await store.get('file:///doc-1000.md')).toEqual({ width: 'readable' });
  });
});
