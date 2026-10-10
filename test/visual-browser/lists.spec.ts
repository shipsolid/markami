import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

const longItem = 'a list item with enough words that it has to wrap onto a second line in a pane that is not very wide at all, '.repeat(2).trim();

// The caret starts in the title, so the lists below render rather than revealing their source.
const fixture = [
  '# Title', '',
  '- first item',
  `- ${longItem}`,
  '  - nested item',
  '    - deeper item', '',
  '1. first step',
  '2. second step', '',
  '- [x] done task',
  '- [ ] open task', '',
  'Closing paragraph.', ''
].join('\n');

async function open(page: Page, appearance: WebviewAppearance, width = 900): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance, width: 'auto' });
  await page.waitForSelector('.markami-bullet');
  await page.setViewportSize({ width, height: 900 });
}

for (const appearance of ['vscode', 'document'] as const) {
  test.describe(`${appearance} appearance`, () => {
    test('bullets are real glyphs that step down with nesting, and numbers keep their text', async ({ page }) => {
      await open(page, appearance);
      const glyphs = await page.evaluate(() => ({
        bullets: [...document.querySelectorAll('.markami-bullet')].map((element) => element.textContent),
        numbers: [...document.querySelectorAll('.markami-list-number')].map((element) => element.textContent),
        raw: [...document.querySelectorAll('.cm-line.markami-list')].some((line) => /^\s*[-+*]\s/u.test(line.textContent))
      }));

      expect(glyphs.bullets).toEqual(['•', '•', '◦', '▪']);
      expect(glyphs.numbers).toEqual(['1. ', '2. ']);
      expect(glyphs.raw).toBe(false);
    });

    test('nested items are indented one step per level', async ({ page }) => {
      await open(page, appearance);
      const lefts = await page.evaluate(() => ['first item', 'nested item', 'deeper item'].map((text) => {
        const line = [...document.querySelectorAll('.cm-line.markami-list')].find((candidate) => candidate.textContent.includes(text));
        if (line === undefined) throw new Error(`no line for ${text}`);
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode()) !== null) {
          const at = (node.textContent ?? '').indexOf(text);
          if (at >= 0) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            return range.getBoundingClientRect().left;
          }
        }
        throw new Error('text not found');
      }));

      const [first = 0, nested = 0, deeper = 0] = lefts;
      expect(nested - first).toBeGreaterThanOrEqual(20);
      expect(deeper - nested).toBeGreaterThanOrEqual(20);
    });

    test('wrapped list text hangs under the first line instead of under the bullet', async ({ page }) => {
      await open(page, appearance, 700);
      const alignment = await page.evaluate((needle) => {
        const line = [...document.querySelectorAll('.cm-line.markami-list')].find((candidate) => candidate.textContent.includes(needle));
        if (line === undefined) throw new Error('missing long item');
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const rects: Array<{ left: number; top: number }> = [];
        let node: Node | null;
        while ((node = walker.nextNode()) !== null) {
          if (node.parentElement?.closest('.markami-bullet, .markami-list-number') != null) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) rects.push({ left: Math.round(rect.left), top: Math.round(rect.top) });
        }
        return { first: rects[0]?.left ?? 0, lines: new Set(rects.map((rect) => rect.top)).size, last: rects.at(-1)?.left ?? 0 };
      }, 'a list item with enough words');

      expect(alignment.lines).toBeGreaterThanOrEqual(2);
      expect(Math.abs(alignment.last - alignment.first)).toBeLessThanOrEqual(2);
    });

    test('task items show a checkbox instead of a bullet', async ({ page }) => {
      await open(page, appearance);
      const tasks = await page.evaluate(() => [...document.querySelectorAll('.cm-line.markami-list-task')].map((line) => ({
        checkbox: line.querySelector('input[type="checkbox"]') !== null,
        bullet: line.querySelector('.markami-bullet') !== null
      })));

      expect(tasks).toEqual([{ checkbox: true, bullet: false }, { checkbox: true, bullet: false }]);
    });

    test('markers shown for editing are dimmed instead of full contrast', async ({ page }) => {
      await open(page, appearance);
      await page.locator('.cm-line.markami-heading1').click();
      await page.locator('.cm-line.markami-list', { hasText: 'first item' }).click();
      const colors = await page.evaluate(() => {
        const color = (selector: string): string => {
          const element = document.querySelector(selector);
          if (element === null) throw new Error(`missing ${selector}`);
          return getComputedStyle(element).color;
        };
        const marker = [...document.querySelectorAll('.markami-syntax-marker')].map((element) => element.textContent);
        return { marker, dim: color('.markami-syntax-marker'), text: getComputedStyle(document.querySelector('.cm-content') as Element).color };
      });

      expect(colors.marker).toContain('- ');
      expect(colors.dim).toBe('rgb(157, 157, 157)');
      expect(colors.dim).not.toBe(colors.text);
    });
  });
}
