import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview } from './productionWebview.js';

// The caret starts in the title, so every other block renders instead of revealing its source.
const fixture = [
  '# Note title', '',
  'Opening paragraph with `inline code` inside.', '',
  '## Second level', '',
  'Paragraph under second level.', '',
  '### Third level', '',
  '- first item',
  '- second item', '',
  '| Name | Value |', '|---|---|', '| one | two |', '',
  '```ts',
  'const answer = 42;',
  '```', '',
  'Closing paragraph.', ''
].join('\n');

interface Measured {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
}

async function open(page: Page, width: number): Promise<string[]> {
  const { external } = await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance: 'document', width: 'auto' });
  await page.waitForSelector('.markami-code-header');
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(async () => {
    await document.fonts.load('700 36px "Shantell Sans Variable"');
    await document.fonts.load('400 18px "Shantell Sans Variable"');
    await document.fonts.load('400 14px "JetBrains Mono Variable"');
    await document.fonts.ready;
  });
  await page.mouse.move(1, 1);
  return external;
}

/** Measures the first rendered line whose class list or text matches, resolving computed pixels in the page. */
async function measureLine(page: Page, match: { readonly className?: string; readonly text?: string }): Promise<Measured> {
  return page.evaluate((target) => {
    const line = [...document.querySelectorAll('.cm-content .cm-line')].find((candidate) =>
      (target.className === undefined || candidate.classList.contains(target.className)) &&
      (target.text === undefined || candidate.textContent.includes(target.text)));
    if (line === undefined) throw new Error(`no line for ${JSON.stringify(target)}`);
    const computed = getComputedStyle(line);
    return {
      family: computed.fontFamily, size: parseFloat(computed.fontSize), weight: Number(computed.fontWeight),
      lineHeight: parseFloat(computed.lineHeight), letterSpacing: parseFloat(computed.letterSpacing),
      wordSpacing: parseFloat(computed.wordSpacing), paddingTop: parseFloat(computed.paddingTop),
      paddingBottom: parseFloat(computed.paddingBottom)
    };
  }, match);
}

test('reading fonts are bundled and nothing is fetched from the network', async ({ page }) => {
  const external = await open(page, 1300);
  const loaded = await page.evaluate(async () => ({
    text: (await document.fonts.load('400 18px "Shantell Sans Variable"')).length,
    mono: (await document.fonts.load('400 14px "JetBrains Mono Variable"')).length
  }));
  const body = await measureLine(page, { text: 'Closing paragraph.' });

  expect(loaded.text).toBeGreaterThan(0);
  expect(loaded.mono).toBeGreaterThan(0);
  expect(body.family.startsWith('"Shantell Sans Variable"')).toBe(true);
  expect(external).toEqual([]);
});

for (const scenario of [
  { width: 600, body: 17, h1: 24 },
  { width: 700, body: 18, h1: 30 },
  { width: 800, body: 18, h1: 36 }
]) {
  test(`type scale at a ${String(scenario.width)}px pane`, async ({ page }) => {
    await open(page, scenario.width);
    const body = await measureLine(page, { text: 'Closing paragraph.' });
    const h1 = await measureLine(page, { className: 'markami-heading1' });

    expect(body.size).toBe(scenario.body);
    expect(body.lineHeight).toBeCloseTo(scenario.body * 1.9, 1);
    expect(body.letterSpacing).toBeCloseTo(scenario.body * 0.005, 2);
    expect(body.wordSpacing).toBeCloseTo(scenario.body * 0.06, 2);
    expect(h1.family.startsWith('"Shantell Sans Variable"')).toBe(true);
    expect(h1.weight).toBe(700);
    expect(h1.size).toBe(scenario.h1);
    expect(h1.lineHeight).toBeCloseTo(scenario.h1 * 1.25, 1);
    expect(h1.letterSpacing).toBeCloseTo(-scenario.h1 * 0.01, 2);
  });
}

test('second and third level headings, lists, and tables follow the reading spec', async ({ page }) => {
  await open(page, 1300);
  const h2 = await measureLine(page, { className: 'markami-heading2' });
  const h3 = await measureLine(page, { className: 'markami-heading3' });
  const item = await measureLine(page, { className: 'markami-list' });
  const cell = await page.evaluate(() => {
    const element = document.querySelector('.markami-table [role="gridcell"]');
    if (element === null) throw new Error('missing table cell');
    const computed = getComputedStyle(element);
    return { size: parseFloat(computed.fontSize), vertical: parseFloat(computed.paddingTop), horizontal: parseFloat(computed.paddingLeft) };
  });

  expect([h2.size, h2.lineHeight, h2.weight]).toEqual([27.2, 38.4, 700]);
  expect(h2.paddingBottom).toBe(12);
  expect([h3.size, h3.lineHeight, h3.weight]).toEqual([22, 32, 700]);
  expect(item.size).toBe(18);
  expect(item.lineHeight).toBeCloseTo(18 * 1.85, 1);
  expect(item.paddingTop).toBeCloseTo(4.8, 1);
  expect(item.paddingBottom).toBeCloseTo(4.8, 1);
  expect(cell).toEqual({ size: 14, vertical: 12, horizontal: 16 });
});

