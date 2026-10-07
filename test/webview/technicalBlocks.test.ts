import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { buildTechnicalPlan, technicalBlocksField } from '../../src/webview/features/technicalBlocks.js';
import { projectionField } from '../../src/webview/projection/ProjectionPlugin.js';

const source = [
  '- [ ] task',
  '',
  '```ts',
  'const value = 1;',
  '```',
  '',
  '```mermaid',
  'flowchart TD',
  '  A --> B',
  '```',
  '',
  '> [!NOTE]',
  '> detail',
  '',
  '$$',
  'x + y',
  '$$'
].join('\n');

describe('technical block projection', () => {
  test('technical projection creates local widgets without a source transaction', () => {
    const state = EditorState.create({ doc: source, extensions: [projectionField, technicalBlocksField] });
    const plan = buildTechnicalPlan(source, { from: 0, to: 0 });

    expect(plan.tasks).toHaveLength(1);
    expect(plan.codeBlocks).toHaveLength(1);
    expect(plan.mermaid).toHaveLength(1);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.math).toHaveLength(1);
    expect(state.field(technicalBlocksField).size).toBeGreaterThan(0);
    expect(state.doc.toString()).toBe(source);
  });

  test('active Mermaid exposes fenced source instead of replacing it', () => {
    const mermaidStart = source.indexOf('```mermaid');
    const plan = buildTechnicalPlan(source, { from: mermaidStart + 12, to: mermaidStart + 12 });

    expect(plan.mermaid[0]).toMatchObject({ active: true });
    expect(plan.mermaid[0]?.replaceSource).toBe(false);
  });

  test('malformed fence stays source-editable and composition-like edits are untouched', () => {
    const malformed = 'Before\n\n```ts\nconst value = 1;';
    const plan = buildTechnicalPlan(malformed, { from: malformed.length, to: malformed.length });
    expect(plan.sourceIslands).toContainEqual(expect.objectContaining({ reason: 'unterminated fence' }));

    const state = EditorState.create({ doc: malformed, extensions: [technicalBlocksField] });
    const transaction = state.update({
      changes: { from: malformed.length, insert: 'あ' },
      selection: EditorSelection.cursor(malformed.length + 1)
    });
    expect(transaction.newDoc.toString()).toBe(`${malformed}あ`);
  });
});
