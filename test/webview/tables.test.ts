// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { buildTablePlan, tableProjectionField } from '../../src/webview/features/tables/TableProjection.js';

const source = 'Before\n\n| A | B |\n| --- | ---: |\n| one | two |';

describe('table projection', () => {
  test('renders a mapped grid without changing source', () => {
    const state = EditorState.create({ doc: source, extensions: [tableProjectionField] });
    const plan = buildTablePlan(source, { from: 0, to: 0 });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ replaceSource: true, columnCount: 2 });
    expect(state.field(tableProjectionField).size).toBe(1);
    expect(state.doc.toString()).toBe(source);
  });

  test('active table reveals source for malformed paste and external edits', () => {
    const position = source.indexOf('one');
    expect(buildTablePlan(source, { from: position, to: position })[0]).toMatchObject({ replaceSource: false });
    expect(buildTablePlan('| A |\n| bad |', { from: 0, to: 0 })).toHaveLength(0);
  });
});
