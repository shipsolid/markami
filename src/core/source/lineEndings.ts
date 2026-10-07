export type LineEnding = '\n' | '\r\n' | '\r';
export type LineEndingKind = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';

export interface LineEndingInfo {
  readonly kind: LineEndingKind;
  readonly separators: readonly LineEnding[];
  readonly preferred: LineEnding;
}

export function inspectLineEndings(source: string): LineEndingInfo {
  const separators = source.match(/\r\n|\r|\n/gu) as LineEnding[] | null;
  const values = separators ?? [];
  const distinct = new Set(values);
  const kind = classify(distinct);
  return {
    kind,
    separators: values,
    preferred: values[0] ?? '\n'
  };
}

function classify(values: ReadonlySet<LineEnding>): LineEndingKind {
  if (values.size === 0) {
    return 'none';
  }
  if (values.size > 1) {
    return 'mixed';
  }
  const value = values.values().next().value;
  if (value === '\r\n') {
    return 'crlf';
  }
  return value === '\r' ? 'cr' : 'lf';
}
