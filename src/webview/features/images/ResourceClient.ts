import type { ResourceRequest, ResourceResponse } from '../../../protocol/resourceMessages.js';
import type { VsCodeTransport } from '../../bridge/hostBridge.js';

interface Pending {
  readonly action: ResourceRequest['action'];
  readonly resolve: (message: ResourceResponse) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class ResourceClient {
  private sequence = 0;
  private readonly pending = new Map<string, Pending>();

  public constructor(
    private readonly transport: VsCodeTransport,
    private readonly navigateFragment: (fragment: string) => void,
    private readonly timeoutMs = 30_000
  ) {}

  public pickImage(): Promise<string | undefined> {
    return this.request('pickImage').then((response) => response.ok && response.action === 'pickImage'
      ? response.markdown
      : undefined);
  }

  public resolveImage(rawPath: string): Promise<string | undefined> {
    return this.request('resolveImage', rawPath).then((response) => response.ok && response.action === 'resolveImage'
      ? response.uri
      : undefined);
  }

  public async openLink(rawPath: string): Promise<boolean> {
    const response = await this.request('openLink', rawPath);
    if (!response.ok || response.action !== 'openLink') return false;
    if (response.fragment !== undefined) this.navigateFragment(response.fragment);
    return true;
  }

  public handle(message: ResourceResponse): boolean {
    const pending = this.pending.get(message.requestId);
    if (pending === undefined || pending.action !== message.action) return false;
    this.pending.delete(message.requestId);
    clearTimeout(pending.timer);
    pending.resolve(message);
    return true;
  }

  public dispose(): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({
        type: 'resourceResult', requestId, action: pending.action, ok: false, reason: 'resource client disposed'
      });
    }
    this.pending.clear();
  }

  private request(action: 'pickImage'): Promise<ResourceResponse>;
  private request(action: 'resolveImage' | 'openLink', rawPath: string): Promise<ResourceResponse>;
  private request(action: 'pickImage' | 'resolveImage' | 'openLink', rawPath?: string): Promise<ResourceResponse> {
    const requestId = `resource-${String(++this.sequence)}`;
    const response = new Promise<ResourceResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ type: 'resourceResult', requestId, action, ok: false, reason: 'resource request timed out' });
      }, this.timeoutMs);
      this.pending.set(requestId, { action, resolve, timer });
    });
    this.transport.postMessage(rawPath === undefined
      ? { type: 'resourceRequest', requestId, action }
      : { type: 'resourceRequest', requestId, action, rawPath });
    return response;
  }
}
