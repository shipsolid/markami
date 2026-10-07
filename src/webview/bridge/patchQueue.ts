import { applyPatchSet, type TextPatch } from '../../core/source/PatchSet.js';
import type { PatchRequest } from '../../protocol/messages.js';
import type { SyncState } from './syncState.js';

interface PendingEdit {
  readonly requestId: string;
  readonly patches: readonly TextPatch[];
}

export class PatchQueue {
  public acknowledgedText: string;
  public optimisticText: string;
  public acknowledgedVersion: number;
  public state: SyncState = 'synced';
  public conflictReason: string | undefined;

  private readonly pending: PendingEdit[] = [];
  private inFlight: PendingEdit | undefined;
  private sequence = 0;

  public constructor(
    private readonly viewId: string,
    private readonly generation: number,
    initialText: string,
    initialVersion: number,
    private readonly send: (request: PatchRequest) => void
  ) {
    this.acknowledgedText = initialText;
    this.optimisticText = initialText;
    this.acknowledgedVersion = initialVersion;
  }

  public enqueueLocal(patches: readonly TextPatch[]): void {
    if (this.state === 'conflict' || this.state === 'disposed') {
      throw new Error(`cannot enqueue edits while ${this.state}`);
    }
    this.optimisticText = applyPatchSet(this.optimisticText, patches);
    this.sequence += 1;
    this.pending.push({ requestId: `${this.viewId}:${String(this.generation)}:${String(this.sequence)}`, patches });
    this.state = 'pending';
    this.pump();
  }

  public accept(requestId: string, version: number): void {
    if (this.inFlight?.requestId !== requestId) {
      return;
    }
    this.acknowledgedText = applyPatchSet(this.acknowledgedText, this.inFlight.patches);
    this.acknowledgedVersion = version;
    this.inFlight = undefined;
    this.conflictReason = undefined;
    this.state = this.pending.length === 0 ? 'synced' : 'pending';
    this.pump();
  }

  public reject(requestId: string, canonicalText: string, version: number, reason: string): void {
    if (this.inFlight?.requestId !== requestId) {
      return;
    }
    this.acknowledgedText = canonicalText;
    this.acknowledgedVersion = version;
    this.conflictReason = reason;
    this.state = 'conflict';
  }

  public ownsRequest(requestId: string): boolean {
    return this.inFlight?.requestId === requestId || this.pending.some((edit) => edit.requestId === requestId);
  }

  public applyExternal(patches: readonly TextPatch[], beforeVersion: number, version: number): void {
    if (beforeVersion !== this.acknowledgedVersion || this.inFlight !== undefined || this.pending.length > 0) {
      this.conflictReason = 'external change overlaps pending edits';
      this.state = 'conflict';
      return;
    }
    this.acknowledgedText = applyPatchSet(this.acknowledgedText, patches);
    this.optimisticText = this.acknowledgedText;
    this.acknowledgedVersion = version;
  }

  public dispose(): void {
    this.state = 'disposed';
    this.pending.length = 0;
    this.inFlight = undefined;
  }

  private pump(): void {
    if (this.inFlight !== undefined || this.state === 'conflict' || this.state === 'disposed') {
      return;
    }
    const next = this.pending.shift();
    if (next === undefined) {
      this.state = 'synced';
      return;
    }
    this.inFlight = next;
    this.send({
      requestId: next.requestId,
      viewId: this.viewId,
      generation: this.generation,
      baseVersion: this.acknowledgedVersion,
      patches: next.patches,
      draftText: this.optimisticText
    });
  }
}
