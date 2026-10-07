import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import { createTextPatch } from '../../../core/source/PatchSet.js';

export interface TaskMarker {
  readonly from: number;
  readonly to: number;
  readonly checked: boolean;
  readonly uppercase: boolean;
}

export function findTaskMarkers(source: string): readonly TaskMarker[] {
  return [...source.matchAll(/^\s*(?:[-+*]|\d+[.)])\s+(\[([ xX])\])/gmu)].map((match) => {
    const full = match[0];
    const marker = match[1] ?? '[ ]';
    const state = match[2] ?? ' ';
    const relative = full.lastIndexOf(marker);
    const from = match.index + relative;
    return { from, to: from + 3, checked: state !== ' ', uppercase: state === 'X' };
  });
}

export function planTaskToggle(
  ctx: ActionContext,
  markerFrom: number,
  checked: boolean,
  preserveUppercase = false
): ActionResult {
  const marker = ctx.source.slice(markerFrom, markerFrom + 3);
  if (!/^\[[ xX]\]$/u.test(marker)) {
    return { ok: false, reason: 'task marker is no longer available' };
  }
  const insert = checked ? (preserveUppercase && marker[1] === 'X' ? 'X' : 'x') : ' ';
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(markerFrom + 1, markerFrom + 2, insert)],
      selectionAfter: { ...ctx.selection },
      allowedRanges: [{ from: markerFrom + 1, to: markerFrom + 2 }],
      label: checked ? 'Check task' : 'Uncheck task'
    }
  };
}
