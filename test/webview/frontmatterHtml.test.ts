// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { documentSyntax } from '../../src/webview/features/html/HtmlProjection.js';
import { projectionField } from '../../src/webview/projection/ProjectionPlugin.js';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

describe('document syntax projection', () => {
  test('compact frontmatter Source action reveals the exact canonical source', () => {
    const source = '---\ntitle: Demo\n---\n\nBody';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: source, extensions: [documentSyntax()] })
    });

    const sourceButton = document.querySelector<HTMLButtonElement>('.markami-frontmatter-source');
    expect(document.querySelector('.markami-frontmatter-summary')?.textContent).toContain('Metadata');
    sourceButton?.click();

    expect(view.state.selection.main).toMatchObject({ from: 0, to: source.indexOf('\n\n') });
    expect(view.state.doc.toString()).toBe(source);
  });

  test('renders sanitized safe HTML but labels unsafe HTML as editable source', () => {
    const safe = '<div><strong>Safe</strong></div>';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: safe, extensions: [documentSyntax()] })
    });
    expect(document.querySelector('.markami-safe-html')?.innerHTML).toBe(safe);
    expect(view.state.doc.toString()).toBe(safe);
    view.destroy();

    const unsafe = '<script>globalThis.pwned = true</script>';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: unsafe, extensions: [documentSyntax()] })
    });
    expect(document.querySelector('.markami-source-island-badge')?.textContent).toBe('Unsafe HTML');
    expect(document.querySelector('script')).toBeNull();
    expect(view.state.doc.toString()).toBe(unsafe);
  });

  test('unknown islands suppress ordinary Markdown decorations', () => {
    const source = ':::custom\n**literal markers**\n:::';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: source, extensions: [projectionField, documentSyntax()] })
    });

    expect(document.querySelector('.markami-source-island-badge')?.textContent).toBe('Unknown directive');
    expect(document.querySelector('.markami-strong')).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });
});
