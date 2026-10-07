// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ActionContext } from '../../src/core/markdown/formatting.js';
import { canOpenSlash, openSlashState } from '../../src/webview/editor/slashState.js';
import { SlashPalette } from '../../src/webview/ui/slash/SlashPalette.js';

function context(source: string, position = source.length, revisions = { host: 2, editor: 3 }): ActionContext {
  return {
    hostVersion: revisions.host,
    editorRevision: revisions.editor,
    selection: { anchor: position, head: position },
    source,
    capabilities: { math: true }
  };
}

describe('SlashPalette', () => {
  beforeEach(() => document.body.replaceChildren());

  test('filters entries, supports navigation, and exposes no-results state', () => {
    const palette = new SlashPalette(document, vi.fn());
    expect(palette.open(openSlashState(context('/mer')))).toBe(true);

    expect(palette.visibleEntries.map((entry) => entry.kind)).toEqual(['mermaid']);
    expect(palette.element.getAttribute('role')).toBe('listbox');
    expect(palette.status.textContent).toContain('1 block');

    palette.update(context('/zz', 3, { host: 2, editor: 4 }));
    expect(palette.visibleEntries).toHaveLength(0);
    expect(palette.element.textContent).toContain('No matching blocks');
  });

  test('escape leaves typed source unchanged', () => {
    const accept = vi.fn();
    const palette = new SlashPalette(document, accept);
    palette.open(openSlashState(context('/hea')));

    expect(palette.handleKey('Escape')).toBe(true);
    expect(palette.element.hidden).toBe(true);
    expect(accept).not.toHaveBeenCalled();
    expect(context('/hea').source).toBe('/hea');
  });

  test('keyboard and pointer acceptance use the captured live range', () => {
    const accept = vi.fn();
    const palette = new SlashPalette(document, accept);
    palette.open(openSlashState(context('/')));
    expect(palette.handleKey('ArrowDown')).toBe(true);
    expect(palette.handleKey('Enter')).toBe(true);
    expect(accept).toHaveBeenCalledOnce();

    palette.open(openSlashState(context('/mer')));
    palette.element.querySelector<HTMLElement>('[data-kind="mermaid"]')?.click();
    expect(accept).toHaveBeenCalledTimes(2);
    expect(accept.mock.calls[1]?.[0]).toBe('mermaid');
  });

  test('trigger is suppressed in code, URLs, source islands, nested containers, and nonempty prose', () => {
    const fenced = '```ts\n/\n```';
    expect(canOpenSlash(context(fenced, fenced.indexOf('/') + 1))).toBe(false);
    expect(canOpenSlash(context('https://'))).toBe(false);
    expect(canOpenSlash({ ...context('/'), capabilities: { sourceIsland: true } })).toBe(false);
    expect(canOpenSlash(context('- /'))).toBe(false);
    expect(canOpenSlash(context('text /'))).toBe(false);
    expect(canOpenSlash(context('/'))).toBe(true);
  });

  test('math is omitted when disabled and explicit invocation still works without a slash trigger', () => {
    const palette = new SlashPalette(document, vi.fn(), { mathEnabled: false });
    expect(palette.open(openSlashState({ ...context('/'), capabilities: { math: false } }))).toBe(true);
    expect(palette.visibleEntries.some((entry) => entry.kind === 'math')).toBe(false);

    const explicit = openSlashState(context(''), true);
    expect(explicit.from).toBe(0);
    expect(explicit.to).toBe(0);
    expect(palette.open(explicit)).toBe(true);
  });

  test('external edit before acceptance invalidates the palette', () => {
    const accept = vi.fn();
    const palette = new SlashPalette(document, accept);
    palette.open(openSlashState(context('/mer')));

    expect(palette.update(context('X/mer', 5, { host: 3, editor: 4 }))).toBe(false);
    expect(palette.handleKey('Enter')).toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(palette.status.textContent).toContain('changed');
  });

  test('cancelled asynchronous image selection leaves the query untouched', async () => {
    const accept = vi.fn();
    const palette = new SlashPalette(document, accept, {
      chooseImage: () => Promise.resolve(undefined)
    });
    palette.open(openSlashState(context('/image')));

    await palette.accept('image');
    expect(accept).not.toHaveBeenCalled();
    expect(palette.element.hidden).toBe(true);
  });

  test('cancelled language selection leaves the query untouched', async () => {
    const accept = vi.fn();
    const palette = new SlashPalette(document, accept, {
      chooseLanguage: () => Promise.resolve(undefined)
    });
    palette.open(openSlashState(context('/code')));

    await palette.accept('code');
    expect(accept).not.toHaveBeenCalled();
    expect(palette.element.hidden).toBe(true);
  });
});
