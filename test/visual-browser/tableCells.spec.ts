import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

const fixture = [
  '# Title', '', '| **Symbol** | Meaning |', '|---|---|', '| `#` | *heading* |', '| a **bold** word | plain |', '', 'After.', ''
].join('\n');

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

    test('clicking inside styled text puts the caret at the matching place in the source', async ({ page }) => {
      await open(page, appearance);
      // Located by position: once focused the cell shows its source, so a text filter would stop matching it.
      const cell = page.locator('.markami-table [role="gridcell"]').nth(2);
      await expect(cell).toHaveText('a bold word');
      // Click on the left edge of the "o" in the rendered word "bold", which is `a **b|old**` in the source.
      const target = await cell.evaluate((element) => {
        const text = element.textContent;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let consumed = 0;
        let node: Node | null;
        const wanted = text.indexOf('bold') + 1;
        while ((node = walker.nextNode()) !== null) {
          const length = node.textContent?.length ?? 0;
          if (wanted < consumed + length) {
            const range = document.createRange();
            range.setStart(node, wanted - consumed);
            range.setEnd(node, wanted - consumed + 1);
            const box = range.getBoundingClientRect();
            return { x: box.left + 1, y: box.top + box.height / 2 };
          }
          consumed += length;
        }
        throw new Error('rendered word not found');
      });

      await page.mouse.click(target.x, target.y);

      await expect(cell).toHaveText('a **bold** word');
      const beforeCaret = await cell.evaluate((element) => {
        const selection = getSelection();
        if (selection === null || selection.anchorNode === null) throw new Error('no selection');
        const range = document.createRange();
        range.selectNodeContents(element);
        range.setEnd(selection.anchorNode, selection.anchorOffset);
        return { text: range.toString(), collapsed: selection.isCollapsed };
      });
      expect(beforeCaret).toEqual({ text: 'a **b', collapsed: true });
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
