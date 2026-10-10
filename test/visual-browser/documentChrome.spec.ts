import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview } from './productionWebview.js';

const fixture = ['# Title', '', 'Body text.', ''].join('\n');

async function open(page: Page): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance: 'vscode', width: 'auto' });
  await page.waitForSelector('.cm-content');
  await page.setViewportSize({ width: 1300, height: 900 });
}

const appearance = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => document.querySelector<HTMLElement>('.markami-document-shell')?.dataset.appearance);

test('the page has no in-page settings bar', async ({ page }) => {
  await open(page);

  await expect(page.locator('.markami-document-controls')).toHaveCount(0);
  await expect(page.locator('select:visible, input[type="number"]:visible')).toHaveCount(0);
});

test('the toggle-style action flips the appearance and back without a bar', async ({ page }) => {
  await open(page);
  expect(await appearance(page)).toBe('vscode');

  await page.evaluate(() => window.postMessage({ type: 'executeAction', actionId: 'markami.toggleDocumentAppearance' }, '*'));
  await expect.poll(() => appearance(page)).toBe('document');

  await page.evaluate(() => window.postMessage({ type: 'executeAction', actionId: 'markami.toggleDocumentAppearance' }, '*'));
  await expect.poll(() => appearance(page)).toBe('vscode');
});
