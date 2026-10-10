import { expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ORIGIN = 'http://webview.test';
const root = process.cwd();
const distribution = path.join(root, 'dist', 'webview');
const mime: Readonly<Record<string, string>> = {
  '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

export interface WebviewTheme {
  readonly bodyClass: string;
  readonly tokens: Readonly<Record<string, string>>;
}

export function marketplaceFixture(name: string): string {
  return readFileSync(path.join(root, 'fixtures', 'marketplace', `${name}.md`), 'utf8');
}

function pageHtml(fixture: string, theme: WebviewTheme | undefined): string {
  const hydrate = JSON.stringify({
    type: 'hydrate', protocolVersion: 3, viewId: 'view', generation: 1,
    document: { text: fixture, version: 1, eol: '\n' },
    viewPreferences: {
      schemaVersion: 1,
      rememberPerFile: true,
      effective: { appearance: 'document', width: 'readable', maxContentWidth: 960, syntaxReveal: 'activeBlock', outlineCollapsed: false }
    }
  });
  const tokens = Object.entries(theme?.tokens ?? {}).map(([name, value]) => `${name}: ${value};`).join(' ');
  return `<!doctype html><html lang="en" style="${tokens}"><head><meta charset="UTF-8">
<link rel="stylesheet" href="/assets/main.css"><title>markami</title></head>
<body class="${theme?.bodyClass ?? ''}" style="color: var(--vscode-editor-foreground); font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px"><main id="editor"></main>
<script>
  window.acquireVsCodeApi = () => ({
    postMessage(message) { if (message.type === 'ready') setTimeout(() => window.postMessage(${hydrate}, '*'), 0); },
    getState() { return undefined; },
    setState() {}
  });
</script>
<script type="module" src="/main.js"></script></body></html>`;
}

/** Serves the built webview exactly as packaged and aborts every request that leaves the local origin. */
export async function openProductionWebview(
  page: Page,
  options: { readonly fixture: string; readonly theme?: WebviewTheme }
): Promise<{ readonly external: string[] }> {
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
      await route.fulfill({ contentType: 'text/html', body: pageHtml(options.fixture, options.theme) });
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
  return { external };
}
