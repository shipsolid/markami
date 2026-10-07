import { applyPatchSet, validatePatchSet, type TextPatch } from '../core/source/PatchSet.js';
import type { HostMessage, PatchRequest } from '../protocol/messages.js';
import { PROTOCOL_VERSION } from '../protocol/version.js';

export type DocumentApplyResult =
  | { readonly ok: true; readonly version: number; readonly text: string }
  | { readonly ok: false; readonly reason: string; readonly version: number; readonly text: string };

export interface CanonicalDocument {
  readonly uri: string;
  readonly version: number;
  getText(): string;
  apply(baseVersion: number, patches: readonly TextPatch[]): Promise<DocumentApplyResult>;
}

export interface WebviewEndpoint {
  readonly id: string;
  postMessage(message: HostMessage): PromiseLike<boolean>;
}

export class DocumentSession {
  public readonly uri: string;
  public isApplying = false;

  private readonly views = new Map<string, WebviewEndpoint>();
  private readonly processed = new Map<string, HostMessage>();
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(private readonly document: CanonicalDocument) {
    this.uri = document.uri;
  }

  public attach(view: WebviewEndpoint): void {
    this.assertActive();
    this.views.set(view.id, view);
  }

  public detach(viewId: string): void {
    this.views.delete(viewId);
  }

  public enqueuePatch(request: PatchRequest): Promise<void> {
    this.queue = this.queue.then(() => this.processPatch(request));
    return this.queue;
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

  public sendSnapshot(viewId: string): void {
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
      }
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.views.clear();
    this.processed.clear();
  }

  private async processPatch(request: PatchRequest): Promise<void> {
    this.assertActive();
    const view = this.views.get(request.viewId);
    if (view === undefined) {
      return;
    }
    const replay = this.processed.get(request.requestId);
    if (replay !== undefined) {
      await view.postMessage(replay);
      return;
    }
    if (request.baseVersion !== this.document.version) {
      await this.reject(view, request.requestId, 'stale version');
      return;
    }
    const source = this.document.getText();
    const validation = validatePatchSet(source, request.patches);
    if (!validation.ok) {
      await this.reject(view, request.requestId, validation.reason);
      return;
    }
    const expected = applyPatchSet(source, request.patches);
    this.isApplying = true;
    let result: DocumentApplyResult;
    try {
      result = await this.document.apply(request.baseVersion, request.patches);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown apply failure';
      await this.reject(view, request.requestId, `apply failed: ${message}`);
      return;
    } finally {
      this.isApplying = false;
    }
    if (!result.ok) {
      await this.reject(view, request.requestId, result.reason);
      return;
    }
    if (result.text !== expected) {
      await this.reject(view, request.requestId, 'canonical result mismatch');
      return;
    }
    this.handleDocumentChanged(request.baseVersion, result.version, request.patches, request.requestId);
    const accepted: HostMessage = { type: 'patchAccepted', requestId: request.requestId, version: result.version };
    this.remember(request.requestId, accepted);
    await view.postMessage(accepted);
  }

  private async reject(view: WebviewEndpoint, requestId: string, reason: string): Promise<void> {
    const rejected: HostMessage = {
      type: 'patchRejected',
      requestId,
      reason,
      document: { text: this.document.getText(), version: this.document.version }
    };
    this.remember(requestId, rejected);
    await view.postMessage(rejected);
  }

  private remember(requestId: string, response: HostMessage): void {
    this.processed.set(requestId, response);
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
