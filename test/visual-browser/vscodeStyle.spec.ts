import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview } from './productionWebview.js';

// The caret starts in the title, so every other block renders rather than revealing its source.
const fixture = [
  '# Title', '',
  'Paragraph with `inline code` here.', '',
  '## Section', '',
  '- first item',
  '- second item', '',
  '> Quoted note', '',
  '### Third', '',
  '| Name | Value |', '|---|---|', '| one | two |', '',
  'Closing paragraph.', ''
].join('\n');

async function open(page: Page): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance: 'vscode', width: 'auto' });
  await page.waitForSelector('.markami-table');
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.mouse.move(1, 1);
}

interface Style {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
  readonly borderBottomWidth: number;
  readonly borderBottomColor: string;
  readonly borderLeftWidth: number;
  readonly radius: number;
  readonly background: string;
}

async function styleOf(page: Page, selector: string, text?: string): Promise<Style> {
  return page.evaluate(({ selector: css, text: contains }) => {
    const element = [...document.querySelectorAll(css)].find((candidate) => contains === undefined || candidate.textContent.includes(contains));
    if (element === undefined) throw new Error(`no element for ${css}`);
    const computed = getComputedStyle(element);
    return {
      family: computed.fontFamily, size: parseFloat(computed.fontSize), weight: Number(computed.fontWeight),
      lineHeight: parseFloat(computed.lineHeight), paddingTop: parseFloat(computed.paddingTop),
      paddingBottom: parseFloat(computed.paddingBottom), paddingLeft: parseFloat(computed.paddingLeft),
      borderBottomWidth: parseFloat(computed.borderBottomWidth), borderBottomColor: computed.borderBottomColor,
      borderLeftWidth: parseFloat(computed.borderLeftWidth), radius: parseFloat(computed.borderTopLeftRadius),
      background: computed.backgroundColor
    };
  }, { selector, text });
}

test('body text is 14px at 1.6 in the UI font, not the editor font', async ({ page }) => {
  await open(page);
  const body = await styleOf(page, '.cm-content .cm-line', 'Closing paragraph.');

  expect(body.family).toBe('sans-serif');
  expect(body.size).toBe(14);
  expect(body.lineHeight).toBeCloseTo(22.4, 1);
});

test('h1 and h2 carry a bottom rule and h3 does not', async ({ page }) => {
  await open(page);
  const h1 = await styleOf(page, '.cm-line.markami-heading1');
  const h2 = await styleOf(page, '.cm-line.markami-heading2');
  const h3 = await styleOf(page, '.cm-line.markami-heading3');

  expect([h1.size, h2.size, h3.size]).toEqual([28, 21, 17.5]);
  expect([h1.weight, h2.weight, h3.weight]).toEqual([600, 600, 600]);
  expect(h1.borderBottomWidth).toBe(1);
  expect(h1.borderBottomColor).toBe('rgb(48, 48, 49)');
  expect(h1.paddingBottom).toBeCloseTo(8.4, 1);
  expect(h2.borderBottomWidth).toBe(1);
  expect(h3.borderBottomWidth).toBe(0);
});

test('a blank source line is a 16px paragraph gap that tightens to 8px under a heading', async ({ page }) => {
  await open(page);
  const gaps = await page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.cm-content > .cm-line')];
    const after = (predicate: (line: HTMLElement) => boolean): number => {
      const next = lines.find(predicate)?.nextElementSibling;
      if (next === null || next === undefined) throw new Error('missing blank line');
      return next.getBoundingClientRect().height;
    };
    return {
      paragraph: after((line) => line.textContent.startsWith('Paragraph with')),
      h1: after((line) => line.classList.contains('markami-heading1')),
      h2: after((line) => line.classList.contains('markami-heading2'))
    };
  });

  expect(gaps.paragraph).toBeCloseTo(16, 0);
  expect(gaps.h1).toBeCloseTo(8, 0);
  expect(gaps.h2).toBeCloseTo(8, 0);
});

test('list items are compact, inline code is a pill, and quotes carry a 4px bar', async ({ page }) => {
  await open(page);
  const item = await styleOf(page, '.cm-line.markami-list');
  const code = await styleOf(page, '.markami-inlineCode');
  const quote = await styleOf(page, '.cm-line.markami-quote');

  expect(item.lineHeight).toBeCloseTo(22.4, 1);
  expect([item.paddingTop, item.paddingBottom]).toEqual([1, 1]);
  expect(code.size).toBeCloseTo(11.9, 1);
  expect(code.radius).toBe(4);
  expect(code.background).toBe('rgb(10, 10, 10)');
  expect(code.paddingLeft).toBeCloseTo(11.9 * 0.4, 1);
  expect(quote.borderLeftWidth).toBe(4);
  expect([quote.paddingTop, quote.paddingLeft]).toEqual([4, 16]);
});

test('the page has 26px side padding and room to scroll past the last line', async ({ page }) => {
  await open(page);
  const content = await styleOf(page, '.cm-content');

  expect(content.paddingLeft).toBe(26);
  expect(content.paddingBottom).toBeCloseTo(270, 0);
});

test('table cells are padded and bordered, with a bold header row', async ({ page }) => {
  await open(page);
  const cell = await styleOf(page, '.markami-table [role="gridcell"]');
  const header = await styleOf(page, '.markami-table [role="columnheader"]');

  expect([cell.paddingTop, cell.paddingLeft]).toEqual([6, 13]);
  expect(header.weight).toBe(600);
  expect(cell.size).toBe(14);
});

test('clicking into the text draws no focus ring around the editor surface', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Closing paragraph.' }).click();
  const outlines = await page.evaluate(() => ['.cm-editor', '.cm-content', '.cm-scroller'].map((selector) => {
    const element = document.querySelector(selector);
    if (element === null) throw new Error(`missing ${selector}`);
    const computed = getComputedStyle(element);
    return `${selector}:${computed.outlineStyle}`;
  }));

  expect(outlines).toEqual(['.cm-editor:none', '.cm-content:none', '.cm-scroller:none']);
});
