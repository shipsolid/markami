import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

// The caret starts in the title, so the blocks below render rather than revealing their source.
const fixture = [
  '# Title', '',
  '```sh', 'echo first', 'echo again', '```', '',
  '```sh', 'echo second', '```', '',
  '| Name | Value |', '|---|---|', '| one | two |', '',
  'Closing paragraph.', ''
].join('\n');

async function open(page: Page, appearance: WebviewAppearance): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance, width: 'auto' });
  await page.waitForSelector('.markami-table');
  await page.setViewportSize({ width: 1300, height: 900 });
}

const opacity = (page: Page, selector: string, index = 0): Promise<number> =>
  page.locator(selector).nth(index).evaluate((element) => Number(getComputedStyle(element).opacity));

for (const appearance of ['vscode', 'document'] as const) {
  test.describe(`${appearance} appearance`, () => {
    test('table controls stay out of the way until the table is hovered or focused', async ({ page }) => {
      await open(page, appearance);
      const layout = await page.evaluate(() => {
        const table = document.querySelector('.markami-table')?.getBoundingClientRect();
        const grid = document.querySelector('.markami-table-grid')?.getBoundingClientRect();
        if (table === undefined || grid === undefined) throw new Error('missing table');
        return { gridOffset: grid.top - table.top };
      });

      expect(await opacity(page, '.markami-table-controls')).toBe(0);
      expect(layout.gridOffset).toBeLessThan(2);

      await page.locator('.markami-table [role="gridcell"]').first().hover();
      await expect.poll(() => opacity(page, '.markami-table-controls')).toBe(1);

      await page.mouse.move(2, 2);
      await expect.poll(() => opacity(page, '.markami-table-controls')).toBe(0);

      await page.locator('.markami-table-controls button').first().focus();
      await expect.poll(() => opacity(page, '.markami-table-controls')).toBe(1);
    });

    test('code tools appear for the hovered block only, and for the block with the caret', async ({ page }) => {
      await open(page, appearance);
      expect(await opacity(page, '.markami-code-tools', 0)).toBe(0);
      expect(await opacity(page, '.markami-code-tools', 1)).toBe(0);

      await page.locator('.cm-line.markami-code-line', { hasText: 'echo first' }).hover();
      await expect.poll(() => opacity(page, '.markami-code-tools', 0)).toBe(1);
      expect(await opacity(page, '.markami-code-tools', 1)).toBe(0);

      await page.locator('.cm-line.markami-code-line', { hasText: 'echo second' }).hover();
      await expect.poll(() => opacity(page, '.markami-code-tools', 1)).toBe(1);
      await expect.poll(() => opacity(page, '.markami-code-tools', 0)).toBe(0);

      await page.mouse.move(2, 2);
      await expect.poll(() => opacity(page, '.markami-code-tools', 1)).toBe(0);

      await page.locator('.cm-line.markami-code-line', { hasText: 'echo again' }).click();
      await expect.poll(() => opacity(page, '.markami-code-tools', 0)).toBe(1);
      await page.mouse.move(2, 2);
      expect(await opacity(page, '.markami-code-tools', 0)).toBe(1);
    });

    test('code tools take no row: the code starts directly under the card edge', async ({ page }) => {
      await open(page, appearance);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('.markami-code-header')?.getBoundingClientRect();
        const first = document.querySelector('.cm-line.markami-code-first')?.getBoundingClientRect();
        const tools = document.querySelector('.markami-code-tools')?.getBoundingClientRect();
        if (header === undefined || first === undefined || tools === undefined) throw new Error('missing code block');
        return { header: header.height, firstTop: first.top, headerTop: header.top, toolsRight: tools.right, firstRight: first.right, toolsTop: tools.top, toolsBottom: tools.bottom, firstBottom: first.bottom };
      });

      expect(geometry.header).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.firstTop - geometry.headerTop)).toBeLessThanOrEqual(1);
      expect(geometry.toolsRight).toBeLessThan(geometry.firstRight);
      expect(geometry.toolsTop).toBeGreaterThanOrEqual(geometry.headerTop);
      expect(geometry.toolsBottom).toBeLessThanOrEqual(geometry.firstBottom);
    });

    test('block handles are invisible until the pointer is in the editor and solid on hover', async ({ page }) => {
      await open(page, appearance);
      await page.mouse.move(-10, -10);
      await expect.poll(() => opacity(page, '.markami-block-gutter button')).toBe(0);

      await page.locator('.cm-line', { hasText: 'Closing paragraph.' }).hover();
      await expect.poll(() => opacity(page, '.markami-block-gutter button')).toBeCloseTo(0.35, 1);

      await page.locator('.markami-block-gutter button').first().hover();
      await expect.poll(() => opacity(page, '.markami-block-gutter button')).toBe(1);

      await page.mouse.move(-10, -10);
      await page.locator('.markami-block-gutter button').first().focus();
      await expect.poll(() => opacity(page, '.markami-block-gutter button')).toBe(1);
    });
  });
}
