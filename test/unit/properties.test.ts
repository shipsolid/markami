import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { buildBlockIndex } from '../../src/core/markdown/blockIndex.js';
import { planBlockMove } from '../../src/core/markdown/moveBlock.js';
import { buildProjectionPlan } from '../../src/core/markdown/syntax.js';
import { createCoordinateMap, editorOffset } from '../../src/core/source/CoordinateMap.js';
import { applyPatchSet, createTextPatch, invertPatchSet } from '../../src/core/source/PatchSet.js';
import { PatchQueue } from '../../src/webview/bridge/patchQueue.js';

const seed = Number(process.env.FC_SEED ?? 0x4d41524b);
const options = { seed, numRuns: 200 } as const;
const character = fc.constantFrom('a', 'Z', '0', ' ', '\t', '\n', '\r', '😀', 'e\u0301', '*', '_', '|');
const text = fc.array(character, { maxLength: 80 }).map((characters) => characters.join(''));
const insert = fc.array(character, { maxLength: 20 }).map((characters) => characters.join(''));

describe(`source invariants (fast-check seed ${String(seed)})`, () => {
  test('patch inverse restores random EOL and Unicode source exactly', () => {
    fc.assert(fc.property(text, insert, fc.nat(), fc.nat(), (source, replacement, left, right) => {
      const first = left % (source.length + 1);
      const second = right % (source.length + 1);
      const from = Math.min(first, second);
      const to = Math.max(first, second);
      const patches = [createTextPatch(from, to, replacement)];
      const edited = applyPatchSet(source, patches);

      expect(edited.slice(0, from)).toBe(source.slice(0, from));
      expect(edited.slice(from + replacement.length)).toBe(source.slice(to));
      expect(applyPatchSet(edited, invertPatchSet(source, patches))).toBe(source);
    }), options);
  });

  test('projection is deterministic, pure, and no-touch', () => {
    fc.assert(fc.property(text, (source) => {
      const before = source;
      const first = buildProjectionPlan(source);
      const second = buildProjectionPlan(source);

      expect(source).toBe(before);
      expect(second).toEqual(first);
      expect(applyPatchSet(source, [])).toBe(source);
    }), options);
  });

  test('coordinate normalization round-trips every editor offset', () => {
    fc.assert(fc.property(text, (source) => {
      const map = createCoordinateMap(source);
      for (let offset = 0; offset <= map.editorText.length; offset += 1) {
        expect(Number(map.toEditor(map.toHost(editorOffset(offset))))).toBe(offset);
      }
    }), options);
  });

  test('duplicate external delivery is idempotent', () => {
    fc.assert(fc.property(text, insert, (source, addition) => {
      const queue = new PatchQueue('view', 1, source, 1, () => undefined);
      const patch = createTextPatch(source.length, source.length, addition);

      queue.applyExternal([patch], 1, 2);
      const once = queue.acknowledgedText;
      queue.applyExternal([patch], 1, 2);

      expect(queue.state).toBe('synced');
      expect(queue.acknowledgedText).toBe(once);
    }), options);
  });

  test('external changes reject every pending local overlap', () => {
    fc.assert(fc.property(text, insert, insert, (source, local, external) => {
      const queue = new PatchQueue('view', 1, source, 1, () => undefined);
      queue.enqueueLocal([createTextPatch(0, 0, local)]);

      queue.applyExternal([createTextPatch(source.length, source.length, external)], 1, 2);

      expect(queue.state).toBe('conflict');
      expect(queue.optimisticText).toBe(`${local}${source}`);
    }), options);
  });

  test('block moves preserve every generated block core and exact undo', () => {
    const safeWord = fc.stringMatching(/^[A-Za-z0-9]{1,12}$/u);
    fc.assert(fc.property(
      fc.array(safeWord, { minLength: 2, maxLength: 8 }),
      fc.nat(),
      fc.nat(),
      (words, fromValue, toValue) => {
        const source = words.map((word, index) => `${word}-${String(index)}`).join('\r\n\r\n');
        const blocks = buildBlockIndex(source, 1);
        const from = fromValue % blocks.length;
        const to = toValue % blocks.length;
        const block = blocks[from];
        if (block === undefined) throw new Error('generated block is missing');
        const result = planBlockMove(source, blocks, block.id, to);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const edited = applyPatchSet(source, result.edit.patches);
        const expected = [...blocks.map((item) => source.slice(item.core.from, item.core.to))];
        const [moved] = expected.splice(from, 1);
        if (moved !== undefined) expected.splice(to, 0, moved);
        expect(buildBlockIndex(edited, 2).map((item) => edited.slice(item.core.from, item.core.to))).toEqual(expected);
        expect(applyPatchSet(edited, invertPatchSet(source, result.edit.patches))).toBe(source);
      }
    ), options);
  });
});
