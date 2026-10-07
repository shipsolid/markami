// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildBlockIndex } from '../../src/core/markdown/blockIndex.js';
import { BlockHandles, computeAutoScrollVelocity } from '../../src/webview/ui/blocks/BlockHandles.js';

describe('BlockHandles', () => {
  beforeEach(() => document.body.replaceChildren());

  test('offers accessible source, copy, and keyboard move actions', () => {
    const blocks = buildBlockIndex('One\n\nTwo', 3);
    const move = vi.fn();
    const reveal = vi.fn();
    const copy = vi.fn();
    const handles = new BlockHandles(document, move, reveal, copy);
    const block = blocks[0];
    if (block === undefined) throw new Error('missing block');
    handles.show(block, { left: 4, top: 20 });

    expect(handles.element.getAttribute('aria-label')).toBe('Block actions');
    handles.element.querySelector<HTMLElement>('[data-action="moveDown"]')?.click();
    handles.element.querySelector<HTMLElement>('[data-action="reveal"]')?.click();
    handles.element.querySelector<HTMLElement>('[data-action="copy"]')?.click();

    expect(move).toHaveBeenCalledWith(blocks[0]?.id, 1);
    expect(reveal).toHaveBeenCalledWith(blocks[0]?.id);
    expect(copy).toHaveBeenCalledWith(blocks[0]?.id);
    expect(handles.status.textContent).toContain('moved down');
  });

  test('external edit during drag invalidates the captured block', () => {
    const blocks = buildBlockIndex('One\n\nTwo', 3);
    const move = vi.fn();
    const handles = new BlockHandles(document, move, vi.fn(), vi.fn());
    const block = blocks[0];
    if (block === undefined) throw new Error('missing block');

    expect(handles.beginDrag(block, 3)).toBe(true);
    expect(handles.drop(1, 4)).toBe(false);
    expect(move).not.toHaveBeenCalled();
    expect(handles.status.textContent).toContain('changed');
  });

  test('Escape cancels drag state and removes the insertion indicator', () => {
    const blocks = buildBlockIndex('One\n\nTwo', 3);
    const handles = new BlockHandles(document, vi.fn(), vi.fn(), vi.fn());
    const block = blocks[0];
    if (block === undefined) throw new Error('missing block');
    handles.beginDrag(block, 3);
    handles.updateDragTarget(1, 60);

    expect(handles.insertionLine.hidden).toBe(false);
    expect(handles.handleKey('Escape')).toBe(true);
    expect(handles.insertionLine.hidden).toBe(true);
  });

  test('auto-scroll is bounded near viewport edges', () => {
    expect(computeAutoScrollVelocity(2, 500)).toBeLessThan(0);
    expect(computeAutoScrollVelocity(2, 500)).toBeGreaterThanOrEqual(-18);
    expect(computeAutoScrollVelocity(250, 500)).toBe(0);
    expect(computeAutoScrollVelocity(498, 500)).toBeGreaterThan(0);
    expect(computeAutoScrollVelocity(498, 500)).toBeLessThanOrEqual(18);
  });
});
