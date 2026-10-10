import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { buildProjectionPlan, type LineStyle, type ListMarker } from '../../core/markdown/syntax.js';
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
    ...plan.revealedTokens.map((token) => Decoration.mark({ class: 'markami-syntax-marker' }).range(token.from, token.to)),
    ...plan.listMarkers.map(listMarkerDecoration),
    ...plan.lineStyles.map((line) => Decoration.line({ class: lineClass(line) }).range(state.doc.lineAt(line.from).from))
  ];
  return Decoration.set(ranges, true);
}

function lineClass(line: LineStyle): string {
  if (line.kind !== 'list') return `markami-${line.kind}`;
  return `markami-list markami-list-level-${String(line.level ?? 0)}${line.task === true ? ' markami-list-task' : ''}`;
}

const BULLETS = ['•', '◦', '▪'] as const;

function listMarkerDecoration(marker: ListMarker): ReturnType<ReturnType<typeof Decoration.replace>['range']> {
  if (marker.kind === 'number') return Decoration.mark({ class: 'markami-list-number' }).range(marker.from, marker.to);
  const glyph = marker.kind === 'task' ? '' : (BULLETS[Math.min(marker.level, BULLETS.length - 1)] ?? '•');
  return Decoration.replace({ widget: new ListMarkerWidget(glyph) }).range(marker.from, marker.to);
}

/** A rendered stand-in for a list marker; the source text is untouched and returns when the item is edited. */
class ListMarkerWidget extends WidgetType {
  public constructor(private readonly glyph: string) {
    super();
  }

  public override eq(other: ListMarkerWidget): boolean {
    return other.glyph === this.glyph;
  }

  public override toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = this.glyph === '' ? 'markami-task-marker' : 'markami-bullet';
    marker.textContent = this.glyph;
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
}
