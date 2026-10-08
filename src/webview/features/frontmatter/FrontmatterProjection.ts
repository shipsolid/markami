import { StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { findFrontmatter, type FrontmatterBlock, type SourceRange } from '../../../core/markdown/frontmatter.js';

export interface FrontmatterProjection extends FrontmatterBlock {
  readonly replaceSource: boolean;
}

export function buildFrontmatterProjection(source: string, selection: SourceRange): FrontmatterProjection | undefined {
  const block = findFrontmatter(source);
  return block === undefined
    ? undefined
    : { ...block, replaceSource: block.validity === 'valid' && !selectionTouches(block.content, selection) };
}

export const frontmatterProjectionField = StateField.define<DecorationSet>({
  create(state) {
    return decorationsFor(state.doc.toString(), state.selection.main.from, state.selection.main.to);
  },
  update(_value, transaction) {
    return decorationsFor(
      transaction.state.doc.toString(),
      transaction.state.selection.main.from,
      transaction.state.selection.main.to
    );
  },
  provide: (field) => EditorView.decorations.from(field)
});

function decorationsFor(source: string, selectionFrom: number, selectionTo: number): DecorationSet {
  const block = buildFrontmatterProjection(source, { from: selectionFrom, to: selectionTo });
  return block?.replaceSource === true
    ? Decoration.set([Decoration.replace({ widget: new FrontmatterWidget(block), block: true }).range(block.from, block.to)])
    : Decoration.none;
}

class FrontmatterWidget extends WidgetType {
  public constructor(private readonly block: FrontmatterProjection) {
    super();
  }

  public override eq(other: FrontmatterWidget): boolean {
    return other.block.source === this.block.source && other.block.from === this.block.from;
  }

  public override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('section');
    root.className = 'markami-frontmatter-summary';
    root.setAttribute('aria-label', 'Document metadata');
    const label = document.createElement('span');
    label.textContent = 'Metadata';
    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'markami-frontmatter-source';
    source.textContent = 'Source';
    source.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.block.from, head: this.block.to }, scrollIntoView: true });
      view.focus();
    });
    root.append(label, source);
    return root;
  }

  public override ignoreEvent(): boolean {
    return false;
  }
}

function selectionTouches(range: SourceRange, selection: SourceRange): boolean {
  if (selection.from === selection.to) return selection.from > range.from && selection.from < range.to;
  return range.from < selection.to && selection.from < range.to;
}
