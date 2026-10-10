import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

const fixture = ['# Title', '', '| **Symbol** | Meaning |', '|---|---|', '| `#` | *heading* |', '', 'After.', ''].join('\n');

async function open(page: Page, appearance: WebviewAppearance): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance, width: 'auto' });
  await page.waitForSelector('.markami-table');
  await page.setViewportSize({ width: 1300, height: 900 });
}

for (const appearance of ['vscode', 'document'] as const) {
  test.describe(`${appearance} appearance`, () => {
    test('cells show rendered bold, code, and emphasis instead of raw Markdown', async ({ page }) => {
      await open(page, appearance);
      const cells = await page.evaluate(() => {
        const read = (selector: string): { text: string; weight: number; background: string; style: string } => {
          const element = document.querySelector(selector);
          if (element === null) throw new Error(`missing ${selector}`);
          const computed = getComputedStyle(element);
          return { text: element.textContent, weight: Number(computed.fontWeight), background: computed.backgroundColor, style: computed.fontStyle };
        };
        return {
          header: document.querySelector('.markami-table [role="columnheader"]')?.textContent,
          bold: read('.markami-table [role="columnheader"] .markami-strong'),
          code: read('.markami-table [role="gridcell"] .markami-inlineCode'),
          emphasis: read('.markami-table [role="gridcell"] .markami-emphasis')
        };
      });

      expect(cells.header).toBe('Symbol');
      expect(cells.bold.weight).toBeGreaterThanOrEqual(700);
      expect(cells.code).toMatchObject({ text: '#', background: 'rgb(10, 10, 10)' });
      expect(cells.emphasis).toMatchObject({ text: 'heading', style: 'italic' });
    });

    test('clicking a cell edits its raw source and leaving restores the rendering', async ({ page }) => {
      await open(page, appearance);
      const cell = page.locator('.markami-table [role="gridcell"]').first();

      await cell.click();
      await expect(cell).toHaveText('`#`');
      await page.locator('.cm-line', { hasText: 'After.' }).click();
      await expect(cell).toHaveText('#');
    });
  });
}
