export interface MathRange {
  readonly from: number;
  readonly to: number;
  readonly source: string;
  readonly display: boolean;
}

export function findMathRanges(source: string): readonly MathRange[] {
  const ranges: MathRange[] = [];
  for (const match of source.matchAll(/^\$\$[ \t]*\r?\n([\s\S]*?)\r?\n\$\$[ \t]*$/gmu)) {
    ranges.push({ from: match.index, to: match.index + match[0].length, source: match[1] ?? '', display: true });
  }
  for (const match of source.matchAll(/(?<![$\\])\$([^$\r\n]+)\$(?!\$)/gu)) {
    const expression = match[1] ?? '';
    if (!/[-A-Za-z\\+*/^_=]/u.test(expression) || /^\s*\d/u.test(expression)) continue;
    const from = match.index;
    if (ranges.some((range) => from >= range.from && from < range.to)) continue;
    ranges.push({ from, to: from + match[0].length, source: expression, display: false });
  }
  return ranges.sort((left, right) => left.from - right.from);
}

export async function renderMath(source: string, displayMode: boolean): Promise<string> {
  const module = await import('katex');
  return module.default.renderToString(source, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'error',
    output: 'htmlAndMathml'
  });
}
