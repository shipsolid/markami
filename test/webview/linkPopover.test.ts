// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ActionContext } from '../../src/core/markdown/formatting.js';
import { applyPatchSet } from '../../src/core/source/PatchSet.js';
import { createFormattingActionRegistry } from '../../src/webview/editor/actionRegistry.js';
import { LinkPopover } from '../../src/webview/ui/inlinePopover/LinkPopover.js';

describe('LinkPopover', () => {
  beforeEach(() => document.body.replaceChildren());

  test('edits a reference destination without converting its source form', () => {
    const source = '[Runbook][ops]\n\n[ops]: ./runbook.md';
    const context: ActionContext = {
      source,
      hostVersion: 1,
      editorRevision: 2,
      selection: { anchor: 3, head: 3 },
      capabilities: {}
    };
    const apply = vi.fn();
    const popover = new LinkPopover(document, createFormattingActionRegistry(), apply, () => context);
    popover.show(context);
    const input = popover.element.querySelector<HTMLInputElement>('input');
    expect(input?.value).toBe('./runbook.md');
    expect(input?.type).toBe('text');
    if (input !== null) input.value = '../ops.md';

    popover.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const result = apply.mock.calls[0]?.[0] as { edit: { patches: Parameters<typeof applyPatchSet>[1] } };
    expect(applyPatchSet(source, result.edit.patches)).toBe('[Runbook][ops]\n\n[ops]: ../ops.md');
  });
});
