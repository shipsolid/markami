import { applyPatchSet, validatePatchSet, type TextPatch } from '../core/source/PatchSet.js';
import type { HostMessage, PatchRequest } from '../protocol/messages.js';
import { PROTOCOL_VERSION } from '../protocol/version.js';
import { RecoveryStore, type RecoveryRecord } from './RecoveryStore.js';
import type { ViewPreferencesState } from '../protocol/viewPreferences.js';

export type DocumentApplyResult =
  | { readonly ok: true; readonly version: number; readonly text: string }
  | { readonly ok: false; readonly reason: string; readonly version: number; readonly text: string };

export interface CanonicalDocument {
  readonly uri: string;
  readonly version: number;
  getText(): string;
  apply(baseVersion: number, patches: readonly TextPatch[]): Promise<DocumentApplyResult>;
  save?(): Promise<boolean>;
}

export interface WebviewEndpoint {
  readonly id: string;
  postMessage(message: HostMessage): PromiseLike<boolean>;
}

interface ProcessedRequest {
  readonly fingerprint: string;
  readonly response: HostMessage;
}

export class DocumentSession {
  public readonly uri: string;
  public isApplying = false;

  private readonly views = new Map<string, WebviewEndpoint>();
  private readonly processed = new Map<string, ProcessedRequest>();
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(
    private readonly document: CanonicalDocument,
    private readonly recovery?: RecoveryStore
  ) {
    this.uri = document.uri;
  }

  public attach(view: WebviewEndpoint): void {
    this.assertActive();
    this.views.set(view.id, view);
  }

  public detach(viewId: string): void {
    this.views.delete(viewId);
  }

  public enqueuePatch(request: PatchRequest, senderViewId = request.viewId): Promise<void> {
    const processing = this.queue.then(() => this.processPatch(request, senderViewId));
    this.queue = processing.catch(() => undefined);
    return processing;
  }

  public flush(): Promise<void> {
    return this.queue;
  }

  public async save(): Promise<boolean> {
    await this.flush();
    return this.document.save?.() ?? false;
  }

  public handleDocumentChanged(
    beforeVersion: number,
    version: number,
    changes: readonly TextPatch[],
    originRequestId?: string
  ): void {
    const message: HostMessage = {
      type: 'documentChanged',
      beforeVersion,
      version,
      changes,
      ...(originRequestId === undefined ? {} : { originRequestId })
    };
    this.broadcast(message);
  }

  public sendSnapshot(viewId: string, viewPreferences: ViewPreferencesState): void {
    const view = this.views.get(viewId);
    if (view === undefined) {
      return;
    }
    void view.postMessage({
      type: 'hydrate',
      protocolVersion: PROTOCOL_VERSION,
      viewId,
      document: {
        text: this.document.getText(),
        version: this.document.version,
        eol: this.document.getText().includes('\r\n') ? '\r\n' : '\n'
      },
      viewPreferences
    });
  }

  public broadcastViewPreferences(viewPreferences: ViewPreferencesState): void {
    this.broadcast({ type: 'viewPreferencesChanged', viewPreferences });
  }

  public sendRecoveryNotice(viewId: string): void {
    const record = this.recoveredDraft();
    const view = this.views.get(viewId);
    if (record === undefined || view === undefined) return;
    void view.postMessage({
      type: 'recoveryAvailable',
      baseMatches: record.canonicalBaseHash === RecoveryStore.hashCanonical(this.document.getText()),
      timestamp: record.timestamp
    });
  }

  public recoveredDraft(): RecoveryRecord | undefined {
    return this.recovery?.get(this.uri);
  }

  public clearRecoveredDraft(): Promise<void> {
    return this.recovery?.clear(this.uri) ?? Promise.resolve();
  }

  public dispose(): void {
    this.disposed = true;
    this.views.clear();
    this.processed.clear();
  }

  private async processPatch(request: PatchRequest, senderViewId: string): Promise<void> {
    this.assertActive();
    const view = this.views.get(senderViewId);
    if (view === undefined) {
      return;
    }
    if (request.viewId !== senderViewId) {
      await this.reject(view, request.requestId, 'request view does not match sender');
      return;
    }
    const identity = requestIdentity(request);
    const fingerprint = requestFingerprint(request);
    const replay = this.processed.get(identity);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) {
        await this.reject(view, request.requestId, 'request id reused with different payload');
        return;
      }
      await view.postMessage(replay.response);
      return;
    }
    if (request.baseVersion !== this.document.version) {
      await this.reject(view, request.requestId, 'stale version', identity, fingerprint);
      return;
    }
    const source = this.document.getText();
    const validation = validatePatchSet(source, request.patches);
    if (!validation.ok) {
      await this.reject(view, request.requestId, validation.reason, identity, fingerprint);
      return;
    }
    const expected = applyPatchSet(source, request.patches);
    if (request.draftText !== undefined && this.recovery !== undefined) {
      const stored = await this.recovery.put({
        uri: this.uri,
        baseVersion: request.baseVersion,
        canonicalBaseHash: RecoveryStore.hashCanonical(source),
        draftText: request.draftText,
        timestamp: Date.now()
      });
      if (!stored.ok) {
        this.broadcast({
          type: 'showError',
          code: 'RECOVERY_CAPACITY',
          message: 'The pending draft is too large for recovery storage. Copy it before closing.'
        });
      }
    }
    this.isApplying = true;
    let result: DocumentApplyResult;
    try {
      result = await this.document.apply(request.baseVersion, request.patches);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown apply failure';
      await this.reject(view, request.requestId, `apply failed: ${message}`, identity, fingerprint);
      return;
    } finally {
      this.isApplying = false;
    }
    if (!result.ok) {
      await this.reject(view, request.requestId, result.reason, identity, fingerprint);
      return;
    }
    if (result.text !== expected) {
      await this.reject(view, request.requestId, 'canonical result mismatch', identity, fingerprint);
      return;
    }
    this.handleDocumentChanged(request.baseVersion, result.version, request.patches, request.requestId);
    const accepted: HostMessage = { type: 'patchAccepted', requestId: request.requestId, version: result.version };
    this.remember(identity, fingerprint, accepted);
    await view.postMessage(accepted);
    await this.recovery?.clear(this.uri);
  }

  private async reject(
    view: WebviewEndpoint,
    requestId: string,
    reason: string,
    identity?: string,
    fingerprint?: string
  ): Promise<void> {
    const rejected: HostMessage = {
      type: 'patchRejected',
      requestId,
      reason,
      document: { text: this.document.getText(), version: this.document.version }
    };
    if (identity !== undefined && fingerprint !== undefined) {
      this.remember(identity, fingerprint, rejected);
    }
    await view.postMessage(rejected);
  }

  private remember(identity: string, fingerprint: string, response: HostMessage): void {
    this.processed.set(identity, { fingerprint, response });
    if (this.processed.size > 256) {
      const oldest = this.processed.keys().next().value;
      if (oldest !== undefined) {
        this.processed.delete(oldest);
      }
    }
  }

  private broadcast(message: HostMessage): void {
    for (const view of this.views.values()) {
      void view.postMessage(message);
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('document session is disposed');
    }
  }
}

function requestIdentity(request: PatchRequest): string {
  return `${request.viewId}\u0000${String(request.generation)}\u0000${request.requestId}`;
}

function requestFingerprint(request: PatchRequest): string {
  return JSON.stringify({
    baseVersion: request.baseVersion,
    patches: request.patches,
    ...(request.draftText === undefined ? {} : { draftText: request.draftText })
  });
}
