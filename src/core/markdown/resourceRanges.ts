export interface MarkdownSourceRange {
  readonly from: number;
  readonly to: number;
}

export function protectedResourceRanges(source: string): readonly MarkdownSourceRange[] {
  const ranges: MarkdownSourceRange[] = [];
  let offset = 0;
  let fence: { readonly from: number; readonly marker: '`' | '~'; readonly length: number } | undefined;
  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    const token = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (token !== undefined) {
      const marker = token[0] as '`' | '~';
      if (fence === undefined) {
        fence = { from: offset, marker, length: token.length };
      } else if (fence.marker === marker && token.length >= fence.length) {
        ranges.push({ from: fence.from, to: offset + line.length });
        fence = undefined;
      }
    }
    if (index < lines.length - 1) offset += line.length + 1;
  }
  if (fence !== undefined) ranges.push({ from: fence.from, to: source.length });

  for (const match of source.matchAll(/(`+)([^\n]*?)\1/gu)) {
    const range = { from: match.index, to: match.index + match[0].length };
    if (!ranges.some((candidate) => overlaps(candidate, range))) ranges.push(range);
  }
  return ranges.sort((left, right) => left.from - right.from);
}

export function isProtectedResourceRange(
  ranges: readonly MarkdownSourceRange[],
  from: number,
  to: number
): boolean {
  return ranges.some((range) => overlaps(range, { from, to }));
}

export function isEscapedMarkdown(source: string, position: number): boolean {
  let slashes = 0;
  for (let cursor = position - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function overlaps(left: MarkdownSourceRange, right: MarkdownSourceRange): boolean {
  return left.from < right.to && right.from < left.to;
}
