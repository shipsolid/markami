import { Facet, type EditorState } from '@codemirror/state';
import type { SourceRange } from '../../core/markdown/syntax.js';
import type { SyntaxRevealPolicy } from '../../protocol/viewPreferences.js';

export const syntaxRevealPolicy = Facet.define<SyntaxRevealPolicy, SyntaxRevealPolicy>({
  combine: (values) => values.at(-1) ?? 'activeBlock'
});

export function syntaxSelection(state: EditorState, expandActiveBlock = false): SourceRange {
  const policy = state.facet(syntaxRevealPolicy);
  const selection = state.selection.main;
  if (policy === 'manual') return { from: -1, to: -1 };
  if (policy === 'selection') return { from: selection.from, to: selection.to };
  if (expandActiveBlock) {
    const line = state.doc.lineAt(selection.head);
    return { from: line.from, to: line.to };
  }
  return { from: selection.from, to: selection.to };
}

export function shouldRevealSyntax(construct: SourceRange, selection: SourceRange): boolean {
  return selection.from <= construct.to && selection.to >= construct.from;
}
