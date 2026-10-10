import { buildInlineProjection, type SourceRange } from '../../../core/markdown/syntax.js';

interface Styled extends SourceRange {
  readonly className: string;
}

/**
 * Renders the inline Markdown of a table cell as DOM: markers disappear and bold, emphasis, strikethrough, code and
 * link text keep the same classes the document projection uses. Plain text yields a single text node, so a cell
 * without markup is left exactly as the browser would show it.
 */
export function renderInlineMarkdown(documentRef: Document, source: string): DocumentFragment {
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
  const fragment = documentRef.createDocumentFragment();
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index] ?? 0;
    const to = boundaries[index + 1] ?? from;
    if (hidden.some((range) => range.from <= from && to <= range.to)) continue;
    const text = source.slice(from, to);
    const classes = styled.filter((range) => range.from <= from && to <= range.to).map((range) => range.className);
    if (classes.length === 0) {
      fragment.append(documentRef.createTextNode(text));
      continue;
    }
    const span = documentRef.createElement('span');
    span.className = classes.join(' ');
    span.textContent = text;
    fragment.append(span);
  }
  return fragment;
}
