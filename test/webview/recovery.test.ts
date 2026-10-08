// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { ConflictBanner, ErrorBanner } from '../../src/webview/ui/notifications/ConflictBanner.js';
import { preserveLiveConflictDraft } from '../../src/webview/bridge/recovery.js';

describe('recovery conflict banner', () => {
  test('offers all explicit recovery actions and can be removed', () => {
    const choose = vi.fn();
    const banner = new ConflictBanner(choose);
    document.body.append(banner.element);

    const labels = [...banner.element.querySelectorAll('button')].map((button) => button.textContent);
    expect(labels).toEqual(['Inspect diff', 'Copy local draft', 'Reload canonical', 'Discard local draft']);
    banner.element.querySelector<HTMLButtonElement>('button:last-child')?.click();
    expect(choose).toHaveBeenCalledWith('discard');

    banner.destroy();
    expect(document.body.contains(banner.element)).toBe(false);
  });

  test('renders host errors as a live dismissible alert', () => {
    const banner = new ErrorBanner('VS Code could not save this document.');
    document.body.append(banner.element);
    expect(banner.element.getAttribute('role')).toBe('alert');
    expect(banner.element.textContent).toContain('VS Code could not save this document.');
    banner.element.querySelector('button')?.click();
    expect(document.body.contains(banner.element)).toBe(false);
  });

  test('generic stored recovery notice cannot replace a newer live restored draft', () => {
    const restored = preserveLiveConflictDraft(undefined, 'ABC');
    expect(preserveLiveConflictDraft(restored, undefined)).toBe('ABC');
  });
});
