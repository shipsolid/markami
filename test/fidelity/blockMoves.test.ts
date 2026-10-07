import { describe, expect, test } from 'vitest';
import { buildBlockIndex } from '../../src/core/markdown/blockIndex.js';
import { planBlockMove } from '../../src/core/markdown/moveBlock.js';
import { applyPatchSet, invertPatchSet } from '../../src/core/source/PatchSet.js';

function move(source: string, sourceIndex: number, targetIndex: number): string {
  const index = buildBlockIndex(source, 7);
  const block = index[sourceIndex];
  if (block === undefined) throw new Error('missing source block');
  const result = planBlockMove(source, index, block.id, targetIndex);
  if (!result.ok) throw new Error(result.reason);
  const edited = applyPatchSet(source, result.edit.patches);
  expect(applyPatchSet(edited, invertPatchSet(source, result.edit.patches))).toBe(source);
  return edited;
}

describe('exact-source block moves', () => {
  test.each([
    ['paragraph', 'Alpha\n\nBeta\n\nGamma', 2, 0, 'Gamma\n\nAlpha\n\nBeta'],
    ['heading', '# Heading\n\nParagraph', 0, 1, 'Paragraph\n\n# Heading'],
    ['list', 'Before\n\n- one\n- two\n\nAfter', 1, 2, 'Before\n\nAfter\n\n- one\n- two'],
    ['quote', '> one\n> two\n\nAfter', 0, 1, 'After\n\n> one\n> two'],
    ['fence', '```ts\nconst n = 1;\n```\n\nAfter', 0, 1, 'After\n\n```ts\nconst n = 1;\n```'],
    ['table', '| A | B |\n| - | - |\n| 1 | 2 |\n\nAfter', 0, 1, 'After\n\n| A | B |\n| - | - |\n| 1 | 2 |'],
    ['island', ':::custom\nvalue\n:::\n\nAfter', 0, 1, 'After\n\n:::custom\nvalue\n:::']
  ])('moves %s core without rewriting it', (_name, source, from, to, expected) => {
    const before = buildBlockIndex(source, 7);
    const movedCore = source.slice(before[from]?.core.from, before[from]?.core.to);
    const edited = move(source, from, to);

    expect(edited).toBe(expected);
    expect(edited).toContain(movedCore);
  });

  test('move_eof_block_without_newline_preserves_boundaries', () => {
    const source = '# H\n\n- a\n- b\n\nTail';
    expect(move(source, 2, 1)).toBe('# H\n\nTail\n\n- a\n- b');
  });

  test('moves first and last blocks with CRLF separators intact', () => {
    const source = 'One\r\n\r\nTwo\r\n';
    expect(move(source, 0, 1)).toBe('Two\r\n\r\nOne\r\n');
  });

  test('same target is an exact no-op', () => {
    const source = 'One\n\nTwo';
    const index = buildBlockIndex(source, 1);
    const result = planBlockMove(source, index, index[0]?.id ?? '', 0);
    expect(result).toMatchObject({ ok: true, edit: { patches: [] } });
  });

  test('frontmatter is pinned and unterminated fences are refused', () => {
    const frontmatter = '---\ntitle: Demo\n---\n\nBody';
    const frontmatterIndex = buildBlockIndex(frontmatter, 1);
    expect(frontmatterIndex[0]).toMatchObject({ kind: 'frontmatter', movable: false, pinned: true });
    expect(planBlockMove(frontmatter, frontmatterIndex, frontmatterIndex[0]?.id ?? '', 1)).toEqual({
      ok: false,
      reason: 'frontmatter is pinned'
    });

    const malformed = 'Before\n\n```ts\nunterminated';
    const malformedIndex = buildBlockIndex(malformed, 1);
    expect(malformedIndex.at(-1)).toMatchObject({ movable: false, confidence: 'ambiguous' });
  });

  test('nested-container targets are not indexed as top-level blocks', () => {
    const source = '- parent\n  - child\n\nAfter';
    const index = buildBlockIndex(source, 1);
    expect(index).toHaveLength(2);
    expect(source.slice(index[0]?.core.from, index[0]?.core.to)).toContain('  - child');
  });
});
