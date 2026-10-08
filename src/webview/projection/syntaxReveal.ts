import { Facet, StateEffect, StateField, type EditorState } from '@codemirror/state';
import type { SourceRange } from '../../core/markdown/syntax.js';
import type { SyntaxRevealPolicy } from '../../protocol/viewPreferences.js';

export const syntaxRevealPolicy = Facet.define<SyntaxRevealPolicy, SyntaxRevealPolicy>({
  combine: (values) => values.at(-1) ?? 'activeBlock'
});

export const setManualSyntaxReveal = StateEffect.define<SourceRange | undefined>();

export const manualSyntaxReveal = StateField.define<SourceRange | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setManualSyntaxReveal)) return effect.value;
    }
    if (!transaction.docChanged || value === undefined) return value;
    return {
      from: transaction.changes.mapPos(value.from, -1),
      to: transaction.changes.mapPos(value.to, 1)
    };
  }
});

export function syntaxSelection(state: EditorState, expandActiveBlock = false): SourceRange {
  const manual = state.field(manualSyntaxReveal, false);
  if (manual !== undefined) return manual;
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
