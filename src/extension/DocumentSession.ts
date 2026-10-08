import { createHash } from 'node:crypto';
import { applyPatchSet, validatePatchSet, type TextPatch } from '../core/source/PatchSet.js';
import type { HostMessage, PatchRequest } from '../protocol/messages.js';
import { PROTOCOL_VERSION } from '../protocol/version.js';
import { isProtocolTextWithinLimit } from '../protocol/limits.js';
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
  fallbackToSource?(): void;
}

interface ProcessedRequest {
  readonly fingerprint: string;
  readonly response:
    | { readonly type: 'patchAccepted'; readonly requestId: string; readonly version: number }
    | { readonly type: 'patchRejected'; readonly requestId: string; readonly reason: string };
}

interface AttachedView {
  readonly endpoint: WebviewEndpoint;
  generation: number;
}

interface ExpectedApply {
  readonly beforeVersion: number;
  readonly patches: readonly TextPatch[];
}

interface ActiveDraft {
  readonly viewId: string;
  readonly generation: number;
  readonly revision: number;
  readonly baseVersion: number;
  readonly draftText: string;
  readonly order: number;
}

export class DocumentSession {
  public readonly uri: string;
  public isApplying = false;

  private readonly views = new Map<string, AttachedView>();
  private readonly processed = new Map<string, ProcessedRequest>();
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private oversized = false;
  private expectedApply: ExpectedApply | undefined;
  private protectedRecovery: RecoveryRecord | undefined;
  private readonly activeDrafts = new Map<string, ActiveDraft>();
  private draftOrder = 0;

  public constructor(
    private readonly document: CanonicalDocument,
    private readonly recovery?: RecoveryStore
  ) {
    this.uri = document.uri;
    this.protectedRecovery = recovery?.get(this.uri);
  }

  public attach(view: WebviewEndpoint): void {
    this.assertActive();
    this.views.set(view.id, { endpoint: view, generation: 1 });
  }

  public detach(viewId: string): void {
    this.views.delete(viewId);
  }

  public enqueuePatch(request: PatchRequest, senderViewId = request.viewId): Promise<void> {
    const processing = this.queue.then(() => this.processPatch(request, senderViewId));
    this.queue = processing.catch(() => undefined);
    return processing;
  }

  public rotateGeneration(viewId: string): number {
    const view = this.views.get(viewId);
    if (view === undefined) throw new Error('unknown webview');
    view.generation += 1;
    return view.generation;
  }

  public currentGeneration(viewId: string): number | undefined {
    return this.views.get(viewId)?.generation;
  }

  public storeDraft(
    viewId: string,
    generation: number,
    revision: number,
    baseVersion: number,
    draftText: string
  ): Promise<void> {
    const view = this.views.get(viewId);
    if (view === undefined || view.generation !== generation) return Promise.resolve();
    const draft = this.recordActiveDraft(viewId, generation, revision, baseVersion, draftText);
    return this.persistDraft(draft.baseVersion, draft.draftText).then(() => undefined);
  }

  public async retainRecoveredDraft(
    viewId: string,
    generation: number,
    baseVersion: number,
    draftText: string
  ): Promise<boolean> {
    const view = this.views.get(viewId);
    if (view === undefined || view.generation !== generation || this.recovery === undefined) return false;
    if (this.protectedRecovery !== undefined) {
      return this.protectedRecovery.draftText === draftText;
    }
    const stored = await this.persistDraft(baseVersion, draftText, true);
    if (!stored) return false;
    this.protectedRecovery = this.recovery.get(this.uri);
    return this.protectedRecovery !== undefined;
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
    if (!this.ensureOutboundWithinLimit()) return;
    const message: HostMessage = {
      type: 'documentChanged',
      beforeVersion,
      version,
      changes,
      ...(originRequestId === undefined ? {} : { originRequestId })
    };
    this.broadcast(message);
  }

  public handleCanonicalDocumentChanged(
    beforeVersion: number,
    version: number,
    changes: readonly TextPatch[]
  ): void {
    if (this.expectedApply !== undefined &&
      this.expectedApply.beforeVersion === beforeVersion &&
      samePatches(this.expectedApply.patches, changes)) {
      return;
    }
    this.handleDocumentChanged(beforeVersion, version, changes);
  }

