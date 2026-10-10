// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { imageProjection } from '../../src/webview/features/images/ImageProjection.js';

const views: EditorView[] = [];

function mount(doc: string, resolve: (rawPath: string) => Promise<string | undefined>): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: imageProjection(resolve, vi.fn()) }),
    parent: document.body
  });
  views.push(view);
  return view;
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

describe('imageProjection', () => {
  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
  });

  test('typing never re-asks the host to resolve an unchanged image destination', async () => {
    const resolve = vi.fn((rawPath: string) => Promise.resolve(`vscode-resource:${rawPath}`));
    const view = mount('![a](a.png)\n\n![b](https://example.com/b.png)\n\ntext', resolve);
    await settle();
    expect(resolve).toHaveBeenCalledTimes(2);

    view.dispatch({ changes: { from: view.state.doc.length, insert: ' more' } });
    view.dispatch({ changes: { from: 0, insert: 'intro\n\n' } });
    await settle();

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  test('a destination that is edited is resolved again', async () => {
    const resolve = vi.fn((rawPath: string) => Promise.resolve(`vscode-resource:${rawPath}`));
    const view = mount('![a](a.png)', resolve);
    await settle();

    view.dispatch({ changes: { from: 5, to: 6, insert: 'b' } });
    await settle();

    expect(resolve).toHaveBeenLastCalledWith('b.png');
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  test('a cancelled or failed resolution is not retried on every edit', async () => {
    const resolve = vi.fn(() => Promise.resolve(undefined));
    const view = mount('![a](https://example.com/a.png)', resolve);
    await settle();

    view.dispatch({ changes: { from: view.state.doc.length, insert: ' text' } });
    await settle();

    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
