import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import { createTextPatch } from '../core/source/Patch.js';
import { webviewMessageSchema } from '../protocol/schemas.js';
import { PROTOCOL_VERSION } from '../protocol/version.js';
import type { DocumentSessionRegistry } from './DocumentSessionRegistry.js';
import type { HistoryRouter } from './history.js';
import { ResourceService, resolveResource } from './resources.js';
import type { RemoteResourcePolicy } from './security.js';
import type { ResourceRequest, ResourceResponse } from '../protocol/resourceMessages.js';

export class MarkamiProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markami.editor';
  private activePanel: vscode.WebviewPanel | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessions: DocumentSessionRegistry,
    private readonly history: HistoryRouter
  ) {}

  public executeAction(actionId: string, value?: string): Thenable<boolean> {
    if (this.activePanel === undefined) {
      return Promise.resolve(false);
    }
    return this.activePanel.webview.postMessage({
      type: 'executeAction',
      actionId,
      ...(value === undefined ? {} : { value })
    });
  }

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return Promise.resolve();
    }

    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const resourceRoots = this.resourceRoots(document);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot, ...resourceRoots.map((root) => vscode.Uri.file(root))]
    };
    panel.webview.html = this.renderHtml(document, panel.webview, webviewRoot);
    if (panel.active) {
      this.activePanel = panel;
    }
    const viewId = randomUUID();
    let remotePolicy = this.remoteImagePolicy(document);
    let pendingPolicyReload: string | undefined;
    const session = this.sessions.get(document);
    session.attach({ id: viewId, postMessage: (message) => panel.webview.postMessage(message) });
    this.history.register(viewId, document.uri);

    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const parsed = webviewMessageSchema.safeParse(message);
      if (!parsed.success || token.isCancellationRequested) {
        return;
      }
      if (parsed.data.type === 'ready' && parsed.data.protocolVersion === PROTOCOL_VERSION) {
        session.sendSnapshot(viewId);
        await this.sendConfiguration(document, panel.webview);
      } else if (parsed.data.type === 'requestSnapshot') {
        session.sendSnapshot(viewId);
      } else if (parsed.data.type === 'applyPatch') {
        await session.enqueuePatch({
          requestId: parsed.data.request.requestId,
          viewId: parsed.data.request.viewId,
          generation: parsed.data.request.generation,
          baseVersion: parsed.data.request.baseVersion,
          patches: parsed.data.request.patches.map((patch) => createTextPatch(patch.from, patch.to, patch.insert)),
          ...(parsed.data.request.draftText === undefined ? {} : { draftText: parsed.data.request.draftText })
        });
      } else if (parsed.data.type === 'save') {
        if (!(await session.save())) {
          await panel.webview.postMessage({ type: 'showError', code: 'SAVE_FAILED', message: 'VS Code could not save this document.' });
        }
      } else if (parsed.data.type === 'history') {
        await session.flush();
        await this.history.requestHistoryAction(viewId, parsed.data.action);
      } else if (parsed.data.type === 'resourceRequest') {
        await this.handleResourceRequest(document, panel.webview, parsed.data);
      } else if (parsed.data.type === 'policyReloadReady' && parsed.data.requestId === pendingPolicyReload) {
        pendingPolicyReload = undefined;
        panel.webview.html = this.renderHtml(document, panel.webview, webviewRoot);
      }
    });
    const viewState = panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.activePanel = event.webviewPanel;
      }
    });
    const configurationChanges = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('markami', document.uri)) {
        const nextRemotePolicy = this.remoteImagePolicy(document);
        if (nextRemotePolicy !== remotePolicy) {
          remotePolicy = nextRemotePolicy;
          pendingPolicyReload = randomUUID();
          void panel.webview.postMessage({ type: 'preparePolicyReload', requestId: pendingPolicyReload });
        } else {
          void this.sendConfiguration(document, panel.webview);
        }
      }
    });
    panel.onDidDispose(() => {
      messages.dispose();
      viewState.dispose();
      configurationChanges.dispose();
      if (this.activePanel === panel) {
        this.activePanel = undefined;
      }
      session.detach(viewId);
      this.history.unregister(viewId);
    });
    return Promise.resolve();
  }

  private async handleResourceRequest(
    document: vscode.TextDocument,
    webview: vscode.Webview,
    request: ResourceRequest
  ): Promise<void> {
    try {
      if (document.uri.scheme !== 'file') {
        await this.postResourceError(webview, request, 'Resource operations for remote workspaces require Task 16 URI support');
        return;
      }
      if (request.action === 'pickImage') {
        const service = new ResourceService({
          workspaceRoots: this.resourceRoots(document),
          trusted: vscode.workspace.isTrusted,
          pickFile: async () => {
            const selected = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              canSelectMany: false,
              filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
              title: 'Insert existing image'
            });
            return selected?.[0]?.fsPath;
          }
        });
        const markdown = await service.pickImage(document.uri.fsPath);
        await webview.postMessage({
          type: 'resourceResult', requestId: request.requestId, action: request.action, ok: true,
          ...(markdown === undefined ? {} : { markdown })
        } satisfies ResourceResponse);
        return;
      }

      const policy = request.action === 'resolveImage'
        ? this.remoteImagePolicy(document)
        : 'allow';
      const result = await resolveResource(document.uri.fsPath, request.rawPath, this.resourceRoots(document), policy);
      if (!result.ok) {
        await this.postResourceError(webview, request, result.reason);
        return;
      }
      if (request.action === 'resolveImage') {
        if (result.kind === 'fragment') {
          await this.postResourceError(webview, request, 'image path cannot be a document fragment');
          return;
        }
        if (result.kind === 'remote' && result.requiresConfirmation) {
          const answer = await vscode.window.showWarningMessage(
            `Load remote image from ${new URL(result.url).hostname}?`,
            { modal: true },
            'Load once'
          );
          if (answer !== 'Load once') {
            await this.postResourceError(webview, request, 'remote image load was cancelled');
            return;
          }
        }
        const uri = result.kind === 'localFile'
          ? webview.asWebviewUri(vscode.Uri.file(result.path)).toString()
          : result.url;
        await webview.postMessage({
          type: 'resourceResult', requestId: request.requestId, action: request.action, ok: true, uri
        } satisfies ResourceResponse);
        return;
      }

      if (result.kind === 'fragment') {
        await webview.postMessage({
          type: 'resourceResult', requestId: request.requestId, action: request.action, ok: true, fragment: result.fragment
        } satisfies ResourceResponse);
        return;
      }
      if (result.kind === 'remote') {
        await vscode.env.openExternal(vscode.Uri.parse(result.url, true));
      } else if (path.resolve(result.path) === path.resolve(document.uri.fsPath) && result.fragment !== undefined) {
        await webview.postMessage({
          type: 'resourceResult', requestId: request.requestId, action: request.action, ok: true, fragment: result.fragment
        } satisfies ResourceResponse);
        return;
      } else {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.path));
      }
      await webview.postMessage({
        type: 'resourceResult', requestId: request.requestId, action: request.action, ok: true
      } satisfies ResourceResponse);
    } catch (error) {
      await this.postResourceError(webview, request, error instanceof Error ? error.message : 'resource operation failed');
    }
  }

  private postResourceError(webview: vscode.Webview, request: ResourceRequest, reason: string): Thenable<boolean> {
    return webview.postMessage({
      type: 'resourceResult', requestId: request.requestId, action: request.action, ok: false, reason
    } satisfies ResourceResponse);
  }

  private resourceRoots(document: vscode.TextDocument): readonly string[] {
    const roots = vscode.workspace.workspaceFolders
      ?.filter((folder) => folder.uri.scheme === 'file')
      .map((folder) => folder.uri.fsPath) ?? [];
    if (roots.length > 0) return roots;
    return document.uri.scheme === 'file' ? [path.dirname(document.uri.fsPath)] : [];
  }

  private remoteImagePolicy(document: vscode.TextDocument): RemoteResourcePolicy {
    return vscode.workspace.getConfiguration('markami', document.uri)
      .get<RemoteResourcePolicy>('remoteImages', 'block');
  }

  private sendConfiguration(document: vscode.TextDocument, webview: vscode.Webview): Thenable<boolean> {
    const configuration = vscode.workspace.getConfiguration('markami', document.uri);
    const configuredAppearance = configuration.get<unknown>('appearance.mode');
    const appearance = configuredAppearance === 'document' || configuredAppearance === 'vscode'
      ? configuredAppearance
      : 'vscode';
    const configuredWidth = configuration.get<unknown>('document.width');
    const width = configuredWidth === 'readable' || configuredWidth === 'full' || configuredWidth === 'auto'
      ? configuredWidth
      : 'auto';
    const configuredMaximum = configuration.get<unknown>('document.maxContentWidth');
    const maxContentWidth = typeof configuredMaximum === 'number' && Number.isInteger(configuredMaximum) &&
      configuredMaximum >= 480 && configuredMaximum <= 2400
      ? configuredMaximum
      : 960;
    const configuredEditorFont = configuration.get<unknown>('theme.useEditorFont');
    return webview.postMessage({
      type: 'configuration',
      selectionToolbarEnabled: configuration.get<boolean>('selectionToolbar.enabled', true),
      slashCommandsEnabled: configuration.get<boolean>('slashCommands.enabled', true),
      mathEnabled: configuration.get<boolean>('renderMath', true),
      blockHandlesEnabled: configuration.get<boolean>('blockHandles.enabled', true),
      renderMermaid: configuration.get<boolean>('renderMermaid', true),
      codeBlockWrap: configuration.get<boolean>('codeBlock.wrap', false),
      appearance,
      width,
      maxContentWidth,
      useEditorFont: typeof configuredEditorFont === 'boolean' ? configuredEditorFont : true
    });
  }

  private renderHtml(document: vscode.TextDocument, webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'main.css'));

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:${this.remoteImagePolicy(document) === 'block' ? '' : ' https:'}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri.toString()}">
  <title>markami</title>
</head>
<body>
  <main id="editor" aria-label="Markdown document"></main>
  <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }
}
