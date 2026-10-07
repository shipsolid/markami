import { createTextPatch, type TextPatch } from './Patch.js';

export type ValidationResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

interface IndexedPatch {
  readonly patch: TextPatch;
  readonly index: number;
}

export { createTextPatch, type TextPatch } from './Patch.js';

export function validatePatchSet(source: string, patches: readonly TextPatch[]): ValidationResult {
  for (const patch of patches) {
    const from = Number(patch.from);
    const to = Number(patch.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return { ok: false, reason: 'patch offsets must be integers' };
    }
    if (from < 0 || to < 0) {
      return { ok: false, reason: 'patch offsets must be non-negative' };
    }
    if (from > to) {
      return { ok: false, reason: 'patch range is reversed' };
    }
    if (to > source.length) {
      return { ok: false, reason: 'patch range is outside source' };
    }
  }

  const sorted = indexedAscending(patches);
  let occupiedUntil = 0;
  let previousStart = -1;
  let previousConsumed = false;
  for (const { patch } of sorted) {
    const from = Number(patch.from);
    const to = Number(patch.to);
    const consumes = to > from;
    if (from < occupiedUntil || (from === previousStart && (consumes || previousConsumed))) {
      return { ok: false, reason: 'patches overlap' };
    }
    occupiedUntil = Math.max(occupiedUntil, to);
    previousStart = from;
    previousConsumed = consumes;
  }
  return { ok: true };
}

export function applyPatchSet(source: string, patches: readonly TextPatch[]): string {
  const validation = validatePatchSet(source, patches);
  if (!validation.ok) {
    throw new RangeError(validation.reason);
  }

  let result = source;
  const descending = patches
    .map((patch, index) => ({ patch, index }))
    .sort((left, right) => Number(right.patch.from) - Number(left.patch.from) || right.index - left.index);
  for (const { patch } of descending) {
    result = result.slice(0, Number(patch.from)) + patch.insert + result.slice(Number(patch.to));
  }
  return result;
}

export function invertPatchSet(source: string, patches: readonly TextPatch[]): readonly TextPatch[] {
  const validation = validatePatchSet(source, patches);
  if (!validation.ok) {
    throw new RangeError(validation.reason);
  }

  let delta = 0;
  return indexedAscending(patches).map(({ patch }) => {
    const originalFrom = Number(patch.from);
    const originalTo = Number(patch.to);
    const editedFrom = originalFrom + delta;
    const inverse = createTextPatch(
      editedFrom,
      editedFrom + patch.insert.length,
      source.slice(originalFrom, originalTo)
    );
    delta += patch.insert.length - (originalTo - originalFrom);
    return inverse;
  });
}

function indexedAscending(patches: readonly TextPatch[]): IndexedPatch[] {
  return patches
    .map((patch, index) => ({ patch, index }))
    .sort((left, right) => Number(left.patch.from) - Number(right.patch.from) || left.index - right.index);
}
