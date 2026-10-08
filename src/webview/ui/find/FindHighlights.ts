import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { FindMatch } from './DocumentFind.js';

export interface FindHighlightUpdate {
  readonly matches: readonly FindMatch[];
  readonly activeIndex: number;
}

export const setFindHighlights = StateEffect.define<FindHighlightUpdate>();

export const findHighlightState = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    const update = transaction.effects.find((effect) => effect.is(setFindHighlights))?.value;
    if (update !== undefined) {
      return Decoration.set(update.matches.flatMap((match, index) =>
        (match.segments ?? [match]).map((range) => Decoration.mark({
          class: index === update.activeIndex ? 'markami-find-match markami-find-match-active' : 'markami-find-match'
        }).range(range.from, range.to))), true);
    }
    return transaction.docChanged ? value.map(transaction.changes) : value;
  },
  provide: (field) => EditorView.decorations.from(field)
});

export const findHighlights = findHighlightState;
