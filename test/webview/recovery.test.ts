// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { ConflictBanner } from '../../src/webview/ui/notifications/ConflictBanner.js';

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
});
