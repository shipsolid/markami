import type { ActionResult } from './formatting.js';
import { buildBlockIndex, type MovableBlock } from './blockIndex.js';
import { applyPatchSet, createTextPatch, type TextPatch } from '../source/PatchSet.js';

export function planBlockMove(
  source: string,
  blocks: readonly MovableBlock[],
  blockId: string,
  targetIndex: number
): ActionResult {
  const sourceIndex = blocks.findIndex((block) => block.id === blockId);
  const block = blocks[sourceIndex];
  if (block === undefined) return { ok: false, reason: 'block is no longer available' };
  if (block.pinned) return { ok: false, reason: 'frontmatter is pinned' };
  if (!block.movable || block.confidence !== 'exact') {
    return { ok: false, reason: block.reason ?? 'block boundaries are ambiguous' };
  }
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= blocks.length) {
    return { ok: false, reason: 'move target is not a top-level block' };
  }
  if (blocks[targetIndex]?.pinned === true) {
    return { ok: false, reason: 'frontmatter must remain first' };
  }
  if (sourceIndex === targetIndex) {
    return moveResult([], block.core.from, block.core.from, block.core.to, 'Block already at target');
  }

  const core = source.slice(block.core.from, block.core.to);
  let patches: readonly TextPatch[];
  let finalCoreFrom: number;
  let affectedFrom: number;
  let affectedTo: number;
  if (targetIndex < sourceIndex) {
    const previous = blocks[sourceIndex - 1];
    const target = blocks[targetIndex];
    if (previous === undefined || target === undefined) return { ok: false, reason: 'move target is unavailable' };
    const separator = source.slice(previous.core.to, block.core.from);
    patches = [
      createTextPatch(target.core.from, target.core.from, core + separator),
      createTextPatch(previous.core.to, block.core.to, '')
    ];
    finalCoreFrom = target.core.from;
    affectedFrom = target.core.from;
    affectedTo = block.core.to;
  } else {
    const next = blocks[sourceIndex + 1];
    const target = blocks[targetIndex];
    if (next === undefined || target === undefined) return { ok: false, reason: 'move target is unavailable' };
    const separator = source.slice(block.core.to, next.core.from);
    const deletedLength = next.core.from - block.core.from;
    patches = [
      createTextPatch(block.core.from, next.core.from, ''),
      createTextPatch(target.core.to, target.core.to, separator + core)
    ];
    finalCoreFrom = target.core.to - deletedLength + separator.length;
    affectedFrom = block.core.from;
    affectedTo = target.core.to;
  }

  const edited = applyPatchSet(source, patches);
  const reparsed = buildBlockIndex(edited, block.version + 1);
  const expected = [...blocks.map((item) => source.slice(item.core.from, item.core.to))];
  const [moved] = expected.splice(sourceIndex, 1);
  if (moved === undefined) return { ok: false, reason: 'block is no longer available' };
  expected.splice(targetIndex, 0, moved);
  const actual = reparsed.map((item) => edited.slice(item.core.from, item.core.to));
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    return { ok: false, reason: 'move would change Markdown block boundaries' };
  }
  return moveResult(patches, finalCoreFrom, affectedFrom, affectedTo, 'Move block');
}

function moveResult(
  patches: readonly TextPatch[],
  caret: number,
  from: number,
  to: number,
  label: string
): ActionResult {
  return {
    ok: true,
    edit: {
      patches,
      selectionAfter: { anchor: caret, head: caret },
      allowedRanges: [{ from, to }],
      label
    }
  };
}
