import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

const longToken = `glc_${'eyJvIjoiMjIyMzc4IiwibiI6ImxvZ3MifQ'.repeat(8)}`;

// The caret starts in the title, so every block below it renders rather than revealing its source.
const fixture = [
  '# Title', '',
  'Plain **bold** and *italic* and ~~gone~~ and `code` words.', '',
  '> A quoted note', '',
  '## Section', '',
  '### Subsection', '',
  'After the headings.', '',
  '---', '',
  '- [x] done task',
  '- [ ] open task', '',
  '```sh',
  'sudo systemctl enable --now docker',
  `curl -u "1119928:${longToken}" "https://example.invalid/loki/api/v1/delete"`,
  '```', '',
  'After the block.', ''
].join('\n');

async function open(page: Page, appearance: WebviewAppearance): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance });
  await page.waitForSelector('.markami-code-header');
  await page.mouse.move(1, 1);
}

for (const appearance of ['vscode', 'document'] as const) {
  test.describe(`${appearance} appearance`, () => {
    test('inline emphasis, strikethrough, and code are visibly styled', async ({ page }) => {
      await open(page, appearance);
      const styles = await page.evaluate(() => {
        const read = (selector: string): { weight: number; style: string; decoration: string; background: string; family: string } => {
          const element = document.querySelector(selector);
          if (element === null) throw new Error(`missing ${selector}`);
          const computed = getComputedStyle(element);
          return {
            weight: Number(computed.fontWeight), style: computed.fontStyle, decoration: computed.textDecorationLine,
            background: computed.backgroundColor, family: computed.fontFamily
          };
        };
        return { strong: read('.markami-strong'), emphasis: read('.markami-emphasis'), strike: read('.markami-strike'), code: read('.markami-inlineCode') };
      });

      expect(styles.strong.weight).toBeGreaterThanOrEqual(700);
      expect(styles.emphasis.style).toBe('italic');
      expect(styles.strike.decoration).toContain('line-through');
      expect(styles.code.background).toBe('rgb(10, 10, 10)');
      expect(styles.code.family).toContain('Courier New');
    });

    test('a fenced code block is one card with aligned edges and no gaps', async ({ page }) => {
      await open(page, appearance);
      const card = await page.evaluate(() => {
        const rectangle = (element: Element): { top: number; bottom: number; left: number; right: number; height: number } => {
          const { top, bottom, left, right, height } = element.getBoundingClientRect();
          return { top, bottom, left, right, height };
        };
        const header = document.querySelector('.markami-code-header');
        const label = header?.querySelector('span');
        if (header === null || label === null || label === undefined) throw new Error('missing code header');
        // Whatever slot holds the header: its line wrapper if it sits inside a line, otherwise the widget element itself.
        let headerLine: Element = header.closest('.cm-line') ?? header;
        while (headerLine.parentElement !== null && !headerLine.parentElement.classList.contains('cm-content')) headerLine = headerLine.parentElement;
        const lines: Element[] = [];
        let next = headerLine.nextElementSibling;
        while (next !== null && next.classList.contains('markami-code-line')) {
          lines.push(next);
          next = next.nextElementSibling;
        }
        if (next === null) throw new Error('missing closing fence line');
        return {
          headerLine: rectangle(headerLine), header: rectangle(header), label: rectangle(label),
          lines: lines.map(rectangle), closing: rectangle(next),
          closingBackground: getComputedStyle(next).backgroundColor,
          codePaddingLeft: parseFloat(getComputedStyle(lines[0] ?? headerLine).paddingLeft),
          headerPaddingLeft: parseFloat(getComputedStyle(header).paddingLeft)
        };
      });
      const firstLine = card.lines[0];
      const lastLine = card.lines.at(-1);
      if (firstLine === undefined || lastLine === undefined) throw new Error('code lines missing');

      expect(Math.abs(card.headerLine.height - card.header.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(card.header.left - firstLine.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(card.header.right - firstLine.right)).toBeLessThanOrEqual(1);
      expect(card.headerPaddingLeft).toBe(card.codePaddingLeft);
      expect(Math.abs(card.label.left - (firstLine.left + card.codePaddingLeft))).toBeLessThanOrEqual(1);
      // An edge, not a text line: 8px compact, 16px in the document card.
      expect(card.closing.height).toBeLessThanOrEqual(appearance === 'document' ? 16 : 8);
      expect(Math.abs(card.closing.top - lastLine.bottom)).toBeLessThanOrEqual(1);
      expect(card.closingBackground).toBe('rgb(10, 10, 10)');
    });

    test('code lines wrap by default instead of scrolling one line at a time', async ({ page }) => {
      await open(page, appearance);
      const lines = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.cm-line.markami-code-line')]
        .map((line) => ({ overflowing: line.scrollWidth > line.clientWidth + 1, height: line.getBoundingClientRect().height })));
      const heights = lines.map((line) => line.height);

      expect(lines.some((line) => line.overflowing)).toBe(false);
      expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights) * 1.5);
    });

    test('task checkboxes take the theme accent instead of the browser blue', async ({ page }) => {
      await open(page, appearance);
      const accent = await page.locator('.cm-content input[type="checkbox"]').first()
        .evaluate((checkbox) => getComputedStyle(checkbox).accentColor);

      expect(accent).toBe('rgb(0, 127, 212)');
    });

    test('a divider draws a rule instead of showing its dashes', async ({ page }) => {
      await open(page, appearance);
      const divider = await page.evaluate(() => {
        const line = document.querySelector('.cm-line.markami-divider');
        if (line === null) throw new Error('missing divider line');
        const computed = getComputedStyle(line);
        return { text: line.textContent, width: computed.borderBottomWidth, color: computed.borderBottomColor };
      });

      expect(divider.text).toBe('');
      expect(divider.width).toBe('1px');
      expect(divider.color).toBe('rgb(60, 60, 60)');
    });
  });
}

test('VS Code appearance keeps a visible heading hierarchy and quote bar', async ({ page }) => {
  await open(page, 'vscode');
  const typography = await page.evaluate(() => {
    const measure = (element: Element | undefined): { size: number; weight: number } => {
      if (element === undefined) throw new Error('missing fixture line');
      const computed = getComputedStyle(element);
      return { size: parseFloat(computed.fontSize), weight: Number(computed.fontWeight) };
    };
    const lines = [...document.querySelectorAll('.cm-line')];
    const quote = lines.find((line) => line.classList.contains('markami-quote'));
    if (quote === undefined) throw new Error('missing quote line');
    const quoteStyle = getComputedStyle(quote);
    return {
      h1: measure(lines.find((line) => line.classList.contains('markami-heading1'))),
      h2: measure(lines.find((line) => line.classList.contains('markami-heading2'))),
      h3: measure(lines.find((line) => line.classList.contains('markami-heading3'))),
      body: measure(lines.find((line) => line.textContent === 'After the headings.')),
      quoteBar: { width: parseFloat(quoteStyle.borderLeftWidth), color: quoteStyle.borderLeftColor }
    };
  });

  expect(typography.h1.size).toBeGreaterThan(typography.h2.size);
  expect(typography.h2.size).toBeGreaterThan(typography.h3.size);
  expect(typography.h3.size).toBeGreaterThan(typography.body.size);
  for (const heading of [typography.h1, typography.h2, typography.h3]) expect(heading.weight).toBeGreaterThanOrEqual(600);
  expect(typography.quoteBar.width).toBeGreaterThanOrEqual(2);
  expect(typography.quoteBar.color).toBe('rgb(0, 122, 204)');
});
