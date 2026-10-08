import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const css = [
  readFileSync(path.join(root, 'src/webview/styles/layout.css'), 'utf8'),
  readFileSync(path.join(root, 'src/webview/styles/appearance.css'), 'utf8'),
  readFileSync(path.join(root, 'src/webview/app.css'), 'utf8').replaceAll(/^@import[^;]+;$/gmu, '')
].join('\n');

const themes = {
  light: { background: 'rgb(255, 255, 255)', foreground: 'rgb(31, 31, 31)', focus: 'rgb(0, 120, 212)' },
  dark: { background: 'rgb(30, 30, 30)', foreground: 'rgb(212, 212, 212)', focus: 'rgb(0, 122, 204)' },
  highContrast: { background: 'rgb(0, 0, 0)', foreground: 'rgb(255, 255, 255)', focus: 'rgb(255, 255, 0)' }
} as const;

test('production styles satisfy the viewport, theme, and local-overflow matrix', async ({ page }) => {
  await page.setContent(documentMarkup());
  await page.addStyleTag({ content: css });

  for (const [theme, colors] of Object.entries(themes)) {
    await page.evaluate(({ themeName, tokens }) => {
      document.body.className = themeName === 'highContrast' ? 'vscode-high-contrast' : `vscode-${themeName}`;
      document.documentElement.style.setProperty('--vscode-editor-background', tokens.background);
      document.documentElement.style.setProperty('--vscode-editor-foreground', tokens.foreground);
      document.documentElement.style.setProperty('--vscode-focusBorder', tokens.focus);
      document.documentElement.style.setProperty('--vscode-contrastBorder', tokens.focus);
      document.documentElement.style.setProperty('--vscode-dropdown-background', tokens.background);
      document.documentElement.style.setProperty('--vscode-dropdown-foreground', tokens.foreground);
      document.documentElement.style.setProperty('--vscode-font-family', 'Arial, sans-serif');
      document.documentElement.style.setProperty('--vscode-editor-font-family', 'monospace');
      document.documentElement.style.setProperty('--vscode-editor-font-size', '14px');
    }, { themeName: theme, tokens: colors });

    for (const appearance of ['vscode', 'document'] as const) {
      for (const width of ['auto', 'readable', 'full'] as const) {
        for (const paneWidth of [320, 768, 1440]) {
          await page.setViewportSize({ width: paneWidth, height: 900 });
          await page.locator('#editor').evaluate((shell, values) => {
            shell.setAttribute('data-appearance', values.appearance);
            shell.setAttribute('data-width', values.width);
            shell.setAttribute('data-editor-font', 'true');
            (shell as HTMLElement).style.setProperty('--markami-max-content-width', '960px');
          }, { appearance, width });

          const measurements = await page.evaluate(() => {
            const shell = document.querySelector<HTMLElement>('#editor');
            const content = document.querySelector<HTMLElement>('.cm-content');
            const table = document.querySelector<HTMLElement>('.markami-table');
            const grid = document.querySelector<HTMLElement>('.markami-table-grid');
            const code = document.querySelector<HTMLElement>('.markami-code-line');
            if (shell === null || content === null || table === null || grid === null || code === null) {
              throw new Error('missing visual fixture element');
            }
            return {
              bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              codeClient: code.clientWidth,
              codeScroll: code.scrollWidth,
              contentWidth: content.getBoundingClientRect().width,
              gridWidth: grid.scrollWidth,
              shellClient: shell.clientWidth,
              shellScroll: shell.scrollWidth,
              tableClient: table.clientWidth,
              tableScroll: table.scrollWidth
            };
          });

          expect(measurements.bodyOverflow).toBe(0);
          expect(measurements.shellScroll).toBeLessThanOrEqual(measurements.shellClient);
          expect(measurements.contentWidth).toBeLessThanOrEqual(paneWidth);
          if (width === 'full') expect(measurements.contentWidth).toBeCloseTo(paneWidth, 0);
          if (width === 'auto' && paneWidth === 1440) expect(measurements.contentWidth).toBeCloseTo(960, 0);
          if (width === 'readable' && paneWidth === 1440) expect(measurements.contentWidth).toBeLessThanOrEqual(960);
          expect(measurements.tableScroll).toBeGreaterThan(measurements.tableClient);
          expect(measurements.gridWidth).toBeGreaterThan(measurements.tableClient);
          expect(measurements.codeScroll).toBeGreaterThan(measurements.codeClient);
        }
      }
    }

    const computed = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('#editor');
      const control = document.querySelector<HTMLElement>('.markami-document-controls');
      if (shell === null || control === null) throw new Error('missing themed fixture element');
      return {
        background: getComputedStyle(shell).backgroundColor,
        color: getComputedStyle(shell).color,
        focusBorder: getComputedStyle(document.documentElement).getPropertyValue('--vscode-focusBorder').trim(),
        highContrastBorder: getComputedStyle(control).borderColor
      };
    });
    expect(computed.background).toBe(colors.background);
    expect(computed.color).toBe(colors.foreground);
    expect(computed.focusBorder).toBe(colors.focus);
    if (theme === 'highContrast') expect(computed.highContrastBorder).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('reduced motion disables presentation transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(documentMarkup());
  await page.addStyleTag({ content: css });
  await page.locator('.motion-probe').evaluate((element) => {
    (element as HTMLElement).style.transition = 'opacity 2s';
  });

  await expect.poll(() => page.locator('.motion-probe').evaluate((element) => getComputedStyle(element).transitionDuration))
    .toBe('0s');
});

function documentMarkup(): string {
  const wideCells = Array.from({ length: 8 }, (_, index) => `<div role="gridcell">Column ${String(index)} with wide content</div>`).join('');
  return `<!doctype html>
<html><body>
  <main id="editor" class="markami-document-shell" data-appearance="vscode" data-width="auto" data-editor-font="true">
    <nav class="markami-document-controls" role="toolbar">
      <label><span>Appearance</span><select><option>VS Code</option><option>Document</option></select></label>
      <label><span>Width</span><select><option>Auto</option><option>Readable</option><option>Full</option></select></label>
      <label><span>Maximum</span><input type="number" value="960"></label>
    </nav>
    <div class="cm-editor"><div class="cm-scroller"><div class="cm-content">
      <div class="cm-line markami-heading1">Heading</div>
      <div class="cm-line">Rendered prose remains inside the selected content column.</div>
      <div class="markami-table"><div class="markami-table-controls"><button>Action</button></div><div class="markami-table-grid" role="grid"><div role="row">${wideCells}</div></div></div>
      <div class="cm-line markami-code-line">${'const_very_long_identifier = '.repeat(40)}</div>
      <div class="motion-probe">motion</div>
    </div></div></div>
  </main>
</body></html>`;
}
