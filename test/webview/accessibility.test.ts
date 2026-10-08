// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ActionContext } from '../../src/core/markdown/formatting.js';
import { createFormattingActionRegistry } from '../../src/webview/editor/actionRegistry.js';
import { tableProjectionField } from '../../src/webview/features/tables/TableProjection.js';
import { technicalBlocks } from '../../src/webview/features/technicalBlocks.js';
import { buildBlockIndex } from '../../src/core/markdown/blockIndex.js';
import { BlockHandles } from '../../src/webview/ui/blocks/BlockHandles.js';
import { ImagePopover } from '../../src/webview/ui/images/ImagePopover.js';
import { LinkPopover } from '../../src/webview/ui/inlinePopover/LinkPopover.js';
import { SlashPalette } from '../../src/webview/ui/slash/SlashPalette.js';
import { openSlashState } from '../../src/webview/editor/slashState.js';

let view: EditorView | undefined;

beforeEach(() => document.body.replaceChildren());
afterEach(() => {
  view?.destroy();
  view = undefined;
});

function context(source: string, anchor = 0, head = anchor): ActionContext {
  return { hostVersion: 1, editorRevision: 1, source, selection: { anchor, head }, capabilities: {} };
}

describe('keyboard and accessible semantics', () => {
  test('link and image dialogs expose dialog semantics, cancel on Escape, and restore editor focus', () => {
    const restoreLink = vi.fn();
    let currentLink = context('[label](old)', 2, 7);
    const link = new LinkPopover(
      document,
      createFormattingActionRegistry(),
      vi.fn(),
      () => currentLink,
      restoreLink
    );
    link.show(context('[label](old)', 2, 7));
    expect(link.element.getAttribute('role')).toBe('dialog');
    expect(link.element.classList.contains('markami-link-popover')).toBe(true);
    link.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(link.element.hidden).toBe(true);
    expect(restoreLink).toHaveBeenCalledOnce();
    link.show(currentLink);
    currentLink = context('X[label](old)', 3, 8);
    expect(link.confirm()).toBe(false);
    expect(restoreLink).toHaveBeenCalledTimes(2);
    expect(link.status.textContent).toContain('changed');

    const restoreImage = vi.fn();
    let currentImage = context('![alt](a.png)');
    const image = new ImagePopover(document, vi.fn(), () => currentImage, vi.fn(), vi.fn(), restoreImage);
    const markdownImage = {
      from: 0,
      to: 13,
      alt: 'alt',
      destination: 'a.png',
      destinationRange: { from: 7, to: 12 },
      altRange: { from: 2, to: 5 },
      form: 'inline',
      titleInsertion: 12
    } as const;
    image.show(currentImage, markdownImage);
    expect(image.element.getAttribute('role')).toBe('dialog');
    image.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(image.element.hidden).toBe(true);
    expect(restoreImage).toHaveBeenCalledOnce();
    image.show(currentImage, markdownImage);
    currentImage = context('X![alt](a.png)');
    expect(image.confirm()).toBe(false);
    expect(restoreImage).toHaveBeenCalledTimes(2);
    expect(image.status.textContent).toContain('changed');
  });

  test('slash listbox uses one roving option and reports the active descendant', () => {
    const palette = new SlashPalette(document, vi.fn());
    palette.open(openSlashState(context('', 0), true));
    const options = [...palette.element.querySelectorAll<HTMLButtonElement>('[role="option"]')];

    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(palette.element.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    palette.handleKey('ArrowDown');
    const next = palette.element.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    expect(next?.tabIndex).toBe(0);
    expect(palette.element.getAttribute('aria-activedescendant')).toBe(next?.id);
    expect(palette.status.textContent).toContain(next?.textContent);
  });

  test('block action toolbar closes on Escape and restores focus', () => {
    const restore = vi.fn();
    const handles = new BlockHandles(document, vi.fn(), vi.fn(), vi.fn(), restore);
    const block = buildBlockIndex('One\n\nTwo', 1)[0];
    if (block === undefined) throw new Error('missing block');
    handles.show(block, { left: 2, top: 4 }, true);

    expect(handles.element.querySelector('button:not([disabled])')).toBe(document.activeElement);
    handles.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(handles.element.hidden).toBe(true);
    expect(restore).toHaveBeenCalledOnce();
  });

  test('table grid exposes indexed rows and labelled editable cells', () => {
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'Before\n\n| Name | Value |\n| --- | --- |\n| alpha | one |',
        extensions: [tableProjectionField]
      })
    });
    const grid = view.dom.querySelector<HTMLElement>('[role="grid"]');
    const cell = view.dom.querySelector<HTMLElement>('[role="gridcell"]');

    expect(grid?.getAttribute('aria-rowcount')).toBe('2');
    expect(grid?.getAttribute('aria-colcount')).toBe('2');
    expect(cell?.getAttribute('aria-rowindex')).toBe('2');
    expect(cell?.getAttribute('aria-colindex')).toBe('1');
    expect(cell?.getAttribute('aria-label')).toBe('Row 2, Name');
  });

  test('table Tab commits the last cell, appends a row, and focuses its first cell', async () => {
    const source = 'Before\n\n| Name | Value |\n| --- | --- |\n| alpha | old |\n\nAfter';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: source, extensions: [tableProjectionField] })
    });
    const cells = view.dom.querySelectorAll<HTMLElement>('[role="gridcell"]');
    const last = cells.item(cells.length - 1);
    last.textContent = 'changed';
    last.focus();

    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain('| alpha | changed |\n|  |  |');
    expect((document.activeElement as HTMLElement | null)?.getAttribute('aria-label')).toBe('Row 3, Name');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true
    }));
    await Promise.resolve();
    expect((document.activeElement as HTMLElement | null)?.getAttribute('aria-label')).toBe('Row 2, Value');
  });

  test('rendered Mermaid can reveal source with Enter', () => {
    const source = '```mermaid\nflowchart LR\nA --> B\n```';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: source, extensions: [technicalBlocks()] })
    });
    const diagram = view.dom.querySelector<HTMLElement>('.markami-mermaid');
    expect(diagram).not.toBeNull();
    diagram?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(view.state.selection.main.head).toBeGreaterThan(0);
  });
});
