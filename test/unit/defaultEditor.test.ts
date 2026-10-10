import { describe, expect, test, vi } from 'vitest';
import {
  applyDefaultEditor,
  planDefaultEditor,
  type DefaultEditorHost
} from '../../src/extension/defaultEditor.js';

const MARKAMI = 'markami.editor';

describe('default editor plan', () => {
  test('opting in adds only the two Markdown patterns and keeps every other association', () => {
    const current = { '*.png': 'imagePreview.previewEditor', '*.md': 'default' };

    expect(planDefaultEditor(current, 'markami')).toEqual({
      kind: 'update',
      associations: { '*.png': 'imagePreview.previewEditor', '*.md': MARKAMI, '*.markdown': MARKAMI }
    });
    expect(current).toEqual({ '*.png': 'imagePreview.previewEditor', '*.md': 'default' });
  });

  test('opting in creates the map when the user has none', () => {
    expect(planDefaultEditor(undefined, 'markami')).toEqual({
      kind: 'update',
      associations: { '*.md': MARKAMI, '*.markdown': MARKAMI }
    });
  });

  test('opting in twice changes nothing the second time', () => {
    const once = planDefaultEditor({ '*.txt': 'default' }, 'markami');
    if (once.kind !== 'update') throw new Error('expected an update');

    expect(planDefaultEditor(once.associations, 'markami')).toEqual({ kind: 'unchanged' });
  });

  test('switching back removes only the associations that point at markami', () => {
    const current = { '*.md': MARKAMI, '*.markdown': 'someone.else', '*.png': 'imagePreview.previewEditor' };

    expect(planDefaultEditor(current, 'native')).toEqual({
      kind: 'update',
      associations: { '*.markdown': 'someone.else', '*.png': 'imagePreview.previewEditor' }
    });
  });

  test('switching back with nothing to remove changes nothing', () => {
    expect(planDefaultEditor(undefined, 'native')).toEqual({ kind: 'unchanged' });
    expect(planDefaultEditor({ '*.md': 'default' }, 'native')).toEqual({ kind: 'unchanged' });
  });

  test('a legacy array or other unexpected shape is never overwritten', () => {
    const legacy = [{ viewType: 'imagePreview.previewEditor', filenamePattern: '*.png' }];

    expect(planDefaultEditor(legacy, 'markami')).toEqual({ kind: 'unsupported' });
    expect(planDefaultEditor('*.md', 'native')).toEqual({ kind: 'unsupported' });
    expect(planDefaultEditor({ '*.md': 7 }, 'markami')).toEqual({ kind: 'unsupported' });
  });
});

describe('default editor command', () => {
  function host(overrides: Partial<Omit<DefaultEditorHost, 'inform'>> = {}) {
    const write = vi.fn(() => Promise.resolve());
    const inform = vi.fn();
    const fake: DefaultEditorHost = {
      readUserAssociations: () => ({ '*.png': 'imagePreview.previewEditor' }),
      writeUserAssociations: write,
      confirm: () => Promise.resolve(true),
      inform,
      ...overrides
    };
    return { ...fake, write, inform };
  }

  test('writes the planned map once the user confirms', async () => {
    const confirm = vi.fn(() => Promise.resolve(true));
    const fake = host({ confirm });

    await expect(applyDefaultEditor('markami', fake)).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fake.write).toHaveBeenCalledWith({
      '*.png': 'imagePreview.previewEditor',
      '*.md': MARKAMI,
      '*.markdown': MARKAMI
    });
  });

  test('writes nothing when the user declines', async () => {
    const fake = host({ confirm: () => Promise.resolve(false) });

    await expect(applyDefaultEditor('markami', fake)).resolves.toBe(false);

    expect(fake.write).not.toHaveBeenCalled();
  });

  test('does not ask or write when the requested state already holds', async () => {
    const confirm = vi.fn(() => Promise.resolve(true));
    const fake = host({ confirm, readUserAssociations: () => undefined });

    await expect(applyDefaultEditor('native', fake)).resolves.toBe(true);

    expect(confirm).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.inform).toHaveBeenCalledTimes(1);
  });

  test('explains instead of writing when the setting has an unsupported shape', async () => {
    const confirm = vi.fn(() => Promise.resolve(true));
    const fake = host({ confirm, readUserAssociations: () => [{ viewType: 'x', filenamePattern: '*.md' }] });

    await expect(applyDefaultEditor('markami', fake)).resolves.toBe(false);

    expect(confirm).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.inform).toHaveBeenCalledTimes(1);
  });

  test('a failed settings write is reported to the caller, not swallowed', async () => {
    const fake = host({ writeUserAssociations: () => Promise.reject(new Error('settings are read-only')) });

    await expect(applyDefaultEditor('markami', fake)).rejects.toThrow('settings are read-only');
  });
});
