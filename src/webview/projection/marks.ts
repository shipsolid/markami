import type { MarkDecoration } from '../../core/markdown/syntax.js';

export function markClass(kind: MarkDecoration['kind']): string {
  return `markami-${kind}`;
}