  public sendSnapshot(viewId: string, viewPreferences: ViewPreferencesState): void {
    const attached = this.views.get(viewId);
    if (attached === undefined || !this.ensureOutboundWithinLimit()) {
      return;
    }
    void attached.endpoint.postMessage({
      type: 'hydrate',
      protocolVersion: PROTOCOL_VERSION,
      viewId,
      generation: attached.generation,
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
    const view = this.views.get(viewId)?.endpoint;
    if (record === undefined || view === undefined) return;
    void view.postMessage({
      type: 'recoveryAvailable',
      baseMatches: record.canonicalBaseHash === RecoveryStore.hashCanonical(this.document.getText()),
      timestamp: record.timestamp
    });
  }

  public recoveredDraft(): RecoveryRecord | undefined {
    if (this.protectedRecovery !== undefined) return this.protectedRecovery;
    const active = this.latestActiveDraft();
    if (active !== undefined) {
      return {
        uri: this.uri,
        baseVersion: active.baseVersion,
        canonicalBaseHash: RecoveryStore.hashCanonical(this.document.getText()),
        draftText: active.draftText,
        timestamp: active.order
      };
    }
    const recovered = this.recovery?.get(this.uri);
    if (recovered !== undefined) this.protectedRecovery = recovered;
    return recovered;
  }

  public async clearRecoveredDraft(viewId?: string): Promise<void> {
    if (viewId === undefined) {
      this.activeDrafts.clear();
    } else {
      for (const [key, draft] of this.activeDrafts) {
        if (draft.viewId === viewId) this.activeDrafts.delete(key);
      }
    }
    await this.recovery?.clear(this.uri);
    this.protectedRecovery = undefined;
    const remaining = this.latestActiveDraft();
    if (remaining !== undefined) await this.persistDraft(remaining.baseVersion, remaining.draftText);
  }

  public dispose(): void {
    this.disposed = true;
    this.views.clear();
    this.processed.clear();
    this.activeDrafts.clear();
  }

  private async processPatch(request: PatchRequest, senderViewId: string): Promise<void> {
    this.assertActive();
    const attached = this.views.get(senderViewId);
    if (attached === undefined) {
      return;
    }
    const view = attached.endpoint;
    if (request.viewId !== senderViewId) {
      await this.reject(view, request.requestId, 'request view does not match sender');
      return;
    }
    if (request.generation !== attached.generation) {
      await this.reject(view, request.requestId, 'stale webview generation');
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
      if (replay.response.type === 'patchAccepted') {
        await view.postMessage(replay.response);
      } else {
        await this.reject(view, replay.response.requestId, replay.response.reason);
      }
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
    if (request.draftText !== undefined && this.recovery?.get(this.uri) === undefined) {
      const draft = this.recordActiveDraft(
        senderViewId, request.generation, 0, request.baseVersion, request.draftText
      );
      await this.persistDraft(draft.baseVersion, draft.draftText);
    }
    this.isApplying = true;
    this.expectedApply = { beforeVersion: request.baseVersion, patches: request.patches };
    let result: DocumentApplyResult;
    try {
      result = await this.document.apply(request.baseVersion, request.patches);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown apply failure';
      await this.reject(view, request.requestId, `apply failed: ${message}`, identity, fingerprint);
      return;
    } finally {
      this.isApplying = false;
      this.expectedApply = undefined;
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
    const accepted = { type: 'patchAccepted', requestId: request.requestId, version: result.version } as const;
    this.remember(identity, fingerprint, accepted);
    await view.postMessage(accepted);
    await this.reconcileAcceptedDraft(senderViewId, request.generation, result.text);
  }

  private async reject(
    view: WebviewEndpoint,
    requestId: string,
    reason: string,
    identity?: string,
    fingerprint?: string
  ): Promise<void> {
    if (!this.ensureOutboundWithinLimit()) return;
    const rejected: HostMessage = {
      type: 'patchRejected',
      requestId,
      reason,
      document: { text: this.document.getText(), version: this.document.version }
    };
    if (identity !== undefined && fingerprint !== undefined) {
      this.remember(identity, fingerprint, { type: 'patchRejected', requestId, reason });
    }
    await view.postMessage(rejected);
  }

  private remember(identity: string, fingerprint: string, response: ProcessedRequest['response']): void {
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
      void view.endpoint.postMessage(message);
    }
  }

  private async persistDraft(baseVersion: number, draftText: string, replaceProtected = false): Promise<boolean> {
    if (this.recovery === undefined || (this.protectedRecovery !== undefined && !replaceProtected)) return true;
    try {
      const stored = await this.recovery.put({
        uri: this.uri,
        baseVersion,
        canonicalBaseHash: RecoveryStore.hashCanonical(this.document.getText()),
        draftText,
        timestamp: Date.now()
      });
      if (!stored.ok) {
        this.broadcast({
          type: 'showError',
          code: 'RECOVERY_CAPACITY',
          message: 'The pending draft is too large for recovery storage. Copy it before closing.'
        });
        return false;
      }
      return true;
    } catch {
      this.broadcast({
        type: 'showError',
        code: 'RECOVERY_STORAGE',
        message: 'The pending draft could not be stored for crash recovery. Copy it before closing.'
      });
      return false;
    }
  }

  private async reconcileAcceptedDraft(viewId: string, generation: number, canonicalText: string): Promise<void> {
    const key = draftIdentity(viewId, generation);
    if (this.activeDrafts.get(key)?.draftText === canonicalText) this.activeDrafts.delete(key);
    if (this.recovery === undefined || this.protectedRecovery !== undefined) return;
    const remaining = this.latestActiveDraft();
    if (remaining !== undefined) {
      await this.persistDraft(remaining.baseVersion, remaining.draftText);
      return;
    }
    await this.recovery.clearIfDraftEquals(this.uri, canonicalText);
  }

  private recordActiveDraft(
    viewId: string,
    generation: number,
    revision: number,
    baseVersion: number,
    draftText: string
  ): ActiveDraft {
    const key = draftIdentity(viewId, generation);
    const existing = this.activeDrafts.get(key);
    if (existing !== undefined && existing.revision >= revision) return existing;
    this.draftOrder += 1;
    const draft = { viewId, generation, revision, baseVersion, draftText, order: this.draftOrder };
    this.activeDrafts.set(key, draft);
    return draft;
  }

  private latestActiveDraft(): ActiveDraft | undefined {
    let latest: ActiveDraft | undefined;
    for (const draft of this.activeDrafts.values()) {
      if (latest === undefined || draft.order > latest.order) latest = draft;
    }
    return latest;
  }

  private ensureOutboundWithinLimit(): boolean {
    if (isProtocolTextWithinLimit(this.document.getText())) return true;
    if (!this.oversized) {
      this.oversized = true;
      for (const view of this.views.values()) view.endpoint.fallbackToSource?.();
    }
    return false;
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

function draftIdentity(viewId: string, generation: number): string {
  return `${viewId}\u0000${String(generation)}`;
}

function requestFingerprint(request: PatchRequest): string {
  const hash = createHash('sha256');
  hashField(hash, String(request.baseVersion));
  for (const patch of request.patches) {
    hashField(hash, String(patch.from));
    hashField(hash, String(patch.to));
    hashField(hash, patch.insert);
  }
  hashField(hash, request.draftText === undefined ? 'absent' : 'present');
  hashField(hash, request.draftText ?? '');
  return hash.digest('base64url');
}

function hashField(hash: ReturnType<typeof createHash>, value: string): void {
  hash.update(String(Buffer.byteLength(value, 'utf8'))).update(':').update(value, 'utf8').update(';');
}

function samePatches(left: readonly TextPatch[], right: readonly TextPatch[]): boolean {
  return left.length === right.length && left.every((patch, index) => {
    const other = right[index];
    return other !== undefined && patch.from === other.from && patch.to === other.to && patch.insert === other.insert;
  });
}
