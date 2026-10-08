import type { ActionResult } from './formatting.js';
import { createTextPatch } from '../source/PatchSet.js';

export type TableAlignment = 'none' | 'left' | 'center' | 'right';

export interface TableCell {
  readonly raw: { readonly from: number; readonly to: number };
  readonly content: { readonly from: number; readonly to: number };
  readonly value: string;
}

export interface TableRow {
  readonly from: number;
  readonly to: number;
  readonly cells: readonly TableCell[];
}

export interface GfmTable {
  readonly from: number;
  readonly to: number;
  readonly eol: '\n' | '\r\n' | '\r';
  readonly columnCount: number;
  readonly rows: readonly TableRow[];
  readonly delimiterRow: TableRow;
  readonly alignments: readonly TableAlignment[];
  readonly snapshot: string;
}

export type TableOperation =
  | { readonly type: 'appendRow' }
  | { readonly type: 'insertRow'; readonly row: number }
  | { readonly type: 'deleteRow'; readonly row: number }
  | { readonly type: 'insertColumn'; readonly column: number; readonly label?: string }
  | { readonly type: 'deleteColumn'; readonly column: number }
  | { readonly type: 'align'; readonly column: number; readonly alignment: TableAlignment };

interface Line { readonly from: number; readonly to: number; readonly end: number; readonly text: string; readonly eol: string }

export function parseGfmTables(source: string): readonly GfmTable[] {
  const lines = splitLines(source);
  const tables: GfmTable[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (headerLine === undefined || delimiterLine === undefined || !hasStructuralPipe(headerLine.text)) continue;
    const header = parseRow(headerLine);
    const delimiter = parseRow(delimiterLine);
    const alignments = delimiter.cells.map((cell) => parseAlignment(cell.value));
    if (header.cells.length < 1 || delimiter.cells.length !== header.cells.length || alignments.some((value) => value === undefined)) continue;
    const rows: TableRow[] = [header];
    let next = index + 2;
    while (next < lines.length) {
      const line = lines[next];
      if (line === undefined || line.text.trim() === '' || !hasStructuralPipe(line.text)) break;
      rows.push(parseRow(line));
      next += 1;
    }
    const last = lines[Math.max(index + 1, next - 1)];
    if (last === undefined) continue;
    const from = header.from;
    const to = last.to;
    const eol = normalizeEol(headerLine.eol || delimiterLine.eol || '\n');
    tables.push({
      from,
      to,
      eol,
      columnCount: delimiter.cells.length,
      rows,
      delimiterRow: delimiter,
      alignments: alignments as TableAlignment[],
      snapshot: source.slice(from, to)
    });
    index = next - 1;
  }
  return tables;
}

export function planCellEdit(
  source: string,
  table: GfmTable,
  row: number,
  column: number,
  value: string
): ActionResult {
  const stale = validateTable(source, table);
  if (stale !== undefined) return { ok: false, reason: stale };
  const cell = table.rows[row]?.cells[column];
  if (cell === undefined) return { ok: false, reason: 'table cell is unavailable' };
  const insert = escapeUnquotedPipes(value);
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(cell.content.from, cell.content.to, insert)],
      selectionAfter: { anchor: cell.content.from + insert.length, head: cell.content.from + insert.length },
      allowedRanges: [{ ...cell.content }],
      label: 'Edit table cell'
    }
  };
}

export function planCellEditAndAppendRow(
  source: string,
  table: GfmTable,
  row: number,
  column: number,
  value: string
): ActionResult {
  const cell = planCellEdit(source, table, row, column, value);
  if (!cell.ok) return cell;
  const append = planTableOperation(source, table, { type: 'appendRow' });
  if (!append.ok) return append;
  return {
    ok: true,
    edit: {
      patches: [...cell.edit.patches, ...append.edit.patches],
      selectionAfter: append.edit.selectionAfter,
      allowedRanges: [...cell.edit.allowedRanges, ...append.edit.allowedRanges],
      label: 'Edit table cell and append row'
    }
  };
}

