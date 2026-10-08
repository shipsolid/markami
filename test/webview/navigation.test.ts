// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  DocumentFind,
  findDocumentMatches,
  nextMatchIndex,
  type FindMatch
} from '../../src/webview/ui/find/DocumentFind.js';
import {
  findHighlightState,
  findHighlights,
  setFindHighlights
} from '../../src/webview/ui/find/FindHighlights.js';
import {
  DocumentOutline,
  activeHeadingIndex,
  extractOutline
} from '../../src/webview/ui/outline/DocumentOutline.js';

describe('document find', () => {
  beforeEach(() => document.body.replaceChildren());

  test('finds visible text through hidden Markdown without matching hidden syntax', () => {
    const source = '# Alpha\n\nA **bold** [label](hidden-target.md).\n';

    expect(findDocumentMatches(source, 'Alpha', { mode: 'visible' })).toEqual([{ from: 2, to: 7 }]);
    expect(findDocumentMatches(source, 'bold label', { mode: 'visible' })).toEqual([{ from: 13, to: 26 }]);
    expect(findDocumentMatches(source, 'hidden-target', { mode: 'visible' })).toEqual([]);
    expect(findDocumentMatches(source, '**bold**', { mode: 'visible' })).toEqual([]);
    expect(findDocumentMatches(source, 'hidden-target', { mode: 'source' })).toEqual([{ from: 28, to: 41 }]);
  });

  test('includes source-island text and supports case and whole-word filters', () => {
    const source = 'Alpha alphabet alpha\n\n<Component Alpha={value} />\n';

    expect(findDocumentMatches(source, 'alpha', { mode: 'visible' })).toHaveLength(4);
    expect(findDocumentMatches(source, 'Alpha', { mode: 'visible', caseSensitive: true, wholeWord: true }))
      .toEqual([{ from: 0, to: 5 }, { from: 33, to: 38 }]);
  });

  test('next and previous navigation wrap deterministically', () => {
    const matches: readonly FindMatch[] = [
      { from: 2, to: 5 },
      { from: 10, to: 13 },
      { from: 20, to: 23 }
    ];

    expect(nextMatchIndex(matches, -1, 1)).toBe(0);
    expect(nextMatchIndex(matches, 2, 1)).toBe(0);
    expect(nextMatchIndex(matches, 0, -1)).toBe(2);
    expect(nextMatchIndex([], 0, 1)).toBe(-1);
  });

  test('panel reports count, navigates from the keyboard, and restores focus on Escape', () => {
    const navigate = vi.fn();
    const results = vi.fn();
    const restoreFocus = vi.fn();
    const panel = new DocumentFind(
      document,
      () => 'One one ONE',
      navigate,
      results,
      restoreFocus
    );

    panel.open('visible');
    const input = panel.element.querySelector<HTMLInputElement>('[aria-label="Find text"]');
    if (input === null) throw new Error('missing find input');
    input.value = 'one';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(panel.status.textContent).toContain('3 matches');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).toHaveBeenCalledWith({ from: 0, to: 3 });
    expect(results).toHaveBeenLastCalledWith(expect.any(Array), 0);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    expect(navigate).toHaveBeenLastCalledWith({ from: 8, to: 11 });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.element.hidden).toBe(true);
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  test('highlight updates never change source or selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'One one ONE',
        selection: EditorSelection.cursor(4),
        extensions: [findHighlights]
      })
    });
    const beforeSelection = view.state.selection;

    view.dispatch({
      effects: setFindHighlights.of({
        matches: [{ from: 0, to: 3 }, { from: 4, to: 7 }],
        activeIndex: 1
      })
    });

    expect(view.state.doc.toString()).toBe('One one ONE');
    expect(view.state.selection).toBe(beforeSelection);
    expect(view.state.field(findHighlightState).size).toBe(2);
    view.destroy();
  });
});

describe('document outline', () => {
  beforeEach(() => document.body.replaceChildren());

  test('extracts ATX and Setext headings with duplicate GitHub slugs and source offsets', () => {
    const source = '# Hello *world*\r\n\r\nHello world\r\n-----------\r\n\r\n```md\r\n# ignored\r\n```\r\n\r\n## Hello world\r\n';

    expect(extractOutline(source)).toEqual([
      expect.objectContaining({ level: 1, text: 'Hello world', from: 0, slug: 'hello-world' }),
      expect.objectContaining({ level: 2, text: 'Hello world', from: 19, slug: 'hello-world-1' }),
      expect.objectContaining({ level: 2, text: 'Hello world', from: 72, slug: 'hello-world-2' })
    ]);
  });

  test('tracks the nearest preceding heading', () => {
    const headings = extractOutline('# One\ntext\n## Two\nmore');
    expect(activeHeadingIndex(headings, 0)).toBe(0);
    expect(activeHeadingIndex(headings, 10)).toBe(0);
    expect(activeHeadingIndex(headings, 18)).toBe(1);
    expect(activeHeadingIndex([], 4)).toBe(-1);
  });

  test('outline is labelled, collapsible, navigable, and setting-aware', () => {
    const navigate = vi.fn();
    const collapse = vi.fn();
    const outline = new DocumentOutline(document, navigate, collapse);
    outline.update('# One\n\n## Two', 10);

    expect(outline.element.getAttribute('aria-label')).toBe('Document outline');
    expect(outline.element.querySelector('[aria-current="location"]')?.textContent).toBe('Two');
    outline.element.querySelector<HTMLButtonElement>('[data-heading-index="0"]')?.click();
    expect(navigate).toHaveBeenCalledWith(0);

    outline.toggleCollapsed();
    expect(collapse).toHaveBeenCalledWith(true);
    expect(outline.element.dataset.collapsed).toBe('true');
    outline.setEnabled(false);
    expect(outline.element.hidden).toBe(true);
  });
});
