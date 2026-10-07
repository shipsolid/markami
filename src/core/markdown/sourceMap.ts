import type { SourceRange } from './syntax.js';

export interface SourceMappedNode extends SourceRange {
  readonly id: string;
  readonly kind: string;
}

export function sourceNodeId(kind: string, range: SourceRange): string {
  return `${kind}:${String(range.from)}:${String(range.to)}`;
}
