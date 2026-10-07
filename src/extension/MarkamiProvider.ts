import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

type WebviewMessage = { readonly type: 'ready' };

export class MarkamiProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markami.editor';

  public constructor(private readonly extensionUri: vscode.Uri) {}

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

    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (this.isReadyMessage(message) && !token.isCancellationRequested) {
        await panel.webview.postMessage({
          type: 'snapshot',
          text: document.getText(),
          version: document.version
        });
      }
    });
    panel.onDidDispose(() => {
      messages.dispose();
    });
    return Promise.resolve();
  }

  private isReadyMessage(value: unknown): value is WebviewMessage {
    return typeof value === 'object' && value !== null && (value as Partial<WebviewMessage>).type === 'ready';
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
