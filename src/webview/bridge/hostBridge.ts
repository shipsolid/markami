import type { HostMessage, PatchRequest } from '../../protocol/messages.js';
import { PROTOCOL_VERSION } from '../../protocol/version.js';
import { PatchQueue } from './patchQueue.js';

export interface VsCodeTransport {
  postMessage(message: unknown): void;
}

export type ExternalChangeDisposition = 'applied' | 'ignored' | 'conflict';

export interface HostMessageDisposition {
  readonly externalChange?: ExternalChangeDisposition;
  readonly rejectionMatched?: boolean;
  readonly restoredDraft?: string;
}

export interface DraftStateStorage {
  getState(): unknown;
  setState(state: unknown): void;
}

interface DraftPublication {
  readonly revision: number;
  readonly viewId: string;
  readonly generation: number;
  readonly baseVersion: number;
  readonly draftText: string;
}

interface StoredWebviewDraft {
  readonly draftText: string;
  readonly baseVersion: number;
}

export class HostBridge {
  public queue: PatchQueue | undefined;
  private draftRevision = 0;
  private draftInFlight: DraftPublication | undefined;
  private latestDraft: DraftPublication | undefined;
  private resolveRecoveryOnHydrate = false;
  private invalidHostStateRecoveryRequested = false;

  public constructor(
    private readonly transport: VsCodeTransport,
    private readonly onMessage?: (
      message: HostMessage,
      ownedOrigin: boolean,
      disposition: HostMessageDisposition
    ) => void,
    private readonly stateStorage?: DraftStateStorage
  ) {}

  public ready(): void {
    this.transport.postMessage({ type: 'ready', protocolVersion: PROTOCOL_VERSION });
  }

  public requestSnapshotRecovery(): void {
    if (this.invalidHostStateRecoveryRequested) return;
    this.invalidHostStateRecoveryRequested = true;
    this.transport.postMessage({ type: 'requestSnapshot' });
  }

  public handle(message: HostMessage): void {
    let ownedOrigin = false;
    let externalChange: ExternalChangeDisposition | undefined;
    let rejectionMatched: boolean | undefined;
    let restoredDraft: string | undefined;
    if (message.type === 'hydrate') {
      if (!isCurrentProtocol(message.protocolVersion)) return;
      this.invalidHostStateRecoveryRequested = false;
      this.queue?.dispose();
      this.draftRevision = 0;
      this.draftInFlight = undefined;
      this.latestDraft = undefined;
      this.queue = new PatchQueue(
        message.viewId,
        message.generation,
        message.document.text,
        message.document.version,
        (request: PatchRequest) => this.transport.postMessage({ type: 'applyPatch', request }),
        (draftText, baseVersion) => this.publishDraft(
          message.viewId, message.generation, baseVersion, draftText
        )
      );
      if (this.resolveRecoveryOnHydrate) {
        this.resolveRecoveryOnHydrate = false;
        this.clearLocalDraftState();
      } else {
        const stored = readStoredDraft(this.stateStorage?.getState());
        if (stored !== undefined) {
          if (stored.draftText === message.document.text) {
            this.clearLocalDraftState();
          } else {
            restoredDraft = stored.draftText;
            this.publishDraft(message.viewId, message.generation, message.document.version, stored.draftText);
          }
        }
      }
    } else if (message.type === 'patchAccepted') {
      const matched = this.queue?.accept(message.requestId, message.version) ?? false;
      if (matched && this.queue?.state === 'synced') this.clearLocalDraftState();
    } else if (message.type === 'patchRejected') {
      rejectionMatched = this.queue?.reject(
        message.requestId, message.document.text, message.document.version, message.reason
      ) ?? false;
    } else if (message.type === 'draftStored') {
      if (this.draftInFlight?.viewId === message.viewId &&
        this.draftInFlight.generation === message.generation &&
        this.draftInFlight.revision === message.revision) {
        this.draftInFlight = undefined;
        this.flushLatestDraft();
      }
    } else if (message.type === 'documentChanged') {
      ownedOrigin = message.originRequestId !== undefined && (this.queue?.ownsRequest(message.originRequestId) ?? false);
      if (!ownedOrigin) {
        try {
          externalChange = this.queue?.applyExternal(
            message.changes, message.beforeVersion, message.version
          ) ?? 'ignored';
        } catch (error: unknown) {
          if (!(error instanceof RangeError)) throw error;
          externalChange = 'conflict';
          this.requestSnapshotRecovery();
        }
      }
    }
    this.onMessage?.(message, ownedOrigin, {
      ...(externalChange === undefined ? {} : { externalChange }),
      ...(rejectionMatched === undefined ? {} : { rejectionMatched }),
      ...(restoredDraft === undefined ? {} : { restoredDraft })
    });
  }

  public resolveRecoveryWithNextHydrate(): void {
    this.resolveRecoveryOnHydrate = true;
  }

  public cancelRecoveryResolution(): void {
    this.resolveRecoveryOnHydrate = false;
  }

  public clearLocalDraftState(): void {
    this.stateStorage?.setState(undefined);
  }

  private publishDraft(viewId: string, generation: number, baseVersion: number, draftText: string): void {
    this.draftRevision += 1;
    this.latestDraft = { revision: this.draftRevision, viewId, generation, baseVersion, draftText };
    this.stateStorage?.setState({ draftText, baseVersion } satisfies StoredWebviewDraft);
    this.flushLatestDraft();
  }

  private flushLatestDraft(): void {
    if (this.draftInFlight !== undefined || this.latestDraft === undefined) return;
    this.draftInFlight = this.latestDraft;
    this.latestDraft = undefined;
    this.transport.postMessage({ type: 'storeDraft', ...this.draftInFlight });
  }
}

function readStoredDraft(value: unknown): StoredWebviewDraft | undefined {
  if (typeof value !== 'object' || value === null || !('draftText' in value) || !('baseVersion' in value)) {
    return undefined;
  }
  const candidate = value as { readonly draftText?: unknown; readonly baseVersion?: unknown };
  if (typeof candidate.draftText !== 'string' ||
    typeof candidate.baseVersion !== 'number' || !Number.isInteger(candidate.baseVersion)) {
    return undefined;
  }
  return { draftText: candidate.draftText, baseVersion: candidate.baseVersion };
}

export function shouldApplyExternalChange(
  disposition: ExternalChangeDisposition | undefined,
  ownedOrigin: boolean
): boolean {
  return !ownedOrigin && disposition === 'applied';
}

function isCurrentProtocol(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
