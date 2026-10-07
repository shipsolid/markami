import type { SourceRange } from '../../core/markdown/syntax.js';

export function shouldRevealSyntax(construct: SourceRange, selection: SourceRange): boolean {
  return selection.from <= construct.to && selection.to >= construct.from;
}
