import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance, type WebviewPalette, type WebviewTheme } from './productionWebview.js';

const fixture = [
  '# Title', '',
  'Body with [a link](https://example.com) inside.', '',
  '> A quoted note', '',
  '## Section', '',
  '```sh', 'echo hello', '```', ''
].join('\n');

const LIGHT: WebviewTheme = {
  bodyClass: 'vscode-light',
  tokens: { ...DARK_PLUS.tokens, '--vscode-editor-background': '#ffffff', '--vscode-editor-foreground': '#1f1f1f', '--vscode-textCodeBlock-background': '#f3f3f3' }
};
const HIGH_CONTRAST: WebviewTheme = {
  bodyClass: 'vscode-high-contrast',
  tokens: { ...DARK_PLUS.tokens, '--vscode-editor-background': '#000000', '--vscode-editor-foreground': '#ffffff', '--vscode-contrastBorder': '#6fc3df' }
};

async function open(page: Page, options: { theme: WebviewTheme; palette: WebviewPalette; appearance?: WebviewAppearance }): Promise<void> {
  await openProductionWebview(page, { fixture, theme: options.theme, palette: options.palette, appearance: options.appearance ?? 'document', width: 'auto' });
  await page.waitForSelector('.markami-code-header', { state: 'attached' });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.mouse.move(1, 1);
}

async function shellColors(page: Page): Promise<{ background: string; color: string }> {
  return page.evaluate(() => {
    const shell = document.querySelector('.markami-document-shell');
    if (shell === null) throw new Error('missing shell');
    return { background: getComputedStyle(shell).backgroundColor, color: getComputedStyle(shell).color };
  });
}

test('Document appearance in a dark theme uses the Catppuccin Mocha palette', async ({ page }) => {
  await open(page, { theme: DARK_PLUS, palette: 'catppuccin-mocha' });
  const painted = await page.evaluate(() => {
    const color = (selector: string, property: 'color' | 'backgroundColor' | 'borderLeftColor'): string => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`missing ${selector}`);
      return getComputedStyle(element)[property];
    };
    return {
      shell: { background: color('.markami-document-shell', 'backgroundColor'), color: color('.markami-document-shell', 'color') },
      codeBackground: color('.cm-line.markami-code-first', 'backgroundColor'),
      link: color('.markami-link', 'color'),
      quoteBar: color('.cm-line.markami-quote', 'borderLeftColor'),
      button: { background: color('.markami-code-tools button', 'backgroundColor'), color: color('.markami-code-tools button', 'color') }
    };
  });

  expect(painted.shell).toEqual({ background: 'rgb(30, 30, 46)', color: 'rgb(205, 214, 244)' });
  expect(painted.codeBackground).toBe('rgb(24, 24, 37)');
  expect(painted.link).toBe('rgb(137, 180, 250)');
  expect(painted.quoteBar).toBe('rgb(203, 166, 247)');
  expect(painted.button).toEqual({ background: 'rgb(49, 50, 68)', color: 'rgb(205, 214, 244)' });
});

test('the Mocha palette keeps readable contrast for text, links, buttons, and the active outline entry', async ({ page }) => {
  await open(page, { theme: DARK_PLUS, palette: 'catppuccin-mocha' });
  const ratios = await page.evaluate(() => {
    const channels = (value: string): number[] => (/rgba?\(([^)]+)\)/u.exec(value)?.[1] ?? '0,0,0').split(',').slice(0, 3).map(Number);
    const luminance = (value: string): number => {
      const [red = 0, green = 0, blue = 0] = channels(value).map((channel) => {
        const unit = channel / 255;
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const ratio = (foreground: string, background: string): number => {
      const [light = 0, dark = 0] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
      return (light + 0.05) / (dark + 0.05);
    };
    const style = (selector: string): CSSStyleDeclaration => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`missing ${selector}`);
      return getComputedStyle(element);
    };
    const shell = style('.markami-document-shell');
    const button = style('.markami-code-tools button');
    const active = style('.markami-outline [aria-current="location"]');
    return {
      text: ratio(shell.color, shell.backgroundColor),
      link: ratio(style('.markami-link').color, shell.backgroundColor),
      button: ratio(button.color, button.backgroundColor),
      outline: ratio(active.color, active.backgroundColor)
    };
  });

  for (const [name, value] of Object.entries(ratios)) expect(value, name).toBeGreaterThanOrEqual(4.5);
});

for (const scenario of [
  { name: 'a light theme', theme: LIGHT, palette: 'catppuccin-mocha', appearance: 'document', background: 'rgb(255, 255, 255)' },
  { name: 'a high-contrast theme', theme: HIGH_CONTRAST, palette: 'catppuccin-mocha', appearance: 'document', background: 'rgb(0, 0, 0)' },
  { name: 'the vscode palette setting', theme: DARK_PLUS, palette: 'vscode', appearance: 'document', background: 'rgb(30, 30, 30)' },
  { name: 'VS Code appearance', theme: DARK_PLUS, palette: 'catppuccin-mocha', appearance: 'vscode', background: 'rgb(30, 30, 30)' }
] as const) {
  test(`the editor theme wins in ${scenario.name}`, async ({ page }) => {
    await open(page, scenario);

    expect((await shellColors(page)).background).toBe(scenario.background);
  });
}

test('switching appearance at runtime swaps the palette without reloading', async ({ page }) => {
  await open(page, { theme: DARK_PLUS, palette: 'catppuccin-mocha' });
  expect((await shellColors(page)).background).toBe('rgb(30, 30, 46)');
  const toggle = (): Promise<void> => page.evaluate(() =>
    window.postMessage({ type: 'executeAction', actionId: 'markami.toggleDocumentAppearance' }, '*'));

  await toggle();
  await expect.poll(async () => (await shellColors(page)).background).toBe('rgb(30, 30, 30)');

  await toggle();
  await expect.poll(async () => (await shellColors(page)).background).toBe('rgb(30, 30, 46)');
});
