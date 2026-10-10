import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

// The caret starts in the title, so the alerts below render rather than revealing their source.
const fixture = [
  '# Title', '',
  '> [!NOTE]',
  '> Untouched source ranges stay exactly as written.', '',
  '> [!WARNING]',
  '> Check the digest before publishing.', '',
  'After.', ''
].join('\n');

async function open(page: Page, appearance: WebviewAppearance): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance, width: 'auto' });
  await page.waitForSelector('.markami-alert');
  await page.setViewportSize({ width: 1300, height: 900 });
}

const title = (page: Page, text: 'note' | 'warning'): Promise<{ content: string; color: string; text: string }> =>
  page.evaluate((type) => {
    const line = document.querySelector(`.cm-line.markami-alert-${type}`);
    if (line === null) throw new Error(`missing ${type} alert`);
    const marker = getComputedStyle(line, '::before');
    return { content: marker.content, color: marker.color, text: line.textContent };
  }, text);

for (const appearance of ['vscode', 'document'] as const) {
  test.describe(`${appearance} appearance`, () => {
    test('an alert shows a typed title instead of its raw [!TYPE] marker', async ({ page }) => {
      await open(page, appearance);

      expect(await title(page, 'note')).toEqual({ content: '"Note"', color: 'rgb(55, 148, 255)', text: '' });
      expect(await title(page, 'warning')).toEqual({ content: '"Warning"', color: 'rgb(204, 167, 0)', text: '' });
    });

    test('editing the alert shows the raw marker, dimmed, and drops the title', async ({ page }) => {
      await open(page, appearance);
      await page.locator('.cm-line.markami-alert-note').click();
      const read = (): Promise<{ text: string; content: string; dim: string | undefined }> => page.evaluate(() => {
        const line = document.querySelector('.cm-line.markami-alert-note');
        if (line === null) throw new Error('missing alert');
        return {
          text: line.textContent,
          content: getComputedStyle(line, '::before').content,
          dim: [...line.querySelectorAll('.markami-syntax-marker')].map((marker) => marker.textContent).join('')
        };
      });

      await expect.poll(async () => (await read()).text).toContain('[!NOTE]');
      expect((await read()).content).toBe('none');
      expect((await read()).dim).toContain('[!NOTE]');
    });
  });
}
