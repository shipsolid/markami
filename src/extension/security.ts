export type RemoteResourcePolicy = 'block' | 'prompt' | 'allow';

const BLOCKED_SCHEMES = new Set(['command:', 'data:', 'file:', 'javascript:', 'vbscript:']);

export function webviewContentSecurityPolicy(
  cspSource: string,
  remotePolicy: RemoteResourcePolicy,
  nonce: string
): string {
  const remoteImages = remotePolicy === 'block' ? '' : ' https:';
  return `default-src 'none'; img-src ${cspSource} data:${remoteImages}; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource} 'nonce-${nonce}';`;
}

export function classifyResourceScheme(rawPath: string):
  | { readonly kind: 'relative' }
  | { readonly kind: 'remote'; readonly url: URL }
  | { readonly kind: 'blocked' } {
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(rawPath)?.[1]?.toLocaleLowerCase();
  if (scheme === undefined) {
    return { kind: 'relative' };
  }
  if (BLOCKED_SCHEMES.has(`${scheme}:`)) {
    return { kind: 'blocked' };
  }
  if (scheme !== 'http' && scheme !== 'https') {
    return { kind: 'blocked' };
  }
  try {
    return { kind: 'remote', url: new URL(rawPath) };
  } catch {
    return { kind: 'blocked' };
  }
}
