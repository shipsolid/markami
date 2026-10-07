import type { HostMessage, PatchRequest } from '../../protocol/messages.js';
import { PROTOCOL_VERSION } from '../../protocol/version.js';
import { PatchQueue } from './patchQueue.js';

export interface VsCodeTransport {
  postMessage(message: unknown): void;
}

export class HostBridge {
  public queue: PatchQueue | undefined;

  public constructor(
    private readonly transport: VsCodeTransport,
    private readonly onMessage?: (message: HostMessage, ownedOrigin: boolean) => void
  ) {}

  public ready(): void {
    this.transport.postMessage({ type: 'ready', protocolVersion: PROTOCOL_VERSION });
  }

  public handle(message: HostMessage): void {
    let ownedOrigin = false;
    if (message.type === 'hydrate') {
      this.queue?.dispose();
      this.queue = new PatchQueue(
        message.viewId,
        1,
        message.document.text,
        message.document.version,
        (request: PatchRequest) => this.transport.postMessage({ type: 'applyPatch', request })
      );
    } else if (message.type === 'patchAccepted') {
      this.queue?.accept(message.requestId, message.version);
    } else if (message.type === 'patchRejected') {
      this.queue?.reject(message.requestId, message.document.text, message.document.version, message.reason);
    } else if (message.type === 'documentChanged') {
      ownedOrigin = message.originRequestId !== undefined && (this.queue?.ownsRequest(message.originRequestId) ?? false);
      if (!ownedOrigin) {
        this.queue?.applyExternal(message.changes, message.beforeVersion, message.version);
      }
    }
    this.onMessage?.(message, ownedOrigin);
  }
}
