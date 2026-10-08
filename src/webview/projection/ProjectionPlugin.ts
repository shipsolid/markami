import { StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { buildProjectionPlan } from '../../core/markdown/syntax.js';
import { buildDocumentSyntaxPlan } from '../features/html/HtmlProjection.js';
import { markClass } from './marks.js';
import { syntaxSelection } from './syntaxReveal.js';

export const projectionField = StateField.define<DecorationSet>({
  create(state) {
    const selection = syntaxSelection(state, true);
    return decorationsFor(state.doc.toString(), selection.from, selection.to, state);
  },
  update(_decorations, transaction) {
    const selection = syntaxSelection(transaction.state, true);
    return decorationsFor(
      transaction.state.doc.toString(),
      selection.from,
      selection.to,
      transaction.state
    );
  },
  provide: (field) => EditorView.decorations.from(field)
});

function decorationsFor(
  source: string,
  selectionFrom: number,
  selectionTo: number,
  state: { readonly doc: { lineAt(position: number): { readonly from: number } } }
): DecorationSet {
  const selection = { from: selectionFrom, to: selectionTo };
  const documentSyntax = buildDocumentSyntaxPlan(source, selection);
  const exclusions = [
    ...(documentSyntax.frontmatter === undefined
      ? []
      : [{ from: documentSyntax.frontmatter.from, to: documentSyntax.frontmatter.to, reason: 'frontmatter' }]),
    ...documentSyntax.html.map((html) => ({ from: html.from, to: html.to, reason: 'raw HTML' })),
    ...documentSyntax.sourceIslands
  ];
  const plan = buildProjectionPlan(source, { selection, sourceIslands: exclusions });
  const ranges = [
    ...plan.marks.map((mark) => Decoration.mark({ class: markClass(mark.kind) }).range(mark.from, mark.to)),
    ...plan.hiddenTokens.map((token) => Decoration.replace({}).range(token.from, token.to)),
    ...plan.lineStyles.map((line) => Decoration.line({ class: `markami-${line.kind}` }).range(state.doc.lineAt(line.from).from))
  ];
  return Decoration.set(ranges, true);
}
