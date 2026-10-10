import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance, type WebviewPalette, type WebviewTheme } from './productionWebview.js';

// The caret starts in the title, so the blocks below render rather than revealing their source.
const fixture = [
  '# Title', '',
  'Prose with `inline` code.', '',
  '```ts',
  "const answer: number = 42; // the answer",
  "const name = 'markami';",
  'function greet(): void {}',
  '```', '',
  '```text',
  'one',
  'two',
  'three',
  '```', '',
  '```sh', 'echo single', '```', ''
].join('\n');

const LIGHT: WebviewTheme = {
  bodyClass: 'vscode-light',
  tokens: { ...DARK_PLUS.tokens, '--vscode-editor-background': '#ffffff', '--vscode-editor-foreground': '#1f1f1f', '--vscode-textCodeBlock-background': '#f3f3f3' }
};
const HIGH_CONTRAST: WebviewTheme = {
  bodyClass: 'vscode-high-contrast',
  tokens: { ...DARK_PLUS.tokens, '--vscode-editor-background': '#000000', '--vscode-editor-foreground': '#ffffff', '--vscode-textCodeBlock-background': '#000000' }
};

async function open(page: Page, options: { theme?: WebviewTheme; appearance?: WebviewAppearance; palette?: WebviewPalette } = {}): Promise<void> {
  await openProductionWebview(page, {
    fixture, theme: options.theme ?? DARK_PLUS, appearance: options.appearance ?? 'vscode', palette: options.palette ?? 'vscode', width: 'auto'
  });
  await page.waitForSelector('.cm-line.markami-code-first');
  await page.setViewportSize({ width: 1300, height: 900 });
  // Languages load lazily, so highlighting appears a moment after the first paint.
  await page.waitForSelector('.markami-tok-keyword');
}

const colorOf = (page: Page, selector: string, text: string): Promise<string> => page.evaluate(({ css, contents }) => {
  const element = [...document.querySelectorAll(css)].find((candidate) => candidate.textContent === contents);
  if (element === undefined) throw new Error(`no ${css} with text ${contents}`);
  return getComputedStyle(element).color;
}, { css: selector, contents: text });

test('code is highlighted with Dark+ colors in a dark theme', async ({ page }) => {
  await open(page);

  expect(await colorOf(page, '.markami-tok-keyword', 'const')).toBe('rgb(86, 156, 214)');
  expect(await colorOf(page, '.markami-tok-number', '42')).toBe('rgb(181, 206, 168)');
  expect(await colorOf(page, '.markami-tok-comment', '// the answer')).toBe('rgb(106, 153, 85)');
  expect(await colorOf(page, '.markami-tok-string', "'markami'")).toBe('rgb(206, 145, 120)');
});

test('highlighting stays inside code blocks and never touches prose', async ({ page }) => {
  await open(page);
  const outside = await page.evaluate(() => [...document.querySelectorAll('[class*="markami-tok-"]')]
    .filter((element) => element.closest('.cm-line.markami-code-line') === null).length);

  expect(outside).toBe(0);
});

for (const scenario of [
  { name: 'a dark theme', theme: DARK_PLUS, minimum: 4.5 },
  { name: 'a light theme', theme: LIGHT, minimum: 4.5 },
  { name: 'a high-contrast theme', theme: HIGH_CONTRAST, minimum: 7 }
]) {
  test(`every token color is readable on the code background in ${scenario.name}`, async ({ page }) => {
    await open(page, { theme: scenario.theme });
    const ratios = await page.evaluate(() => {
      const channels = (value: string): number[] => (/rgba?\(([^)]+)\)/u.exec(value)?.[1] ?? '0,0,0').split(',').slice(0, 3).map(Number);
      const luminance = (value: string): number => {
        const [red = 0, green = 0, blue = 0] = channels(value).map((channel) => {
          const unit = channel / 255;
          return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const background = getComputedStyle(document.querySelector('.cm-line.markami-code-first') as Element).backgroundColor;
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll('.cm-line.markami-code-line [class*="markami-tok-"]')) {
        const name = [...element.classList].find((candidate) => candidate.startsWith('markami-tok-')) ?? 'unknown';
        const [light = 0, dark = 0] = [luminance(getComputedStyle(element).color), luminance(background)].sort((left, right) => right - left);
        seen.set(name, (light + 0.05) / (dark + 0.05));
      }
      return [...seen.entries()];
    });

    expect(ratios.length).toBeGreaterThanOrEqual(4);
    for (const [name, ratio] of ratios) expect(ratio, name).toBeGreaterThanOrEqual(scenario.minimum);
  });
}

test('the Mocha palette recolors code in Document appearance', async ({ page }) => {
  await open(page, { appearance: 'document', palette: 'catppuccin-mocha' });

  expect(await colorOf(page, '.markami-tok-keyword', 'const')).toBe('rgb(203, 166, 247)');
  expect(await colorOf(page, '.markami-tok-string', "'markami'")).toBe('rgb(166, 227, 161)');
});

test('multi-line blocks are numbered by a per-block counter and single-line blocks are not', async ({ page }) => {
  await open(page);
  const lines = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.cm-line.markami-code-line')].map((line) => ({
    text: line.textContent,
    marker: getComputedStyle(line, '::before').content,
    reset: getComputedStyle(line).counterReset,
    increment: getComputedStyle(line).counterIncrement
  })));
  const numbered = lines.filter((line) => line.marker === 'counter(markami-code-line)');

  // Chromium reports the unresolved counter() for the pseudo-element, so the numbering contract is: every line of a
  // multi-line block increments one counter that the block's first line resets, and a one-line block has no number.
  expect(numbered.map((line) => line.text)).toEqual([
    'const answer: number = 42; // the answer', "const name = 'markami';", 'function greet(): void {}', 'one', 'two', 'three'
  ]);
  expect(numbered.every((line) => line.increment === 'markami-code-line 1')).toBe(true);
  expect(lines.filter((line) => line.reset.startsWith('markami-code-line')).length).toBe(3);
  expect(lines.find((line) => line.text === 'echo single')?.marker).toBe('none');
});

test('line numbers are muted, unselectable, and keep wrapped lines aligned', async ({ page }) => {
  await open(page);
  const number = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>('.cm-line.markami-code-line')].find((candidate) => candidate.textContent === 'two');
    if (line === undefined) throw new Error('missing line');
    const marker = getComputedStyle(line, '::before');
    return { color: marker.color, userSelect: marker.userSelect, textIndent: getComputedStyle(line).textIndent, paddingLeft: getComputedStyle(line).paddingLeft };
  });

  expect(number.color).toBe('rgb(133, 133, 133)');
  expect(number.userSelect).toBe('none');
  expect(parseFloat(number.textIndent)).toBeLessThan(0);
  expect(parseFloat(number.paddingLeft)).toBeGreaterThan(Math.abs(parseFloat(number.textIndent)));
});