test('a blank source line is the paragraph gap and shrinks under headings', async ({ page }) => {
  await open(page, 1300);
  const heights = await page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.cm-content > .cm-line')];
    const blankAfter = (className: string): number => {
      const heading = lines.find((line) => line.classList.contains(className));
      const next = heading?.nextElementSibling;
      if (next === null || next === undefined) throw new Error(`no blank line after ${className}`);
      return next.getBoundingClientRect().height;
    };
    const paragraph = lines.find((line) => line.textContent.startsWith('Opening paragraph'));
    const between = paragraph?.nextElementSibling?.getBoundingClientRect().height;
    return { h1: blankAfter('markami-heading1'), h2: blankAfter('markami-heading2'), h3: blankAfter('markami-heading3'), between };
  });
  const h2 = await measureLine(page, { className: 'markami-heading2' });
  const h3 = await measureLine(page, { className: 'markami-heading3' });

  expect(heights.between).toBeCloseTo(24, 0);
  expect(heights.h1).toBeCloseTo(16, 0);
  expect(heights.h2).toBeCloseTo(16, 0);
  expect(heights.h3).toBeCloseTo(12, 0);
  expect(h2.paddingTop).toBe(24);
  expect(h3.paddingTop).toBe(8);
});

test('inline code and labels use the bundled mono face', async ({ page }) => {
  await open(page, 1300);
  const mono = await page.evaluate(() => {
    const read = (selector: string): { family: string; size: number; spacing: number; padding: string } => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`missing ${selector}`);
      const computed = getComputedStyle(element);
      return {
        family: computed.fontFamily, size: parseFloat(computed.fontSize), spacing: parseFloat(computed.letterSpacing),
        padding: `${computed.paddingTop} ${computed.paddingRight}`
      };
    };
    return { code: read('.markami-inlineCode'), label: read('.markami-code-header span') };
  });

  expect(mono.code.family.startsWith('"JetBrains Mono Variable"')).toBe(true);
  expect(mono.code.size).toBeCloseTo(15.75, 2);
  expect(mono.code.padding).toBe('2px 6px');
  expect(mono.label.family.startsWith('"JetBrains Mono Variable"')).toBe(true);
  expect(mono.label.size).toBe(12);
  expect(mono.label.spacing).toBeGreaterThan(0.5);
});

test('the reading measure is 100ch and page padding is 16px then 24px', async ({ page }) => {
  await open(page, 1700);
  const wide = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.cm-content');
    const probe = document.createElement('div');
    probe.style.cssText = 'width: 100ch; position: absolute; visibility: hidden;';
    content?.append(probe);
    const hundredCh = probe.getBoundingClientRect().width;
    probe.remove();
    const rect = content?.getBoundingClientRect();
    const computed = content === null ? undefined : getComputedStyle(content);
    return { width: rect?.width ?? 0, hundredCh, paddingLeft: parseFloat(computed?.paddingLeft ?? '0') };
  });
  expect(wide.paddingLeft).toBe(24);
  expect(wide.width).toBeCloseTo(Math.min(wide.hundredCh + 48, 1200), 0);

  await page.setViewportSize({ width: 600, height: 900 });
  const narrow = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.cm-content');
    return parseFloat(getComputedStyle(content as HTMLElement).paddingLeft);
  });
  expect(narrow).toBe(16);
});

test('code, table, and diagram blocks are 12px-radius cards with 24px side padding', async ({ page }) => {
  await open(page, 1300);
  const cards = await page.evaluate(() => {
    const header = document.querySelector('.markami-code-header');
    const codeLine = document.querySelector('.cm-line.markami-code-line');
    const table = document.querySelector('.markami-table');
    if (header === null || codeLine === null || table === null) throw new Error('missing card fixture');
    return {
      headerRadius: getComputedStyle(header).borderTopLeftRadius,
      headerPadding: getComputedStyle(header).paddingLeft,
      codePadding: getComputedStyle(codeLine).paddingLeft,
      tableRadius: getComputedStyle(table).borderTopLeftRadius
    };
  });

  expect(cards).toEqual({ headerRadius: '12px', headerPadding: '24px', codePadding: '24px', tableRadius: '12px' });
});
