import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { buildProjectionPlan } from '../../src/core/markdown/syntax.js';
import { projectionField } from '../../src/webview/projection/ProjectionPlugin.js';

const source = '# Heading\n\nA **bold** paragraph.\n\n> quote\n\n- item\n';

describe('Markdown projection', () => {
  test('projection_never_mutates_source', () => {
    let state = EditorState.create({ doc: source, extensions: [projectionField] });
    for (const position of [0, 2, 14, 22, 36, source.length]) {
      const transaction = state.update({ selection: EditorSelection.cursor(position) });
      expect(transaction.docChanged).toBe(false);
      state = transaction.state;
      state.field(projectionField);
    }

    expect(state.doc.toString()).toBe(source);
  });

  test('parser_disagreement_exposes_editable_source', () => {
    const plan = buildProjectionPlan('**value**', {
      semanticRanges: [{ from: 0, to: 8, kind: 'inlineCode' }]
    });

    expect(plan.sourceIslands).toEqual([{ from: 0, to: 9, reason: 'parser disagreement' }]);
    expect(plan.hiddenTokens).toHaveLength(0);
  });

  test('unterminated_fence_remains_editable', () => {
    const markdown = 'before\n\n```ts\nconst value = 1;';
    const plan = buildProjectionPlan(markdown);

    expect(plan.sourceIslands).toContainEqual({ from: 8, to: markdown.length, reason: 'unterminated fence' });
    expect(plan.widgets).toHaveLength(0);
  });

  test('selection_through_hidden_tokens_keeps_copy_behavior', () => {
    const inactive = buildProjectionPlan('A **bold** word.');
    const selected = buildProjectionPlan('A **bold** word.', { selection: { from: 2, to: 10 } });

    expect(inactive.hiddenTokens).toEqual(expect.arrayContaining([{ from: 2, to: 4 }, { from: 8, to: 10 }]));
    expect(selected.hiddenTokens).toHaveLength(0);
    expect('A **bold** word.'.slice(2, 10)).toBe('**bold**');
  });

  test('divider_source_hides_until_the_caret_touches_it', () => {
    const markdown = 'above\n\n---\n\nbelow';
    const inactive = buildProjectionPlan(markdown);
    const active = buildProjectionPlan(markdown, { selection: { from: 8, to: 8 } });

    expect(inactive.lineStyles.map((style) => style.kind)).toContain('divider');
    expect(inactive.hiddenTokens).toContainEqual({ from: 7, to: 10 });
    expect(active.hiddenTokens).toHaveLength(0);
  });

  test('fenced_code_content_is_never_styled_hidden_or_marked', () => {
    const markdown = 'intro\n\n```sh\n# comment in code\n- dash in code\n> quote in code\n**not bold**\n```\n\n# real heading\n';
    const plan = buildProjectionPlan(markdown);
    const text = (range: { readonly from: number; readonly to: number }): string => markdown.slice(range.from, range.to);

    expect(plan.lineStyles.map((style) => [text(style), style.kind])).toEqual([['# real heading', 'heading1']]);
    expect(plan.marks).toEqual([]);
    expect(plan.hiddenTokens.map(text)).toEqual(['# ']);
  });

  test('indented_list_items_are_styled_as_list_lines', () => {
    const markdown = '- parent\n  - child\n    1. grandchild\n';
    const plan = buildProjectionPlan(markdown);

    expect(plan.lineStyles.map((style) => style.kind)).toEqual(['list', 'list', 'list']);
  });

  test('caret_at_delimiter_reveals_syntax_for_backspace_and_delete', () => {
    for (const position of [2, 4, 8, 10]) {
      const plan = buildProjectionPlan('A **bold** word.', { selection: { from: position, to: position } });
      expect(plan.hiddenTokens).toHaveLength(0);
    }
  });

  test('recognizes initial prose syntax without serializing it', () => {
    const plan = buildProjectionPlan(source);

    expect(plan.lineStyles.map((style) => style.kind)).toEqual(expect.arrayContaining(['heading1', 'quote', 'list']));
    expect(plan.marks).toContainEqual(expect.objectContaining({ kind: 'strong', from: 15, to: 19 }));
    expect(source).toContain('**bold**');
  });

  test('projects the complete heading hierarchy for appearance styling', () => {
    const headings = '# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six';

    expect(buildProjectionPlan(headings).lineStyles.map((style) => style.kind)).toEqual([
      'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'
    ]);
  });
});
