import { parser as yamlParser } from '@lezer/yaml';

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface FrontmatterBlock extends SourceRange {
  readonly opening: SourceRange;
  readonly content: SourceRange;
  readonly closing?: SourceRange;
  readonly source: string;
  readonly validity: 'valid' | 'ambiguous';
}

interface SourceLine extends SourceRange {
  readonly end: number;
  readonly text: string;
}

export function findFrontmatter(source: string): FrontmatterBlock | undefined {
  const bomLength = source.startsWith('\uFEFF') ? 1 : 0;
  const lines = sourceLines(source, bomLength);
  const opening = lines[0];
  if (opening === undefined || opening.text !== '---') return undefined;

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.text === '---');
  const closing = closingIndex < 0 ? undefined : lines[closingIndex];
  const to = closing?.to ?? source.length;
  const contentFrom = opening.end;
  const contentTo = closing?.from ?? source.length;
  const content = source.slice(contentFrom, contentTo);
  return {
    from: opening.from,
    to,
    opening: { from: opening.from, to: opening.to },
    content: { from: contentFrom, to: contentTo },
    ...(closing === undefined ? {} : { closing: { from: closing.from, to: closing.to } }),
    source: source.slice(opening.from, to),
    validity: closing !== undefined && isStructurallyValidYaml(content) ? 'valid' : 'ambiguous'
  };
}

function sourceLines(source: string, start: number): readonly SourceLine[] {
  if (start >= source.length) return [];
  const lines: SourceLine[] = [];
  let from = start;
  while (from < source.length) {
    let to = from;
    while (to < source.length && source[to] !== '\n' && source[to] !== '\r') to += 1;
    let end = to;
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
    else if (source[end] === '\r' || source[end] === '\n') end += 1;
    lines.push({ from, to, end, text: source.slice(from, to) });
    from = end;
  }
  return lines;
}

function isStructurallyValidYaml(content: string): boolean {
  let valid = true;
  yamlParser.parse(content).cursor().iterate((node) => {
    if (node.type.isError) valid = false;
  });
  return valid;
}
