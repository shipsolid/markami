import { randomBytes, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { createTextPatch } from '../core/source/Patch.js';
import { webviewMessageSchema } from '../protocol/schemas.js';
import { PROTOCOL_VERSION } from '../protocol/version.js';
import type { DocumentSessionRegistry } from './DocumentSessionRegistry.js';

export class MarkamiProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markami.editor';

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessions: DocumentSessionRegistry
  ) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return Promise.resolve();
    }

    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot]
    };
    panel.webview.html = this.renderHtml(panel.webview, webviewRoot);
    const viewId = randomUUID();
    const session = this.sessions.get(document);
    session.attach({ id: viewId, postMessage: (message) => panel.webview.postMessage(message) });

    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const parsed = webviewMessageSchema.safeParse(message);
      if (!parsed.success || token.isCancellationRequested) {
        return;
      }
      if (parsed.data.type === 'ready' && parsed.data.protocolVersion === PROTOCOL_VERSION) {
        session.sendSnapshot(viewId);
      } else if (parsed.data.type === 'requestSnapshot') {
        session.sendSnapshot(viewId);
      } else if (parsed.data.type === 'applyPatch') {
        await session.enqueuePatch({
          ...parsed.data.request,
          patches: parsed.data.request.patches.map((patch) => createTextPatch(patch.from, patch.to, patch.insert))
        });
      }
    });
    panel.onDidDispose(() => {
      messages.dispose();
      session.detach(viewId);
    });
    return Promise.resolve();
  }

  private renderHtml(webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.js'));

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>markami</title>
</head>
<body>
  <main id="editor" aria-label="Markdown document"></main>
  <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }
}
