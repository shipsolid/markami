import { StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { findFrontmatter } from '../../../core/markdown/frontmatter.js';
import {
  findRawHtmlRanges,
  findUnknownSyntaxRanges,
  type SourceIslandSpec,
  type SourceRange
} from '../../../core/markdown/syntax.js';
import { sanitizeRawHtml } from '../../security/sanitize.js';
import {
  buildFrontmatterProjection,
  frontmatterProjectionField,
  type FrontmatterProjection
} from '../frontmatter/FrontmatterProjection.js';
import { classifyRawHtml, type ClassifiedHtmlRange } from './html.js';
import { syntaxSelection } from '../../projection/syntaxReveal.js';

export interface HtmlProjection extends ClassifiedHtmlRange {
  readonly replaceSource: boolean;
}

export interface DocumentSyntaxPlan {
  readonly frontmatter?: FrontmatterProjection;
  readonly html: readonly HtmlProjection[];
  readonly sourceIslands: readonly SourceIslandSpec[];
}

export function documentSyntax(): Extension {
  return [frontmatterProjectionField, documentSyntaxField];
}

export const documentSyntaxField = StateField.define<DecorationSet>({
  create(state) {
    const selection = syntaxSelection(state);
    return decorationsFor(state.doc.toString(), selection.from, selection.to, state);
  },
  update(_value, transaction) {
    const selection = syntaxSelection(transaction.state);
    return decorationsFor(
      transaction.state.doc.toString(),
      selection.from,
      selection.to,
      transaction.state
    );
  },
  provide: (field) => EditorView.decorations.from(field)
});

export function buildDocumentSyntaxPlan(source: string, selection: SourceRange): DocumentSyntaxPlan {
  const frontmatter = findFrontmatter(source);
  const frontmatterProjection = buildFrontmatterProjection(source, selection);
  const html = findRawHtmlRanges(source)
    .filter((range) => frontmatter === undefined || !overlaps(range, frontmatter))
    .map(classifyRawHtml)
    .map((range) => ({
      ...range,
      replaceSource: range.classification === 'safe' && !selectionTouches(range, selection)
    }));
  const sourceIslands: SourceIslandSpec[] = [
    ...(frontmatter?.validity === 'ambiguous'
      ? [{ from: frontmatter.from, to: frontmatter.to, reason: 'invalid or ambiguous frontmatter' }]
      : []),
    ...findUnknownSyntaxRanges(source),
    ...html
      .filter((range) => range.classification !== 'safe')
      .map((range) => ({
        from: range.from,
        to: range.to,
        reason: range.classification === 'unsafe' ? 'unsafe HTML' : 'complex HTML'
      })),
  ];
  return { ...(frontmatterProjection === undefined ? {} : { frontmatter: frontmatterProjection }), html, sourceIslands: uniqueIslands(sourceIslands) };
}

function decorationsFor(
  source: string,
  selectionFrom: number,
  selectionTo: number,
  state: { readonly doc: { lineAt(position: number): { readonly from: number } } }
): DecorationSet {
  const plan = buildDocumentSyntaxPlan(source, { from: selectionFrom, to: selectionTo });
  const ranges = [];
  for (const html of plan.html) {
    if (html.replaceSource) {
      ranges.push(Decoration.replace({ widget: new SafeHtmlWidget(html), block: html.nodeType === 'block' }).range(html.from, html.to));
    }
  }
  const decorated = new Set<number>();
  for (const island of plan.sourceIslands) {
    const lineFrom = state.doc.lineAt(island.from).from;
    ranges.push(Decoration.line({ class: 'markami-source-island' }).range(lineFrom));
    if (!decorated.has(island.from)) {
      decorated.add(island.from);
      ranges.push(Decoration.widget({ widget: new SourceIslandBadge(labelFor(island.reason)), side: -1 }).range(island.from));
    }
  }
  return Decoration.set(ranges, true);
}

class SafeHtmlWidget extends WidgetType {
  public constructor(private readonly html: HtmlProjection) {
    super();
  }

  public override eq(other: SafeHtmlWidget): boolean {
    return other.html.source === this.html.source && other.html.from === this.html.from;
  }

  public override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement(this.html.nodeType === 'block' ? 'div' : 'span');
    root.className = 'markami-safe-html';
    root.tabIndex = 0;
    root.setAttribute('aria-label', 'Rendered safe HTML. Activate to edit source.');
    root.innerHTML = sanitizeRawHtml(this.html.source);
    root.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.html.from + 1 }, scrollIntoView: true });
      view.focus();
    });
    root.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.html.from + 1 }, scrollIntoView: true });
      view.focus();
    });
    return root;
  }

  public override ignoreEvent(): boolean {
    return false;
  }
}

class SourceIslandBadge extends WidgetType {
  public constructor(private readonly label: string) {
    super();
  }

  public override eq(other: SourceIslandBadge): boolean {
    return other.label === this.label;
  }

  public override toDOM(): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'markami-source-island-badge';
    badge.textContent = this.label;
    badge.setAttribute('contenteditable', 'false');
    return badge;
  }
}

function selectionTouches(range: SourceRange, selection: SourceRange): boolean {
  if (selection.from === selection.to) return selection.from > range.from && selection.from < range.to;
  return overlaps(range, selection);
}

function overlaps(left: SourceRange, right: SourceRange): boolean {
  return left.from < right.to && right.from < left.to;
}

function uniqueIslands(islands: readonly SourceIslandSpec[]): readonly SourceIslandSpec[] {
  const result: SourceIslandSpec[] = [];
  for (const island of [...islands].sort((left, right) => left.from - right.from || right.to - left.to)) {
    if (!result.some((candidate) => island.from >= candidate.from && island.to <= candidate.to)) result.push(island);
  }
  return result;
}

function labelFor(reason: string): string {
  if (reason === 'unsafe HTML') return 'Unsafe HTML';
  if (reason === 'complex HTML') return 'HTML source';
  if (reason === 'custom directive') return 'Unknown directive';
  if (reason === 'MDX') return 'MDX';
  if (reason === 'invalid or ambiguous frontmatter') return 'Metadata source';
  return 'Markdown source';
}
