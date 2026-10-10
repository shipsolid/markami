import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import { findFencedBlocks, type FencedBlock } from '../../../core/markdown/fences.js';
import { createTextPatch } from '../../../core/source/PatchSet.js';

export { findFencedBlocks, type FencedBlock };

export function planCodeContentEdit(ctx: ActionContext, block: FencedBlock, content: string): ActionResult {
  if (!block.closed || ctx.source.slice(block.opening.from, block.opening.to).trimStart()[0] !== block.marker) {
    return { ok: false, reason: 'code fence boundaries are no longer valid' };
  }
  const longestFence = Math.max(0, ...[...content.matchAll(new RegExp(`${escapeRegex(block.marker)}+`, 'gu'))]
    .map((match) => match[0].length));
  if (longestFence >= block.markerLength && new RegExp(`^ {0,3}${escapeRegex(block.marker)}{${String(block.markerLength)},}`, 'mu').test(content)) {
    return { ok: false, reason: 'edited content would close the existing fence' };
  }
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(block.content.from, block.content.to, content)],
      selectionAfter: { anchor: block.content.from + content.length, head: block.content.from + content.length },
      allowedRanges: [{ ...block.content }],
      label: 'Edit code block'
    }
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
