import { buildInlineProjection, type SourceRange } from '../../../core/markdown/syntax.js';

interface Styled extends SourceRange {
  readonly className: string;
}

interface Segment extends SourceRange {
  readonly classes: readonly string[];
}

/** The visible runs of a cell's source, in order: hidden markers are absent and each run keeps its style classes. */
function visibleSegments(source: string): readonly Segment[] {
  const { marks, hiddenTokens } = buildInlineProjection(source);
  const styled: Styled[] = marks.map((mark) => ({ from: mark.from, to: mark.to, className: `markami-${mark.kind}` }));
  const hidden: SourceRange[] = [...hiddenTokens];
  const code = marks.filter((mark) => mark.kind === 'inlineCode');
  for (const link of source.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/gu)) {
    const from = link.index;
    const to = from + link[0].length;
    if (code.some((span) => span.from <= from && to <= span.to)) continue;
    const textFrom = from + 1;
    const textTo = textFrom + (link[1] ?? '').length;
    hidden.push({ from, to: textFrom }, { from: textTo, to });
    styled.push({ from: textFrom, to: textTo, className: 'markami-link' });
  }

  const cuts = new Set<number>([0, source.length]);
  for (const range of [...styled, ...hidden]) {
    cuts.add(range.from);
    cuts.add(range.to);
  }
  const boundaries = [...cuts].filter((cut) => cut >= 0 && cut <= source.length).sort((left, right) => left - right);
  const segments: Segment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index] ?? 0;
    const to = boundaries[index + 1] ?? from;
    if (hidden.some((range) => range.from <= from && to <= range.to)) continue;
    const classes = styled.filter((range) => range.from <= from && to <= range.to).map((range) => range.className);
    segments.push({ from, to, classes });
  }
  return segments;
}

/**
 * Renders the inline Markdown of a table cell as DOM: markers disappear and bold, emphasis, strikethrough, code and
 * link text keep the same classes the document projection uses. Plain text yields a single text node, so a cell
 * without markup is left exactly as the browser would show it.
 */
export function renderInlineMarkdown(documentRef: Document, source: string): DocumentFragment {
  const fragment = documentRef.createDocumentFragment();
  for (const segment of visibleSegments(source)) {
    const text = source.slice(segment.from, segment.to);
    if (segment.classes.length === 0) {
      fragment.append(documentRef.createTextNode(text));
      continue;
    }
    const span = documentRef.createElement('span');
    span.className = segment.classes.join(' ');
    span.textContent = text;
    fragment.append(span);
  }
  return fragment;
}

/**
 * Maps a caret position in the rendered text of a cell to the matching offset in its source, so focusing a cell with
 * the pointer can put the caret where it was clicked. A position on the boundary between two runs lands before the
 * next visible character, and the two ends of the text map to the two ends of the source.
 */
export function sourceOffsetForRenderedOffset(source: string, renderedOffset: number): number {
  const segments = visibleSegments(source);
  const total = segments.reduce((sum, segment) => sum + segment.to - segment.from, 0);
  if (renderedOffset <= 0) return 0;
  if (renderedOffset >= total) return source.length;
  let consumed = 0;
  for (const segment of segments) {
    const length = segment.to - segment.from;
    if (renderedOffset < consumed + length) return segment.from + (renderedOffset - consumed);
    consumed += length;
  }
  return source.length;
}
