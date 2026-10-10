import { expect, test, type Page } from '@playwright/test';
import { DARK_PLUS, openProductionWebview, type WebviewAppearance } from './productionWebview.js';

const fixture = [
  '# Title', '',
  'Opening paragraph.', '',
  '## Section one', '',
  '```sh', 'echo hello', '```', '',
  '## Section two', '',
  'Closing paragraph.', ''
].join('\n');

async function open(page: Page, width: number, appearance: WebviewAppearance = 'document'): Promise<void> {
  await openProductionWebview(page, { fixture, theme: DARK_PLUS, appearance, width: 'auto' });
  await page.waitForSelector('.markami-code-header');
  await page.setViewportSize({ width, height: 900 });
  await page.mouse.move(1, 1);
}

interface Box { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }

interface Layout {
  readonly outline: Box & { readonly width: number; readonly collapsed: string | undefined };
  readonly header: Box;
  readonly contentRight: number;
  readonly copyRight: number;
}

const intersects = (first: Box, second: Box): boolean =>
  first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const outline = document.querySelector<HTMLElement>('.markami-outline');
    const content = document.querySelector('.cm-content');
    const header = document.querySelector('.markami-code-header');
    const copy = document.querySelector('.markami-code-header button');
    if (outline === null || content === null || header === null || copy === null) throw new Error('missing layout fixture');
    const box = outline.getBoundingClientRect();
    const slot = header.getBoundingClientRect();
    return {
      outline: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, collapsed: outline.dataset.collapsed },
      header: { left: slot.left, right: slot.right, top: slot.top, bottom: slot.bottom },
      contentRight: content.getBoundingClientRect().right,
      copyRight: copy.getBoundingClientRect().right
    };
  });
}

for (const scenario of [
  { width: 1300, outline: 260 },
  { width: 1800, outline: 300 }
]) {
  for (const appearance of ['document', 'vscode'] as const) {
    test(`an expanded outline docks as a ${String(scenario.outline)}px column with a 40px gap at ${String(scenario.width)}px in ${appearance} appearance`, async ({ page }) => {
      await open(page, scenario.width, appearance);
      const measured = await layout(page);

      expect(measured.outline.width).toBe(scenario.outline);
      expect(measured.outline.collapsed).toBe('false');
      expect(measured.outline.left - measured.contentRight).toBeGreaterThanOrEqual(40 - 1);
      expect(measured.outline.left - measured.copyRight).toBeGreaterThanOrEqual(40 - 1);
      expect(intersects(measured.outline, measured.header)).toBe(false);
    });
  }
}

test('collapsing a docked outline gives the column back to the document', async ({ page }) => {
  await open(page, 1300);
  const docked = await layout(page);
  await page.getByRole('button', { name: 'Collapse document outline' }).click();
  await expect.poll(async () => (await layout(page)).outline.collapsed).toBe('true');
  const collapsed = await layout(page);

  expect(collapsed.outline.width).toBeLessThan(100);
  expect(collapsed.contentRight).toBeGreaterThan(docked.contentRight);
});

test('below 1280px the outline starts as a small pill', async ({ page }) => {
  await open(page, 1000);
  const pill = await layout(page);

  expect(pill.outline.collapsed).toBe('true');
  expect(pill.outline.width).toBeLessThan(100);
  expect(intersects(pill.outline, pill.header)).toBe(false);
});

test('the pill opens a drawer and a heading click closes it again', async ({ page }) => {
  await open(page, 1000);
  await page.getByRole('button', { name: 'Expand document outline' }).click();
  await expect.poll(async () => (await layout(page)).outline.collapsed).toBe('false');

  await page.getByRole('button', { name: 'Section two' }).click();
  await expect.poll(async () => (await layout(page)).outline.collapsed).toBe('true');
});

test('in Document appearance the outline is a 12px-radius card with a mono label', async ({ page }) => {
  await open(page, 1300);
  const card = await page.evaluate(async () => {
    await document.fonts.load('400 12px "JetBrains Mono Variable"');
    const outline = document.querySelector('.markami-outline');
    const label = document.querySelector('.markami-outline > button');
    if (outline === null || label === null) throw new Error('missing outline');
    const labelStyle = getComputedStyle(label);
    return {
      radius: getComputedStyle(outline).borderTopLeftRadius,
      family: labelStyle.fontFamily, size: labelStyle.fontSize, spacing: parseFloat(labelStyle.letterSpacing)
    };
  });

  expect(card.radius).toBe('12px');
  expect(card.family.startsWith('"JetBrains Mono Variable"')).toBe(true);
  expect(card.size).toBe('12px');
  expect(card.spacing).toBeGreaterThan(0.5);
});
