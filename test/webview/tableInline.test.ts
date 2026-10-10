// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { buildInlineProjection } from '../../src/core/markdown/syntax.js';
import { renderInlineMarkdown, sourceOffsetForRenderedOffset } from '../../src/webview/features/tables/inlineRender.js';
import { tableProjectionField } from '../../src/webview/features/tables/TableProjection.js';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

// The caret starts in the first line, so the table below it renders as a widget instead of revealing its source.
const table = 'Before\n\n| **Name** | `code` |\n| --- | --- |\n| *soft* | [docs](https://example.com) |';

function mount(source: string): EditorView {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: source, extensions: [tableProjectionField] })
  });
  return view;
}

describe('inline projection', () => {
  test('inline_projection_ignores_block_syntax_that_a_table_cell_cannot_hold', () => {
    const plan = buildInlineProjection('> **x** - y # z');

    expect(plan.marks.map((mark) => mark.kind)).toEqual(['strong']);
    expect(plan.hiddenTokens).toEqual([{ from: 2, to: 4 }, { from: 5, to: 7 }]);
  });
});

describe('rendering inline Markdown inside a table cell', () => {
  test('bold, emphasis, strikethrough, code, and links lose their markers and keep their text', () => {
    const fragment = renderInlineMarkdown(document, '**a** *b* ~~c~~ `d` [e](https://x.test) plain');
    const host = document.createElement('div');
    host.append(fragment);

    expect(host.textContent).toBe('a b c d e plain');
    expect([...host.querySelectorAll('span')].map((span) => `${span.className}:${span.textContent}`)).toEqual([
      'markami-strong:a', 'markami-emphasis:b', 'markami-strike:c', 'markami-inlineCode:d', 'markami-link:e'
    ]);
  });

  test('text without markup is returned unchanged and delimiters inside code stay literal', () => {
    const plain = document.createElement('div');
    plain.append(renderInlineMarkdown(document, '1 < 2 & 3'));
    const code = document.createElement('div');
    code.append(renderInlineMarkdown(document, '`**not bold**`'));

    expect(plain.innerHTML).toBe('1 &lt; 2 &amp; 3');
    expect(code.textContent).toBe('**not bold**');
    expect(code.querySelector('.markami-strong')).toBeNull();
  });

  test('cells render their markup until focused, then edit as source and commit back', () => {
    const editor = mount(table);
    const header = editor.dom.querySelector<HTMLElement>('[role="columnheader"]');
    if (header === null) throw new Error('missing header cell');

    expect(header.textContent).toBe('Name');
    expect(header.querySelector('.markami-strong')).not.toBeNull();
    header.focus();
    expect(header.textContent).toBe('**Name**');
    header.textContent = '**Title**';
    header.blur();

    expect(editor.state.doc.toString()).toContain('| **Title** |');
    expect(editor.dom.querySelector('[role="columnheader"]')?.textContent).toBe('Title');
  });

  test('focusing and leaving a cell without changes keeps the document and the rendering', () => {
    const editor = mount(table);
    const cell = editor.dom.querySelectorAll<HTMLElement>('[role="gridcell"]').item(0);

    cell.focus();
    expect(cell.textContent).toBe('*soft*');
    cell.blur();

    expect(editor.state.doc.toString()).toBe(table);
    expect(cell.textContent).toBe('soft');
    expect(cell.querySelector('.markami-emphasis')).not.toBeNull();
  });
});

describe('mapping a rendered position back to its source', () => {
  test('plain text maps one to one', () => {
    expect([0, 2, 3].map((offset) => sourceOffsetForRenderedOffset('abc', offset))).toEqual([0, 2, 3]);
  });

  test('a position inside styled text lands inside its markers, and a boundary lands before the next visible text', () => {
    const source = 'a **bold** word';
    // rendered: "a bold word"
    expect([0, 1, 2, 3, 5, 6, 7, 11].map((offset) => sourceOffsetForRenderedOffset(source, offset)))
      .toEqual([0, 1, 4, 5, 7, 10, 11, 15]);
  });

  test('link destinations and code backticks never count as rendered characters', () => {
    expect(sourceOffsetForRenderedOffset('[docs](https://x.test) tail', 2)).toBe(3);
    expect(sourceOffsetForRenderedOffset('[docs](https://x.test) tail', 4)).toBe(22);
    expect(sourceOffsetForRenderedOffset('`ab` c', 1)).toBe(2);
  });

  test('positions outside the rendered text clamp to the source ends', () => {
    expect(sourceOffsetForRenderedOffset('**x**', -4)).toBe(0);
    expect(sourceOffsetForRenderedOffset('**x**', 99)).toBe(5);
    expect(sourceOffsetForRenderedOffset('', 3)).toBe(0);
  });
});
