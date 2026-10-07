// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ActionContext } from '../../src/core/markdown/formatting.js';
import { applyPatchSet } from '../../src/core/source/PatchSet.js';
import { findImages } from '../../src/webview/features/images/images.js';
import { ImagePopover } from '../../src/webview/ui/images/ImagePopover.js';

describe('ImagePopover', () => {
  beforeEach(() => document.body.replaceChildren());

  test('edits alt, path, and title through one exact-source action', () => {
    const source = 'Before ![Old](./old.png "Old title") after';
    const image = findImages(source)[0];
    if (image === undefined) throw new Error('missing image');
    const context: ActionContext = {
      source, hostVersion: 1, editorRevision: 2,
      selection: { anchor: 0, head: 0 }, capabilities: {}
    };
    const apply = vi.fn();
    const popover = new ImagePopover(document, apply, () => context, vi.fn(), vi.fn());
    popover.show(context, image);
    const fields = popover.element.querySelectorAll<HTMLInputElement>('input');
    const alt = fields[0];
    const destination = fields[1];
    const title = fields[2];
    if (alt === undefined || destination === undefined || title === undefined) throw new Error('missing fields');
    alt.value = 'New';
    destination.value = './new.png';
    title.value = 'New title';

    popover.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const result = apply.mock.calls[0]?.[0] as { edit: { patches: Parameters<typeof applyPatchSet>[1] } };
    expect(applyPatchSet(source, result.edit.patches)).toBe('Before ![New](./new.png "New title") after');
  });

  test('external source edit invalidates captured image controls', () => {
    const source = '![Old](./old.png)';
    const image = findImages(source)[0];
    if (image === undefined) throw new Error('missing image');
    const context: ActionContext = {
      source, hostVersion: 1, editorRevision: 2,
      selection: { anchor: 0, head: 0 }, capabilities: {}
    };
    const apply = vi.fn();
    const popover = new ImagePopover(document, apply, () => ({ ...context, source: `X${source}`, hostVersion: 2 }), vi.fn(), vi.fn());
    popover.show(context, image);

    expect(popover.confirm()).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