export function planTableOperation(source: string, table: GfmTable, operation: TableOperation): ActionResult {
  const stale = validateTable(source, table);
  if (stale !== undefined) return { ok: false, reason: stale };
  if (operation.type === 'align') {
    const cell = table.delimiterRow.cells[operation.column];
    if (cell === undefined) return { ok: false, reason: 'table column is unavailable' };
    const hyphens = '-'.repeat(Math.max(3, cell.value.replaceAll(':', '').trim().length));
    const insert = operation.alignment === 'left' ? `:${hyphens}`
      : operation.alignment === 'right' ? `${hyphens}:`
        : operation.alignment === 'center' ? `:${hyphens}:` : hyphens;
    return editResult([createTextPatch(cell.content.from, cell.content.to, insert)], cell.content.from + insert.length, cell.content, 'Align table column');
  }
  if (operation.type === 'appendRow') {
    const insert = `${table.eol}| ${Array.from({ length: table.columnCount }, () => '').join(' | ')} |`;
    return editResult([createTextPatch(table.to, table.to, insert)], table.to + insert.length - 2, { from: table.to, to: table.to }, 'Append table row');
  }

  const model = table.rows.map((row) => Array.from({ length: table.columnCount }, (_, column) => row.cells[column]?.value ?? ''));
  const alignments = [...table.alignments];
  if (operation.type === 'insertRow') {
    if (operation.row < 1 || operation.row > model.length) return { ok: false, reason: 'table row is unavailable' };
    model.splice(operation.row, 0, Array.from({ length: table.columnCount }, () => ''));
  } else if (operation.type === 'deleteRow') {
    if (operation.row < 1 || operation.row >= model.length) return { ok: false, reason: 'header or missing row cannot be deleted' };
    model.splice(operation.row, 1);
  } else if (operation.type === 'insertColumn') {
    if (operation.column < 0 || operation.column > table.columnCount) return { ok: false, reason: 'table column is unavailable' };
    model.forEach((row, rowIndex) => row.splice(operation.column, 0, rowIndex === 0 ? operation.label ?? 'Column' : ''));
    alignments.splice(operation.column, 0, 'none');
  } else {
    if (table.columnCount <= 1 || operation.column < 0 || operation.column >= table.columnCount) {
      return { ok: false, reason: 'table must retain at least one column' };
    }
    model.forEach((row) => row.splice(operation.column, 1));
    alignments.splice(operation.column, 1);
  }
  const replacement = serializeTable(model, alignments, table.eol);
  return editResult(
    [createTextPatch(table.from, table.to, replacement)],
    table.from,
    { from: table.from, to: table.to },
    'Edit table structure'
  );
}

function parseRow(line: Line): TableRow {
  const cells: TableCell[] = [];
  const pipes = structuralPipes(line.text);
  const leading = pipes[0] === line.text.search(/\S/u);
  const lastNonspace = line.text.search(/\s*$/u) - 1;
  const trailing = pipes.at(-1) === lastNonspace;
  let start = leading ? (pipes.shift() ?? -1) + 1 : 0;
  for (const pipe of pipes) {
    if (trailing && pipe === pipes.at(-1)) break;
    cells.push(cellFrom(line, start, pipe));
    start = pipe + 1;
  }
  const end = trailing ? (pipes.at(-1) ?? line.text.length) : line.text.length;
  if (start <= end) cells.push(cellFrom(line, start, end));
  return { from: line.from, to: line.to, cells };
}

function cellFrom(line: Line, relativeFrom: number, relativeTo: number): TableCell {
  const raw = line.text.slice(relativeFrom, relativeTo);
  const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
  const contentFrom = line.from + relativeFrom + leading;
  const contentTo = Math.max(contentFrom, line.from + relativeTo - trailing);
  return {
    raw: { from: line.from + relativeFrom, to: line.from + relativeTo },
    content: { from: contentFrom, to: contentTo },
    value: line.text.slice(relativeFrom + leading, relativeTo - trailing)
  };
}

function structuralPipes(line: string): number[] {
  const pipes: number[] = [];
  let backticks = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '`') {
      let run = 1;
      while (line[index + run] === '`') run += 1;
      backticks = backticks === run ? 0 : run;
      index += run - 1;
    } else if (character === '|' && backticks === 0) {
      pipes.push(index);
    }
  }
  return pipes;
}

function hasStructuralPipe(line: string): boolean {
  return structuralPipes(line).length > 0;
}

function parseAlignment(value: string): TableAlignment | undefined {
  const trimmed = value.trim();
  if (!/^:?-{3,}:?$/u.test(trimmed)) return undefined;
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.startsWith(':')) return 'left';
  if (trimmed.endsWith(':')) return 'right';
  return 'none';
}

function serializeTable(rows: readonly string[][], alignments: readonly TableAlignment[], eol: string): string {
  const format = (values: readonly string[]) => `| ${values.join(' | ')} |`;
  const delimiter = alignments.map((alignment) => alignment === 'left' ? ':---'
    : alignment === 'right' ? '---:' : alignment === 'center' ? ':---:' : '---');
  return [format(rows[0] ?? []), format(delimiter), ...rows.slice(1).map(format)].join(eol);
}

function validateTable(source: string, table: GfmTable): string | undefined {
  return source.slice(table.from, table.to) === table.snapshot ? undefined : 'table changed before the operation completed';
}

function editResult(
  patches: ReturnType<typeof createTextPatch>[],
  caret: number,
  range: { readonly from: number; readonly to: number },
  label: string
): ActionResult {
  return { ok: true, edit: { patches, selectionAfter: { anchor: caret, head: caret }, allowedRanges: [range], label } };
}

function escapeUnquotedPipes(value: string): string {
  return value.replace(/(?<!\\)\|/gu, '\\|');
}

function normalizeEol(value: string): '\n' | '\r\n' | '\r' {
  return value === '\r\n' ? '\r\n' : value === '\r' ? '\r' : '\n';
}

function splitLines(source: string): readonly Line[] {
  const lines: Line[] = [];
  let from = 0;
  while (from < source.length) {
    let to = from;
    while (to < source.length && source[to] !== '\r' && source[to] !== '\n') to += 1;
    let end = to;
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
    else if (source[end] === '\r' || source[end] === '\n') end += 1;
    lines.push({ from, to, end, text: source.slice(from, to), eol: source.slice(to, end) });
    from = end;
  }
  return lines;
}
