export interface FencedBlock {
  readonly from: number;
  readonly to: number;
  readonly marker: '`' | '~';
  readonly markerLength: number;
  readonly info: string;
  readonly language: string;
  readonly opening: { readonly from: number; readonly to: number };
  readonly content: { readonly from: number; readonly to: number };
  readonly closing?: { readonly from: number; readonly to: number };
  readonly closed: boolean;
}

export function findFencedBlocks(source: string): readonly FencedBlock[] {
  const lines = splitLines(source);
  const blocks: FencedBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/u.exec(line.text);
    if (opening === null) continue;
    const token = opening.at(1) ?? '```';
    const marker = token[0] as '`' | '~';
    const info = (opening.at(2) ?? '').trim();
    let closingIndex = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/u.exec(lines[candidate]?.text ?? '');
      const closeToken = close?.at(1);
      if (closeToken !== undefined && closeToken[0] === marker && closeToken.length >= token.length) {
        closingIndex = candidate;
        break;
      }
    }
    const contentFrom = line.end;
    const closingLine = closingIndex === -1 ? undefined : lines[closingIndex];
    const contentTo = closingLine?.from ?? source.length;
    blocks.push({
      from: line.from,
      to: closingLine?.to ?? source.length,
      marker,
      markerLength: token.length,
      info,
      language: info.split(/\s+/u)[0] ?? '',
      opening: { from: line.from, to: line.to },
      content: { from: contentFrom, to: contentTo },
      ...(closingLine === undefined ? {} : { closing: { from: closingLine.from, to: closingLine.to } }),
      closed: closingLine !== undefined
    });
    if (closingIndex !== -1) index = closingIndex;
  }
  return blocks;
}

interface Line { readonly from: number; readonly to: number; readonly end: number; readonly text: string }

function splitLines(source: string): readonly Line[] {
  const lines: Line[] = [];
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
