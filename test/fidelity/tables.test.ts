import { describe, expect, test } from 'vitest';
import { applyPatchSet } from '../../src/core/source/PatchSet.js';
import {
  parseGfmTables,
  planCellEdit,
  planTableOperation
} from '../../src/core/markdown/tables.js';

describe('GFM table source mapping', () => {
  test('cell edit preserves escaped pipes, code pipes, neighbors, and surrounding text', () => {
    const source = 'Before\n\n| Name | Value |\n| :--- | ---: |\n| a\\|b | `x|y` |\n\nAfter';
    const table = parseGfmTables(source)[0];
    if (table === undefined) throw new Error('missing table');
    const result = planCellEdit(source, table, 1, 0, 'c\\|d');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.edit.patches).toHaveLength(1);
    expect(applyPatchSet(source, result.edit.patches)).toBe(
      'Before\n\n| Name | Value |\n| :--- | ---: |\n| c\\|d | `x|y` |\n\nAfter'
    );
  });

  test('parses ragged Unicode CRLF rows without normalizing them', () => {
    const source = '| 名前 | 値 |\r\n| --- | --- |\r\n| α |\r\n';
    const table = parseGfmTables(source)[0];
    expect(table).toMatchObject({ eol: '\r\n', columnCount: 2 });
    expect(table?.rows[1]?.cells).toHaveLength(1);
    expect(source).toBe('| 名前 | 値 |\r\n| --- | --- |\r\n| α |\r\n');
  });

  test('alignment changes only the delimiter cell', () => {
    const source = '| A | B |\n| --- | :---: |\n| 1 | 2 |';
    const table = parseGfmTables(source)[0];
    if (table === undefined) throw new Error('missing table');
    const result = planTableOperation(source, table, { type: 'align', column: 0, alignment: 'right' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(applyPatchSet(source, result.edit.patches)).toBe('| A | B |\n| ---: | :---: |\n| 1 | 2 |');
  });

  test('insert/delete row and column stay inside the table boundary', () => {
    const source = 'Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter';
    const table = parseGfmTables(source)[0];
    if (table === undefined) throw new Error('missing table');
    const inserted = planTableOperation(source, table, { type: 'insertColumn', column: 1, label: 'New' });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) throw new Error(inserted.reason);
    const changed = applyPatchSet(source, inserted.edit.patches);
    expect(changed.startsWith('Before\n\n')).toBe(true);
    expect(changed.endsWith('\n\nAfter')).toBe(true);
    expect(changed).toContain('| A | New | B |');

    const reparsed = parseGfmTables(changed)[0];
    if (reparsed === undefined) throw new Error('missing rewritten table');
    const deleted = planTableOperation(changed, reparsed, { type: 'deleteRow', row: 1 });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(applyPatchSet(changed, deleted.edit.patches)).not.toContain('| 1 |  | 2 |');
  });

  test('last-cell Tab appends one row using the existing EOL', () => {
    const source = '| A | B |\r\n| --- | --- |\r\n| 1 | 2 |';
    const table = parseGfmTables(source)[0];
    if (table === undefined) throw new Error('missing table');
    const result = planTableOperation(source, table, { type: 'appendRow' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(applyPatchSet(source, result.edit.patches)).toBe(`${source}\r\n|  |  |`);
  });

  test('malformed delimiter falls back to source', () => {
    expect(parseGfmTables('| A | B |\n| nope | --- |\n| 1 | 2 |')).toHaveLength(0);
  });
});
