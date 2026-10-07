import { describe, expect, test } from 'vitest';
import {
  applyPatchSet,
  createTextPatch,
  invertPatchSet,
  validatePatchSet
} from '../../src/core/source/PatchSet.js';

describe('source patches', () => {
  test('crlf_offsets_edit_final_word', () => {
    const source = 'a\r\nb\r\nc';
    const patches = [createTextPatch(6, 7, 'collector')];

    expect(validatePatchSet(source, patches)).toEqual({ ok: true });
    expect(applyPatchSet(source, patches)).toBe('a\r\nb\r\ncollector');
  });

  test('preserves every untouched raw source character', () => {
    const source = '😀 first\r\n\r\ne\u0301 final';
    const patches = [createTextPatch(10, 10, 'inserted\r\n')];

    const edited = applyPatchSet(source, patches);

    expect(edited).toBe('😀 first\r\ninserted\r\n\r\ne\u0301 final');
    expect(applyPatchSet(edited, invertPatchSet(source, patches))).toBe(source);
  });

  test('applies non-overlapping patches against the same pre-edit text', () => {
    const source = 'alpha beta gamma';
    const patches = [
      createTextPatch(0, 5, 'A'),
      createTextPatch(6, 10, 'B'),
      createTextPatch(16, 16, '!')
    ];

    expect(applyPatchSet(source, patches)).toBe('A B gamma!');
    expect(applyPatchSet(applyPatchSet(source, patches), invertPatchSet(source, patches))).toBe(source);
  });

  test('keeps same-position insertions in caller order', () => {
    const patches = [createTextPatch(1, 1, 'A'), createTextPatch(1, 1, 'B')];

    expect(applyPatchSet('xy', patches)).toBe('xABy');
  });

  test.each([
    ['fractional', createTextPatch(0.5, 1, '')],
    ['negative', createTextPatch(-1, 0, '')],
    ['reversed', createTextPatch(2, 1, '')],
    ['out-of-bounds', createTextPatch(0, 4, '')]
  ])('rejects %s ranges before mutation', (_label, patch) => {
    const result = validatePatchSet('abc', [patch]);

    expect(result.ok).toBe(false);
    expect(() => applyPatchSet('abc', [patch])).toThrow();
  });

  test('rejects overlapping source ranges', () => {
    const patches = [createTextPatch(0, 2, 'x'), createTextPatch(1, 3, 'y')];

    expect(validatePatchSet('abc', patches)).toEqual({ ok: false, reason: 'patches overlap' });
    expect(() => applyPatchSet('abc', patches)).toThrow(/patches overlap/u);
  });

  test('leaves source byte-for-byte equivalent for an empty patch set', () => {
    const source = '\ufeff---\r\ntitle: "A"\r\n---';

    expect(applyPatchSet(source, [])).toBe(source);
  });
});
