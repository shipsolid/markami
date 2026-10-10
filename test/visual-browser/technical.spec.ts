import { expect, test } from '@playwright/test';
import { marketplaceFixture, openProductionWebview } from './productionWebview.js';

test('production webview renders technical Markdown from packaged assets only', async ({ page }) => {
  const { external } = await openProductionWebview(page, { fixture: marketplaceFixture('technical') });
  await expect(page.locator('.markami-mermaid svg g.node')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.markami-math .katex').first()).toBeVisible();
  await expect(page.locator('.markami-code-line', { hasText: 'const patch' })).toBeVisible();

  // Mermaid's own stylesheet centres each label; losing it leaves labels starting at the node centre.
  const offsets = await page.evaluate(() => [...document.querySelectorAll('.markami-mermaid g.node')].map((node) => {
    const box = node.querySelector('rect')?.getBoundingClientRect();
    const texts = [...node.querySelectorAll('text')].map((text) => text.getBoundingClientRect());
    if (box === undefined || texts.length === 0) return { centred: false, inside: false };
    const left = Math.min(...texts.map((text) => text.left));
    const right = Math.max(...texts.map((text) => text.right));
    return {
      centred: Math.abs((left + right) / 2 - (box.left + box.right) / 2) <= 1,
      inside: left >= box.left - 1 && right <= box.right + 1
    };
  }));
  expect(offsets).toEqual([
    { centred: true, inside: true }, { centred: true, inside: true }, { centred: true, inside: true }
  ]);
  expect(external).toEqual([]);
});
