export type RenderResult = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly error: string };
export type MermaidRender = (source: string, id: string) => Promise<string>;

export class LocalMermaidRenderer {
  private readonly cache = new Map<string, RenderResult>();

  public constructor(
    private readonly renderSvg: MermaidRender = defaultMermaidRender,
    private readonly maxEntries = 32
  ) {}

  public async render(source: string): Promise<RenderResult> {
    const key = hash(source);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    let result: RenderResult;
    try {
      result = { ok: true, svg: await this.renderSvg(source, `markami-${key}`) };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : 'Mermaid rendering failed' };
    }
    this.cache.set(key, result);
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return result;
  }

  public clear(): void {
    this.cache.clear();
  }
}

export class DebouncedMermaidRenderer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sequence = 0;

  public constructor(private readonly renderer: LocalMermaidRenderer, private readonly delayMs = 200) {}

  public schedule(source: string, receive: (result: RenderResult) => void): void {
    this.sequence += 1;
    const sequence = this.sequence;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.renderer.render(source).then((result) => {
        if (sequence === this.sequence) receive(result);
      });
    }, this.delayMs);
  }

  public dispose(): void {
    this.sequence += 1;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

async function defaultMermaidRender(source: string, id: string): Promise<string> {
  const module = await import('mermaid');
  module.default.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    suppressErrorRendering: true
  });
  const result = await module.default.render(id, source);
  return result.svg;
}

function hash(source: string): string {
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}
