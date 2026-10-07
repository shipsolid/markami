export type BlockConfidence = 'exact' | 'ambiguous';

export interface MovableBlock {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly order: number;
  readonly core: { readonly from: number; readonly to: number };
  readonly separatorAfter: { readonly from: number; readonly to: number };
  readonly movable: boolean;
  readonly pinned: boolean;
  readonly confidence: BlockConfidence;
  readonly reason?: string;
}

interface SourceLine {
  readonly from: number;
  readonly to: number;
  readonly end: number;
  readonly text: string;
}

interface ParsedBlock {
  readonly kind: string;
  readonly from: number;
  readonly to: number;
  readonly movable: boolean;
  readonly pinned: boolean;
  readonly confidence: BlockConfidence;
  readonly reason?: string;
}

export function buildBlockIndex(source: string, version: number): readonly MovableBlock[] {
  const lines = sourceLines(source);
  const parsed: ParsedBlock[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined) break;
    if (line.text.trim() === '') {
      cursor += 1;
      continue;
    }
    const block = parseBlock(lines, cursor, parsed.length === 0);
    parsed.push(block.value);
    cursor = block.next;
  }
  return parsed.map((block, order) => {
    const next = parsed[order + 1];
    return {
      id: `${String(version)}:${String(block.from)}:${String(block.to)}:${block.kind}`,
      kind: block.kind,
      version,
      order,
      core: { from: block.from, to: block.to },
      separatorAfter: { from: block.to, to: next?.from ?? source.length },
      movable: block.movable,
      pinned: block.pinned,
      confidence: block.confidence,
      ...(block.reason === undefined ? {} : { reason: block.reason })
    };
  });
}

function parseBlock(lines: readonly SourceLine[], start: number, first: boolean): { value: ParsedBlock; next: number } {
  const line = lines[start];
  if (line === undefined) throw new RangeError('block start is outside source lines');
  const text = line.text.replace(/^\uFEFF/u, '');
  if (first && /^(---|\+\+\+)\s*$/u.test(text)) {
    const marker = text.trim();
    const close = findClosingLine(lines, start + 1, (candidate) => candidate.trim() === marker);
    if (close !== -1) {
      return parsed(lines, start, close + 1, 'frontmatter', false, true, 'exact', 'frontmatter is pinned');
    }
    return parsed(lines, start, lines.length, 'frontmatter', false, true, 'ambiguous', 'unterminated frontmatter');
  }
  const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(text);
  if (fence !== null) {
    const token = fence[1] ?? '```';
    const marker = token[0] ?? '`';
    const close = findClosingLine(lines, start + 1, (candidate) => {
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/u.exec(candidate);
      const closingToken = closing?.at(1);
      return closingToken !== undefined && closingToken[0] === marker && closingToken.length >= token.length;
    });
    if (close === -1) {
      return parsed(lines, start, lines.length, 'fence', false, false, 'ambiguous', 'unterminated fence');
    }
    return parsed(lines, start, close + 1, 'fence');
  }
  if (/^:::[\w-]+/u.test(text)) {
    const close = findClosingLine(lines, start + 1, (candidate) => /^:::\s*$/u.test(candidate));
    if (close === -1) {
      return parsed(lines, start, lines.length, 'sourceIsland', false, false, 'ambiguous', 'unterminated source island');
    }
    return parsed(lines, start, close + 1, 'sourceIsland');
  }
  if (/^ {0,3}#{1,6}(?:\s|$)/u.test(text) || isSetext(lines, start)) {
    return parsed(lines, start, isSetext(lines, start) ? start + 2 : start + 1, 'heading');
  }
  if (/^ {0,3}>/u.test(text)) {
    return parsed(lines, start, consumeWhile(lines, start + 1, (candidate) => /^ {0,3}>/u.test(candidate)), 'quote');
  }
  if (/^ {0,3}(?:[-+*]|\d+[.)])\s/u.test(text)) {
    let next = start + 1;
    while (next < lines.length && lines[next]?.text.trim() !== '') {
      const candidate = lines[next]?.text ?? '';
      if (isTopLevelStarter(candidate) && !/^ {0,3}(?:[-+*]|\d+[.)])\s/u.test(candidate)) break;
      next += 1;
    }
    return parsed(lines, start, next, 'list');
  }
  if (isTable(lines, start)) {
    return parsed(lines, start, consumeWhile(lines, start + 2, (candidate) => candidate.includes('|')), 'table');
  }
  if (/^ {0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/u.test(text)) {
    return parsed(lines, start, start + 1, 'divider');
  }
  if (/^\s*</u.test(text) || /^\s*(?:import|export)\s/u.test(text)) {
    return parsed(lines, start, start + 1, 'sourceIsland');
  }
  let next = start + 1;
  while (next < lines.length && lines[next]?.text.trim() !== '' && !isTopLevelStarter(lines[next]?.text ?? '')) {
    next += 1;
  }
  return parsed(lines, start, next, 'paragraph');
}

function parsed(
  lines: readonly SourceLine[],
  start: number,
  next: number,
  kind: string,
  movable = true,
  pinned = false,
  confidence: BlockConfidence = 'exact',
  reason?: string
): { value: ParsedBlock; next: number } {
  const first = lines[start];
  const last = lines[Math.max(start, next - 1)];
  if (first === undefined || last === undefined) throw new RangeError('block range is outside source lines');
  return {
    value: {
      kind,
      from: first.from,
      to: last.to,
      movable,
      pinned,
      confidence,
      ...(reason === undefined ? {} : { reason })
    },
    next
  };
}

function sourceLines(source: string): readonly SourceLine[] {
  if (source.length === 0) return [];
  const lines: SourceLine[] = [];
  let from = 0;
  while (from < source.length) {
    let to = from;
    while (to < source.length && source[to] !== '\r' && source[to] !== '\n') to += 1;
    let end = to;
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
    else if (source[end] === '\r' || source[end] === '\n') end += 1;
    lines.push({ from, to, end, text: source.slice(from, to) });
    from = end;
  }
  return lines;
}

function findClosingLine(
  lines: readonly SourceLine[],
  start: number,
  predicate: (text: string) => boolean
): number {
  for (let index = start; index < lines.length; index += 1) {
    if (predicate(lines[index]?.text ?? '')) return index;
  }
  return -1;
}

function consumeWhile(lines: readonly SourceLine[], start: number, predicate: (text: string) => boolean): number {
  let next = start;
  while (next < lines.length && predicate(lines[next]?.text ?? '')) next += 1;
  return next;
}

function isSetext(lines: readonly SourceLine[], start: number): boolean {
  return (lines[start]?.text.trim().length ?? 0) > 0 && /^ {0,3}(?:=+|-+)\s*$/u.test(lines[start + 1]?.text ?? '');
}

function isTable(lines: readonly SourceLine[], start: number): boolean {
  return (lines[start]?.text.includes('|') ?? false) && /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?\s*\|?\s*$/u.test(lines[start + 1]?.text ?? '');
}

function isTopLevelStarter(text: string): boolean {
  return /^ {0,3}(?:#{1,6}(?:\s|$)|>|```|~~~|:::[\w-]+|(?:[-+*]|\d+[.)])\s|(?:-{3,}|_{3,}|\*{3,})\s*$)/u.test(text);
}
