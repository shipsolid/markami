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

/** VS Code Dark+ values for the tokens the webview reads, with a distinctive editor font so assertions can recognise it. */
export const DARK_PLUS: WebviewTheme = {
  bodyClass: 'vscode-dark',
  tokens: {
    '--vscode-editor-background': '#1e1e1e', '--vscode-editor-foreground': '#d4d4d4', '--vscode-editorGutter-background': '#1e1e1e',
    '--vscode-editorLineNumber-foreground': '#858585', '--vscode-button-secondaryBackground': '#3a3d41',
    '--vscode-button-secondaryForeground': '#ffffff', '--vscode-button-secondaryHoverBackground': '#45494e',
    '--vscode-widget-border': '#303031', '--vscode-editorWidget-background': '#252526', '--vscode-editorWidget-border': '#454545',
    '--vscode-editorWidget-foreground': '#cccccc', '--vscode-textCodeBlock-background': '#0a0a0a',
    '--vscode-textSeparator-foreground': '#3c3c3c', '--vscode-textBlockQuote-border': '#007acc',
    '--vscode-textLink-foreground': '#3794ff', '--vscode-descriptionForeground': '#9d9d9d', '--vscode-focusBorder': '#007fd4',
    '--vscode-list-activeSelectionBackground': '#04395e', '--vscode-list-activeSelectionForeground': '#ffffff',
    '--vscode-dropdown-background': '#3c3c3c', '--vscode-dropdown-foreground': '#f0f0f0', '--vscode-dropdown-border': '#3c3c3c',
    '--vscode-editor-font-family': "'Courier New', monospace", '--vscode-font-family': 'sans-serif', '--vscode-font-size': '13px'
  }
};

export type WebviewAppearance = 'vscode' | 'document';

export type WebviewPalette = 'catppuccin-mocha' | 'vscode';

function pageHtml(
  fixture: string,
  theme: WebviewTheme | undefined,
  appearance: WebviewAppearance,
  width: string,
  palette: WebviewPalette
): string {
  // The host sends its settings right after hydrating; specs pin the palette to the theme unless they test it.
  const configuration = JSON.stringify({
    type: 'configuration', selectionToolbarEnabled: true, slashCommandsEnabled: true, mathEnabled: true,
    blockHandlesEnabled: true, outlineEnabled: true, renderMermaid: true, renderSafeHtml: true,
    showSourceIslandLabels: true, debugShowSourceRanges: false, codeBlockWrap: true, codeBlockLineNumbers: true, useEditorFont: false,
    documentPalette: palette
  });
  const hydrate = JSON.stringify({
    type: 'hydrate', protocolVersion: 3, viewId: 'view', generation: 1,
    document: { text: fixture, version: 1, eol: '\n' },
    viewPreferences: {
      schemaVersion: 1,
      rememberPerFile: true,
      effective: { appearance, width, maxContentWidth: 1200, syntaxReveal: 'activeBlock', outlineCollapsed: false }
    }
  });
  const tokens = Object.entries(theme?.tokens ?? {}).map(([name, value]) => `${name}: ${value};`).join(' ');
  return `<!doctype html><html lang="en" style="${tokens}"><head><meta charset="UTF-8">
<link rel="stylesheet" href="/assets/main.css"><title>markami</title></head>
<body class="${theme?.bodyClass ?? ''}" style="color: var(--vscode-editor-foreground); font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px"><main id="editor"></main>
<script>
  window.acquireVsCodeApi = () => ({
    postMessage(message) { if (message.type === 'ready') setTimeout(() => { window.postMessage(${hydrate}, '*'); window.postMessage(${configuration}, '*'); }, 0); },
    getState() { return undefined; },
    setState() {}
  });
</script>
<script type="module" src="/main.js"></script></body></html>`;
}

/** Serves the built webview exactly as packaged and aborts every request that leaves the local origin. */
export async function openProductionWebview(
  page: Page,
  options: { readonly fixture: string; readonly theme?: WebviewTheme; readonly appearance?: WebviewAppearance; readonly width?: 'auto' | 'readable' | 'full'; readonly palette?: WebviewPalette }
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
      await route.fulfill({ contentType: 'text/html', body: pageHtml(options.fixture, options.theme, options.appearance ?? 'document', options.width ?? 'readable', options.palette ?? 'vscode') });
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
