import type { ResourceResponse } from '../../../protocol/resourceMessages.js';
import type { VsCodeTransport } from '../../bridge/hostBridge.js';

type Pending = (message: ResourceResponse) => void;

export class ResourceClient {
  private sequence = 0;
  private readonly pending = new Map<string, Pending>();

  public constructor(
    private readonly transport: VsCodeTransport,
    private readonly navigateFragment: (fragment: string) => void
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
    const resolve = this.pending.get(message.requestId);
    if (resolve === undefined) return false;
    this.pending.delete(message.requestId);
    resolve(message);
    return true;
  }

  private request(action: 'pickImage'): Promise<ResourceResponse>;
  private request(action: 'resolveImage' | 'openLink', rawPath: string): Promise<ResourceResponse>;
  private request(action: 'pickImage' | 'resolveImage' | 'openLink', rawPath?: string): Promise<ResourceResponse> {
    const requestId = `resource-${String(++this.sequence)}`;
    const response = new Promise<ResourceResponse>((resolve) => this.pending.set(requestId, resolve));
    this.transport.postMessage(rawPath === undefined
      ? { type: 'resourceRequest', requestId, action }
      : { type: 'resourceRequest', requestId, action, rawPath });
    return response;
  }
}
