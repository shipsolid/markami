import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import { createTextPatch } from '../core/source/Patch.js';
import { webviewMessageSchema } from '../protocol/schemas.js';
import { PROTOCOL_VERSION } from '../protocol/version.js';
import type { DocumentSessionRegistry } from './DocumentSessionRegistry.js';
import type { HistoryRouter } from './history.js';
import { ResourceService, resolveResource } from './resources.js';
import { webviewContentSecurityPolicy, type RemoteResourcePolicy } from './security.js';
import type { ResourceRequest, ResourceResponse } from '../protocol/resourceMessages.js';
import type { EffectiveViewPreferences, ViewPreferencesState } from '../protocol/viewPreferences.js';
import { resolveViewPreferences, type ViewPreferencesStore } from './ViewPreferencesStore.js';
import type { DocumentSession } from './DocumentSession.js';
import { readRemoteImagePolicy, readWebviewConfiguration } from './configuration.js';
import { ActiveViewTracker, type ActiveViewLease } from './ActiveViewTracker.js';
import { isProtocolTextWithinLimit, MAX_PROTOCOL_TEXT_BYTES } from '../protocol/limits.js';

interface OpenPreferenceSession {
  readonly session: DocumentSession;
  uri: string;
}

export class MarkamiProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markami.editor';
  private readonly activeView = new ActiveViewTracker<vscode.WebviewPanel>();
  private readonly openPreferenceSessions = new Map<string, OpenPreferenceSession>();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessions: DocumentSessionRegistry,
    private readonly history: HistoryRouter,
    private readonly viewPreferences: ViewPreferencesStore
  ) {}

  public executeAction(actionId: string, value?: string, lease?: ActiveViewLease): Thenable<boolean> {
    const panel = this.activeView.current;
    if (panel === undefined || (lease !== undefined && !this.activeView.isCurrent(lease))) {
      return Promise.resolve(false);
    }
    return panel.webview.postMessage({
      type: 'executeAction',
      actionId,
      ...(value === undefined ? {} : { value })
    });
  }

  public captureActiveView(): ActiveViewLease | undefined {
    return this.activeView.capture();
  }

  public async renameViewPreferences(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    const oldKey = oldUri.toString();
    const newKey = newUri.toString();
    await this.viewPreferences.rename(oldKey, newKey);
    const sessions = new Set<DocumentSession>();
    for (const entry of this.openPreferenceSessions.values()) {
      if (!sameOrDescendantUri(entry.uri, oldKey)) continue;
      entry.uri = migrateUri(entry.uri, oldKey, newKey);
      sessions.add(entry.session);
    }
    for (const session of sessions) {
      const uri = [...this.openPreferenceSessions.values()].find((entry) => entry.session === session)?.uri ?? newKey;
      session.broadcastViewPreferences(await this.preferenceState(uri));
    }
  }

  public inspectViewPreferences(uri: string): Promise<ViewPreferencesState> {
    return this.preferenceState(uri);
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return;
    }
    if (!isProtocolTextWithinLimit(document.getText())) {
      await this.openSourceFallback(document, panel);
      return;
    }

    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const resourceRoots = this.resourceRoots(document);
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot, ...resourceRoots.map((root) => vscode.Uri.file(root))]
    };
    panel.webview.html = this.renderHtml(document, panel.webview, webviewRoot);
    if (panel.active) {
      this.activeView.activate(panel);
    }
    const viewId = randomUUID();
    let remotePolicy = this.remoteImagePolicy(document);
    let pendingPolicyReload: string | undefined;
    let hydrated = false;
    let fallingBack = false;
    const session = this.sessions.get(document);
    session.attach({
      id: viewId,
      postMessage: (message) => panel.webview.postMessage(message),
      fallbackToSource: () => {
        if (fallingBack) return;
        fallingBack = true;
        void this.openSourceFallback(document, panel);
      }
    });
    this.openPreferenceSessions.set(viewId, { session, uri: document.uri.toString() });
    const preferenceUri = (): string => this.openPreferenceSessions.get(viewId)?.uri ?? document.uri.toString();
    this.history.register(viewId, document.uri);

    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const parsed = webviewMessageSchema.safeParse(message);
      if (!parsed.success || token.isCancellationRequested) {
        return;
      }
      if (parsed.data.type === 'ready' && parsed.data.protocolVersion === PROTOCOL_VERSION) {
        if (hydrated) session.rotateGeneration(viewId);
        hydrated = true;
        session.sendSnapshot(viewId, await this.preferenceState(preferenceUri()));
        await this.sendConfiguration(vscode.Uri.parse(preferenceUri(), true), panel.webview);
        session.sendRecoveryNotice(viewId);
      } else if (parsed.data.type === 'ready') {
        await panel.webview.postMessage({
          type: 'showError',
          code: 'PROTOCOL_MISMATCH',
          message: 'The markami editor was updated. Reopen this tab to continue.'
        });
      } else if (parsed.data.type === 'requestSnapshot') {
        session.rotateGeneration(viewId);
        session.sendSnapshot(viewId, await this.preferenceState(preferenceUri()));
      } else if (parsed.data.type === 'requestSourceFallback') {
        if (!fallingBack) {
          fallingBack = true;
          await this.openSourceFallback(document, panel);
        }
      } else if (parsed.data.type === 'applyPatch') {
        await session.enqueuePatch({
          requestId: parsed.data.request.requestId,
          viewId: parsed.data.request.viewId,
          generation: parsed.data.request.generation,
          baseVersion: parsed.data.request.baseVersion,
          patches: parsed.data.request.patches.map((patch) => createTextPatch(patch.from, patch.to, patch.insert)),
          ...(parsed.data.request.draftText === undefined ? {} : { draftText: parsed.data.request.draftText })
        }, viewId);
      } else if (parsed.data.type === 'storeDraft') {
        await session.storeDraft(
          viewId,
          parsed.data.generation,
          parsed.data.revision,
          parsed.data.baseVersion,
          parsed.data.draftText
        );
        await panel.webview.postMessage({
          type: 'draftStored',
          viewId,
          generation: parsed.data.generation,
          revision: parsed.data.revision
        });
      } else if (parsed.data.type === 'save') {
        let saved = false;
        if (document.isUntitled) {
          await session.flush();
          const untitledUri = preferenceUri();
          const sessionOverrides = await this.viewPreferences.get(untitledUri);
          const savedUri = await vscode.workspace.saveAs(document.uri);
          if (savedUri !== undefined) {
            await this.renameViewPreferences(vscode.Uri.parse(untitledUri, true), savedUri);
            await this.viewPreferences.promoteSessionOverrides(savedUri.toString(), sessionOverrides);
            await this.broadcastPreferences(savedUri.toString(), session);
            saved = true;
          }
        } else {
          saved = await session.save();
        }
        if (!saved) {
          await panel.webview.postMessage({ type: 'showError', code: 'SAVE_FAILED', message: 'VS Code could not save this document.' });
        }
      } else if (parsed.data.type === 'history') {
        await session.flush();
        await this.history.requestHistoryAction(viewId, parsed.data.action);
      } else if (parsed.data.type === 'recoveryChoice') {
        const recovered = session.recoveredDraft();
        const draftText = parsed.data.draftText ?? recovered?.draftText;
        if (parsed.data.choice === 'inspect') {
          if (draftText === undefined) return;
          const draft = await vscode.workspace.openTextDocument({ content: draftText, language: 'markdown' });
          await vscode.commands.executeCommand(
            'vscode.diff',
            document.uri,
            draft.uri,
            `${path.basename(document.uri.path)} ↔ recovered markami draft`
          );
        } else if (parsed.data.choice === 'copy') {
          if (draftText === undefined) return;
          await vscode.env.clipboard.writeText(draftText);
          void vscode.window.showInformationMessage('Copied the recovered markami draft to the clipboard.');
        } else if (parsed.data.choice === 'reload') {
          if (parsed.data.draftText !== undefined) {
            const retained = await session.retainRecoveredDraft(
              viewId,
              session.currentGeneration(viewId) ?? 0,
              document.version,
              parsed.data.draftText
            );
            if (!retained) {
              await panel.webview.postMessage({
                type: 'showError',
                code: 'RECOVERY_STORAGE',
                message: 'Copy or inspect the local draft before reloading because recovery storage is unavailable.'
              });
              return;
            }
          }
          session.rotateGeneration(viewId);
          session.sendSnapshot(viewId, await this.preferenceState(preferenceUri()));
        } else {
          await session.clearRecoveredDraft(viewId);
          session.rotateGeneration(viewId);
          session.sendSnapshot(viewId, await this.preferenceState(preferenceUri()));
        }
      } else if (parsed.data.type === 'resourceRequest') {
        await this.handleResourceRequest(document, panel.webview, parsed.data);
      } else if (parsed.data.type === 'policyReloadReady' && parsed.data.requestId === pendingPolicyReload) {
        pendingPolicyReload = undefined;
        panel.webview.html = this.renderHtml(document, panel.webview, webviewRoot);
      } else if (parsed.data.type === 'updateViewPreferences') {
        await this.viewPreferences.update(preferenceUri(), parsed.data.changes);
        await this.broadcastPreferences(preferenceUri(), session);
      } else if (parsed.data.type === 'resetFileViewPreferences') {
        await this.viewPreferences.resetFile(preferenceUri());
        await this.broadcastPreferences(preferenceUri(), session);
      } else if (parsed.data.type === 'resetWorkspaceViewPreferences') {
        await this.viewPreferences.resetWorkspace();
        await this.broadcastAllPreferences();
      }
    });
    const viewState = panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.activeView.activate(event.webviewPanel);
      } else {
        this.activeView.deactivate(event.webviewPanel);
      }
    });
    const configurationChanges = vscode.workspace.onDidChangeConfiguration((event) => {
      const resource = vscode.Uri.parse(preferenceUri(), true);
      if (event.affectsConfiguration('markami', resource)) {
        const nextRemotePolicy = this.remoteImagePolicy(document);
        if (nextRemotePolicy !== remotePolicy) {
          remotePolicy = nextRemotePolicy;
          pendingPolicyReload = randomUUID();
          void panel.webview.postMessage({ type: 'preparePolicyReload', requestId: pendingPolicyReload });
        } else {
          void this.sendConfiguration(resource, panel.webview);
        }
        void this.broadcastPreferences(preferenceUri(), session);
      }
    });
    panel.onDidDispose(() => {
      messages.dispose();
      viewState.dispose();
      configurationChanges.dispose();
      this.activeView.deactivate(panel);
      session.detach(viewId);
      this.openPreferenceSessions.delete(viewId);
      this.history.unregister(viewId);
    });
    return;
  }

  private async handleResourceRequest(
    document: vscode.TextDocument,
    webview: vscode.Webview,
    request: ResourceRequest
  ): Promise<void> {
    try {
      if (document.uri.scheme !== 'file') {
        await this.postResourceError(webview, request, 'Resource operations are unavailable for non-file workspaces');
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

  private async openSourceFallback(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = { enableScripts: false, localResourceRoots: [] };
    panel.webview.html = this.renderOversizedDocumentHtml(panel.webview);
    void vscode.window.showWarningMessage(
      `markami supports rendered documents up to ${String(MAX_PROTOCOL_TEXT_BYTES / (1024 * 1024))} MiB. Opening this file in the source editor without truncation.`
    );
    await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', panel.viewColumn);
    panel.dispose();
  }

  private resourceRoots(document: vscode.TextDocument): readonly string[] {
    const roots = vscode.workspace.workspaceFolders
      ?.filter((folder) => folder.uri.scheme === 'file')
      .map((folder) => folder.uri.fsPath) ?? [];
    if (roots.length > 0) return roots;
    return document.uri.scheme === 'file' ? [path.dirname(document.uri.fsPath)] : [];
  }

  private remoteImagePolicy(document: vscode.TextDocument): RemoteResourcePolicy {
    return readRemoteImagePolicy(vscode.workspace.getConfiguration('markami', document.uri));
  }

  private sendConfiguration(resource: vscode.Uri, webview: vscode.Webview): Thenable<boolean> {
    const configuration = vscode.workspace.getConfiguration('markami', resource);
    return webview.postMessage({
      type: 'configuration',
      ...readWebviewConfiguration(configuration)
    });
  }

  private async preferenceState(uri: string): Promise<ViewPreferencesState> {
    const resource = vscode.Uri.parse(uri, true);
    const overrides = await this.viewPreferences.get(uri);
    return {
      schemaVersion: 1,
      rememberPerFile: this.rememberPerFile(),
      effective: resolveViewPreferences(this.preferenceDefaults(resource), overrides)
    };
  }

  private async broadcastPreferences(uri: string, session: DocumentSession): Promise<void> {
    session.broadcastViewPreferences(await this.preferenceState(uri));
  }

  private async broadcastAllPreferences(): Promise<void> {
    const unique = new Map<DocumentSession, string>();
    for (const { session, uri } of this.openPreferenceSessions.values()) unique.set(session, uri);
    await Promise.all([...unique].map(([session, uri]) => this.broadcastPreferences(uri, session)));
  }

  private preferenceDefaults(resource: vscode.Uri): EffectiveViewPreferences {
    const configuration = vscode.workspace.getConfiguration('markami', resource);
    const configuredAppearance = configuration.get<unknown>('appearance.mode');
    const configuredWidth = configuration.get<unknown>('document.width');
    const configuredMaximum = configuration.get<unknown>('document.maxContentWidth');
    const configuredReveal = configuration.get<unknown>('syntaxReveal');
    return {
      appearance: configuredAppearance === 'document' || configuredAppearance === 'vscode'
        ? configuredAppearance
        : 'vscode',
      width: configuredWidth === 'readable' || configuredWidth === 'full' || configuredWidth === 'auto'
        ? configuredWidth
        : 'auto',
      maxContentWidth: typeof configuredMaximum === 'number' && Number.isInteger(configuredMaximum) &&
        configuredMaximum >= 480 && configuredMaximum <= 2400
        ? configuredMaximum
        : 960,
      syntaxReveal: configuredReveal === 'selection' || configuredReveal === 'manual' || configuredReveal === 'activeBlock'
        ? configuredReveal
        : 'activeBlock',
      outlineCollapsed: false
    };
  }

  private rememberPerFile(): boolean {
    return vscode.workspace.getConfiguration('markami').get<boolean>('viewPreferences.rememberPerFile', true);
  }

  private renderHtml(document: vscode.TextDocument, webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const nonce = randomBytes(18).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'main.css'));
    const csp = webviewContentSecurityPolicy(webview.cspSource, this.remoteImagePolicy(document), nonce);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri.toString()}">
  <title>markami</title>
</head>
<body>
  <main id="editor" aria-label="Markdown document"></main>
  <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }

  private renderOversizedDocumentHtml(webview: vscode.Webview): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>markami source fallback</title>
</head>
<body><p>This document exceeds markami's 4 MiB rendered-editor limit. It is opening in VS Code's source editor without truncation.</p></body>
</html>`;
  }
}

function sameOrDescendantUri(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith('/') ? root : `${root}/`);
}

function migrateUri(candidate: string, oldRoot: string, newRoot: string): string {
  return candidate === oldRoot ? newRoot : `${newRoot}${candidate.slice(oldRoot.length)}`;
}
