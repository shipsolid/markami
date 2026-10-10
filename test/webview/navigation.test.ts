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
  extractOutline,
  sourceOffsetForHeadingFragment
} from '../../src/webview/ui/outline/DocumentOutline.js';

describe('document find', () => {
  beforeEach(() => document.body.replaceChildren());

  test('finds visible text through hidden Markdown without matching hidden syntax', () => {
    const source = '# Alpha\n\nA **bold** [label](hidden-target.md).\n';

    expect(findDocumentMatches(source, 'Alpha', { mode: 'visible' })).toEqual([{ from: 2, to: 7 }]);
    expect(findDocumentMatches(source, 'bold label', { mode: 'visible' })).toEqual([{
      from: 13,
      to: 26,
      segments: [{ from: 13, to: 17 }, { from: 19, to: 20 }, { from: 21, to: 26 }]
    }]);
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

  test('tracks actually rendered text for URLs, escapes, references, widgets, and safe HTML', () => {
    const source = [
      '---',
      'secret: hidden-frontmatter',
      '---',
      '',
      'Visit https://example.com and <https://example.org>.',
      'Escaped \\*star and [visible label][target].',
      '',
      '[target]: hidden-reference.md',
      '',
      '```mermaid',
      'flowchart LR',
      'HiddenNode',
      '```',
      '',
      '$hidden-math$',
      '',
      '<div title="hidden-attribute">Visible HTML</div>'
    ].join('\n');

    expect(findDocumentMatches(source, 'https://example.com', { mode: 'visible' })).toHaveLength(1);
    expect(findDocumentMatches(source, 'https://example.org', { mode: 'visible' })).toHaveLength(1);
    expect(findDocumentMatches(source, '*star', { mode: 'visible' })).toHaveLength(1);
    expect(findDocumentMatches(source, 'visible label', { mode: 'visible' })).toHaveLength(1);
    expect(findDocumentMatches(source, 'Visible HTML', { mode: 'visible' })).toHaveLength(1);
    for (const hidden of ['hidden-frontmatter', 'hidden-reference', 'flowchart', 'HiddenNode', 'hidden-math', 'hidden-attribute']) {
      expect(findDocumentMatches(source, hidden, { mode: 'visible' }), hidden).toEqual([]);
      expect(findDocumentMatches(source, hidden, { mode: 'source' }), hidden).toHaveLength(1);
    }
  });

  test('whole-word matching treats astral letters and combining marks as word characters', () => {
    expect(findDocumentMatches('𐐀alpha alpha', 'alpha', { mode: 'visible', wholeWord: true }))
      .toEqual([{ from: 8, to: 13 }]);
    expect(findDocumentMatches('a\u0301alpha alpha', 'alpha', { mode: 'visible', wholeWord: true }))
      .toEqual([{ from: 8, to: 13 }]);
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

  test('frontmatter is never read as a Setext heading', () => {
    const source = '---\ntitle: Loki cleanup\ntags: [grafana]\n---\n\n# Real heading\n';

    expect(extractOutline(source).map((heading) => heading.text)).toEqual(['Real heading']);
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

  test('selection-only updates reuse heading controls', () => {
    const outline = new DocumentOutline(document, vi.fn(), vi.fn());
    const source = '# One\n\n## Two';
    outline.update(source, 0);
    const firstButton = outline.element.querySelector<HTMLButtonElement>('[data-heading-index="0"]');

    outline.update(source, source.length);

    expect(outline.element.querySelector('[data-heading-index="0"]')).toBe(firstButton);
    expect(outline.element.querySelector('[aria-current="location"]')?.textContent).toBe('Two');
  });

  test('a narrow pane makes the outline a session-only drawer that never overwrites the saved state', () => {
    const navigate = vi.fn();
    const collapse = vi.fn();
    const outline = new DocumentOutline(document, navigate, collapse);
    outline.update('# One\n\n## Two', 0);

    outline.setNarrow(true);
    expect(outline.element.dataset.collapsed).toBe('true');
    outline.toggleCollapsed();
    expect(outline.element.dataset.collapsed).toBe('false');
    outline.element.querySelector<HTMLButtonElement>('[data-heading-index="1"]')?.click();

    expect(navigate).toHaveBeenCalledWith(7);
    expect(outline.element.dataset.collapsed).toBe('true');
    expect(collapse).not.toHaveBeenCalled();
    outline.setNarrow(false);
    expect(outline.element.dataset.collapsed).toBe('false');
  });

  test('the saved collapsed state returns when a narrow pane widens', () => {
    const outline = new DocumentOutline(document, vi.fn(), vi.fn());
    outline.setCollapsed(true);
    outline.setNarrow(true);
    outline.toggleCollapsed();
    expect(outline.element.dataset.collapsed).toBe('false');

    outline.setNarrow(false);

    expect(outline.element.dataset.collapsed).toBe('true');
  });

  test('a wide, expanded, enabled outline docks and tells the document to make room', () => {
    const outline = new DocumentOutline(document, vi.fn(), vi.fn());
    const state = (): string | undefined => document.documentElement.dataset.markamiOutline;

    expect(state()).toBe('docked');
    outline.toggleCollapsed();
    expect(state()).toBe('none');
    outline.toggleCollapsed();
    expect(state()).toBe('docked');
    outline.setEnabled(false);
    expect(state()).toBe('none');
    outline.setEnabled(true);
    outline.setNarrow(true);
    expect(state()).toBe('none');
    outline.setNarrow(false);
    outline.destroy();
    expect(state()).toBeUndefined();
  });

  test('fragment navigation reuses formatted Setext headings and duplicate slugs', () => {
    const source = '# Hello *world*\n\nHello world\n-----------\n';
    expect(sourceOffsetForHeadingFragment(source, 'hello-world')).toBe(0);
    expect(sourceOffsetForHeadingFragment(source, 'hello-world-1')).toBe(17);
  });
});
