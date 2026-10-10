import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ORIGIN = 'http://webview.test';
const root = process.cwd();
const distribution = path.join(root, 'dist', 'webview');
const fixture = readFileSync(path.join(root, 'fixtures', 'marketplace', 'technical.md'), 'utf8');
const mime: Readonly<Record<string, string>> = {
  '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function pageHtml(): string {
  const hydrate = JSON.stringify({
    type: 'hydrate', protocolVersion: 3, viewId: 'view', generation: 1,
    document: { text: fixture, version: 1, eol: '\n' },
    viewPreferences: {
      schemaVersion: 1,
      rememberPerFile: true,
      effective: { appearance: 'document', width: 'readable', maxContentWidth: 960, syntaxReveal: 'activeBlock', outlineCollapsed: false }
    }
  });
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<link rel="stylesheet" href="/assets/main.css"><title>markami</title></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px"><main id="editor"></main>
<script>
  window.acquireVsCodeApi = () => ({
    postMessage(message) { if (message.type === 'ready') setTimeout(() => window.postMessage(${hydrate}, '*'), 0); },
    getState() { return undefined; },
    setState() {}
  });
</script>
<script type="module" src="/main.js"></script></body></html>`;
}

test('production webview renders technical Markdown from packaged assets only', async ({ page }) => {
  expect(existsSync(path.join(distribution, 'main.js')), 'run npm run build before the browser visual test').toBe(true);
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      external.push(url.href);
      await route.abort();
      return;
    }
    if (url.pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: pageHtml() });
      return;
    }
    const file = path.join(distribution, url.pathname);
    if (!file.startsWith(distribution) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    await route.fulfill({ contentType: mime[path.extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('.markami-mermaid svg g.node')).toHaveCount(3, { timeout: 30_000 });
  await expect(page.locator('.markami-math .katex').first()).toBeVisible();
  await expect(page.locator('.markami-code-line', { hasText: 'const patch' })).toBeVisible();

  // Mermaid's own stylesheet centres each label; losing it leaves labels starting at the node centre.
  const offsets = await page.evaluate(() => [...document.querySelectorAll('.markami-mermaid g.node')].map((node) => {
    const box = node.querySelector('rect')?.getBoundingClientRect();
    const texts = [...node.querySelectorAll('text')].map((text) => text.getBoundingClientRect());
    if (box === undefined || texts.length === 0) return { centred: false, inside: false };
    const left = Math.min(...texts.map((text) => text.left));
    const right = Math.max(...texts.map((text) => text.right));
    return {
      centred: Math.abs((left + right) / 2 - (box.left + box.right) / 2) <= 1,
      inside: left >= box.left - 1 && right <= box.right + 1
    };
  }));
  expect(offsets).toEqual([
    { centred: true, inside: true }, { centred: true, inside: true }, { centred: true, inside: true }
  ]);
  expect(external).toEqual([]);
});
