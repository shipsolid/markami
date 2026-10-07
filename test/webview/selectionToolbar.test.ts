// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createFormattingActionRegistry } from '../../src/webview/editor/actionRegistry.js';
import { SelectionToolbar } from '../../src/webview/ui/toolbar/SelectionToolbar.js';
import type { ActionContext } from '../../src/core/markdown/formatting.js';

function context(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    hostVersion: 3,
    editorRevision: 7,
    selection: { anchor: 2, head: 6 },
    source: 'A bold word',
    capabilities: {},
    ...overrides
  };
}

describe('SelectionToolbar', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('opening and dismissing retains the captured selection without applying edits', () => {
    const apply = vi.fn<(actionId: string, ctx: ActionContext) => void>();
    const toolbar = new SelectionToolbar(document, createFormattingActionRegistry(), apply, vi.fn());

    expect(toolbar.show(context(), { left: 20, top: 30, bottom: 42, viewportHeight: 200 })).toBe(true);
    expect(toolbar.element.hidden).toBe(false);
    expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    expect(toolbar.capturedContext?.selection).toEqual({ anchor: 2, head: 6 });
    toolbar.hide();

    expect(apply).not.toHaveBeenCalled();
    expect(toolbar.element.hidden).toBe(true);
  });

  test('pointer activation preserves selection and uses the shared action registry', () => {
    const apply = vi.fn<(actionId: string, ctx: ActionContext) => void>();
    const toolbar = new SelectionToolbar(document, createFormattingActionRegistry(), apply, vi.fn());
    toolbar.show(context(), { left: 20, top: 30, bottom: 42, viewportHeight: 200 });
    const bold = toolbar.element.querySelector<HTMLButtonElement>('[data-action="markami.bold"]');
    expect(bold).not.toBeNull();

    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    bold?.dispatchEvent(down);
    bold?.click();

    expect(down.defaultPrevented).toBe(true);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0]?.[0]).toBe('markami.bold');
    expect(apply.mock.calls[0]?.[1].selection).toEqual({ anchor: 2, head: 6 });
  });

  test('external_edit_invalidates_toolbar_anchor', () => {
    const apply = vi.fn();
    const toolbar = new SelectionToolbar(document, createFormattingActionRegistry(), apply, vi.fn());
    toolbar.show(context(), { left: 20, top: 30, bottom: 42, viewportHeight: 200 });

    expect(toolbar.revalidate(context({ hostVersion: 4, editorRevision: 8, source: 'X A bold word' }))).toBe(false);
    expect(toolbar.element.hidden).toBe(true);
    expect(toolbar.status.textContent).toContain('selection changed');
  });

  test('keyboard invocation uses roving focus and Escape restores editor focus', () => {
    const restoreFocus = vi.fn();
    const toolbar = new SelectionToolbar(document, createFormattingActionRegistry(), vi.fn(), restoreFocus);
    toolbar.show(context(), { left: 20, top: 4, bottom: 18, viewportHeight: 200 }, { focus: true });
    const buttons = [...toolbar.element.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];

    expect(document.activeElement).toBe(buttons[0]);
    toolbar.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);
    toolbar.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(restoreFocus).toHaveBeenCalledOnce();
    expect(toolbar.element.hidden).toBe(true);
  });

  test('composition, drag, empty, and mixed-block selections are ineligible', () => {
    const toolbar = new SelectionToolbar(document, createFormattingActionRegistry(), vi.fn(), vi.fn());
    const rect = { left: 0, top: 10, bottom: 20, viewportHeight: 100 };

    expect(toolbar.show(context({ selection: { anchor: 2, head: 2 } }), rect)).toBe(false);
    expect(toolbar.show(context(), rect, { composing: true })).toBe(false);
    expect(toolbar.show(context(), rect, { dragging: true })).toBe(false);
    expect(toolbar.show(context(), rect, { mixedBlocks: true })).toBe(false);
  });

  test('communicates active and mixed formatting state', () => {
    const toolbar = new SelectionToolbar(document, createFormattingActionRegistry(), vi.fn(), vi.fn());
    toolbar.show(context(), { left: 0, top: 50, bottom: 60, viewportHeight: 100 }, {
      states: { 'markami.bold': 'active', 'markami.italic': 'mixed' }
    });

    expect(toolbar.element.querySelector('[data-action="markami.bold"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(toolbar.element.querySelector('[data-action="markami.italic"]')?.getAttribute('aria-pressed')).toBe('mixed');
  });
});
