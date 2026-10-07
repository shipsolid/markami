import { StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { findLinks } from './links.js';

export const linkProjectionField = StateField.define<DecorationSet>({
  create(state) {
    return linkDecorations(state.doc.toString(), state.selection.main.from, state.selection.main.to);
  },
  update(_value, transaction) {
    return linkDecorations(
      transaction.state.doc.toString(),
      transaction.state.selection.main.from,
      transaction.state.selection.main.to
    );
  },
  provide: (field) => EditorView.decorations.from(field)
});

function linkDecorations(source: string, selectionFrom: number, selectionTo: number): DecorationSet {
  const ranges = findLinks(source).flatMap((link) => {
    const active = selectionFrom <= link.to && selectionTo >= link.from;
    const label = Decoration.mark({ class: 'markami-link', attributes: { 'data-destination': link.destination } })
      .range(link.labelRange.from, link.labelRange.to);
    if (active) return [label];
    return [
      Decoration.replace({}).range(link.from, link.labelRange.from),
      label,
      Decoration.replace({}).range(link.labelRange.to, link.to)
    ];
  });
  return Decoration.set(ranges, true);
}
