import { describe, expect, test } from 'vitest';
import { applyPatchSet, invertPatchSet } from '../../src/core/source/PatchSet.js';
import {
  inlineFormatState,
  planHeading,
  planInlineFormat,
  selectionCapabilities,
  type ActionContext
} from '../../src/core/markdown/formatting.js';

function context(source: string, anchor: number, head = anchor): ActionContext {
  return {
    hostVersion: 4,
    editorRevision: 9,
    selection: { anchor, head },
    source,
    capabilities: {}
  };
}

describe('source-aware formatting planners', () => {
  test('bold_on_selected_collector_inserts_only_delimiters', () => {
    const source = 'The collector receives OTLP.';
    const result = planInlineFormat(context(source, 4, 13), 'strong');

    expect(result).toMatchObject({
      ok: true,
      edit: {
        patches: [
          { from: 4, to: 4, insert: '**' },
          { from: 13, to: 13, insert: '**' }
        ],
        selectionAfter: { anchor: 6, head: 15 }
      }
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const formatted = applyPatchSet(source, result.edit.patches);
    expect(formatted).toBe('The **collector** receives OTLP.');
    expect(applyPatchSet(formatted, invertPatchSet(source, result.edit.patches))).toBe(source);
  });

  test('preserves_existing_underscore_bold', () => {
    const source = 'The __collector__ receives OTLP.';
    const result = planInlineFormat(context(source, 6, 15), 'strong');

    expect(result).toEqual({
      ok: true,
      edit: {
        patches: [
          { from: 4, to: 6, insert: '' },
          { from: 15, to: 17, insert: '' }
        ],
        selectionAfter: { anchor: 4, head: 13 },
        allowedRanges: [{ from: 4, to: 17 }],
        label: 'Remove bold'
      }
    });
    if (result.ok) {
      expect(applyPatchSet(source, result.edit.patches)).toBe('The collector receives OTLP.');
    }
  });

  test('clear_partial_span_rejects_unsafe_unwrap', () => {
    const source = 'A **bold phrase** stays.';
    const result = planInlineFormat(context(source, 7, 13), 'clear');

    expect(result).toEqual({
      ok: false,
      reason: 'selection partially intersects bold formatting'
    });
    expect(source).toBe('A **bold phrase** stays.');
  });

  test('inline code chooses a fence longer than contained backticks', () => {
    const source = 'Use a`b here.';
    const result = planInlineFormat(context(source, 4, 7), 'code');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(applyPatchSet(source, result.edit.patches)).toBe('Use ``a`b`` here.');
    }
  });

  test('link wrapping keeps label bytes and validates the destination', () => {
    const source = 'Read details now.';
    const result = planInlineFormat(context(source, 5, 12), 'link', { href: './runbook.md' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(applyPatchSet(source, result.edit.patches)).toBe('Read [details](./runbook.md) now.');
    }
    expect(planInlineFormat(context(source, 5, 12), 'link', { href: 'javascript:alert(1)' })).toEqual({
      ok: false,
      reason: 'link destination uses an unsafe scheme'
    });
  });

  test('Setext conversion changes only its underline', () => {
    const source = 'Title\n=====\n\nBody';
    const result = planHeading(context(source, 2), 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.edit.patches).toEqual([{ from: 6, to: 11, insert: '-----' }]);
      expect(applyPatchSet(source, result.edit.patches)).toBe('Title\n-----\n\nBody');
    }
  });

  test('heading conversion rejects selections spanning paragraphs', () => {
    const source = 'One\n\nTwo';
    expect(planHeading(context(source, 0, source.length), 1)).toEqual({
      ok: false,
      reason: 'heading conversion requires one paragraph or heading'
    });
  });

  test('reports active and mixed toolbar states from preserved source wrappers', () => {
    expect(inlineFormatState(context('A **bold phrase**.', 4, 15), 'strong')).toBe('active');
    expect(inlineFormatState(context('A **bold** and plain.', 4, 18), 'strong')).toBe('mixed');
    expect(inlineFormatState(context('A plain phrase.', 2, 7), 'strong')).toBe('inactive');
  });

  test('excludes fenced code, frontmatter, and multi-paragraph selections', () => {
    const fenced = '```ts\nconst value = 1;\n```\n';
    expect(selectionCapabilities(fenced, { anchor: 6, head: 11 })).toMatchObject({
      formatting: false,
      sourceIsland: true
    });
    const frontmatter = '---\ntitle: Demo\n---\n\nBody';
    expect(selectionCapabilities(frontmatter, { anchor: 4, head: 9 }).formatting).toBe(false);
    expect(selectionCapabilities('One\n\nTwo', { anchor: 0, head: 8 }).mixedBlocks).toBe(true);
  });
});
