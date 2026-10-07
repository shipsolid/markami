import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import { createTextPatch } from '../../../core/source/PatchSet.js';

export function planListEnter(ctx: ActionContext): ActionResult {
  if (ctx.selection.anchor !== ctx.selection.head) return { ok: false, reason: 'list continuation requires one caret' };
  const caret = ctx.selection.head;
  const lineFrom = ctx.source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const line = ctx.source.slice(lineFrom, caret);
  const match = /^(\s*)([-+*]|\d+[.)])(\s+)(.*)$/u.exec(line);
  if (match === null) return { ok: false, reason: 'caret is not in a list item' };
  const indent = match[1] ?? '';
  const marker = match[2] ?? '-';
  const whitespace = match[3] ?? ' ';
  const body = match[4] ?? '';
  if (body.trim() === '' || /^\[[ xX]\]\s*$/u.test(body)) {
    return {
      ok: true,
      edit: {
        patches: [createTextPatch(lineFrom, caret, '')],
        selectionAfter: { anchor: lineFrom, head: lineFrom },
        allowedRanges: [{ from: lineFrom, to: caret }],
        label: 'Exit list'
      }
    };
  }
  const nextMarker = incrementMarker(marker);
  const taskPrefix = /^\[[ xX]\]\s+/u.test(body) ? '[ ] ' : '';
  const insert = `\n${indent}${nextMarker}${whitespace}${taskPrefix}`;
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(caret, caret, insert)],
      selectionAfter: { anchor: caret + insert.length, head: caret + insert.length },
      allowedRanges: [{ from: caret, to: caret }],
      label: 'Continue list'
    }
  };
}

export function planListIndent(ctx: ActionContext, direction: 'indent' | 'outdent'): ActionResult {
  const caret = ctx.selection.head;
  const lineFrom = ctx.source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const lineTo = ctx.source.indexOf('\n', caret);
  const line = ctx.source.slice(lineFrom, lineTo === -1 ? ctx.source.length : lineTo);
  if (!/^\s*(?:[-+*]|\d+[.)])\s/u.test(line)) return { ok: false, reason: 'caret is not in a list item' };
  if (direction === 'indent') {
    return editIndent(ctx, lineFrom, lineFrom, '  ', 2, 'Indent list item');
  }
  const removable = /^ {1,2}/u.exec(line)?.[0].length ?? 0;
  if (removable === 0) return { ok: false, reason: 'list item is already top level' };
  return editIndent(ctx, lineFrom, lineFrom + removable, '', -removable, 'Outdent list item');
}

function editIndent(
  ctx: ActionContext,
  from: number,
  to: number,
  insert: string,
  delta: number,
  label: string
): ActionResult {
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(from, to, insert)],
      selectionAfter: { anchor: ctx.selection.anchor + delta, head: ctx.selection.head + delta },
      allowedRanges: [{ from, to }],
      label
    }
  };
}

function incrementMarker(marker: string): string {
  const match = /^(\d+)([.)])$/u.exec(marker);
  if (match === null) return marker;
  return `${String(Number(match[1]) + 1)}${match[2] ?? '.'}`;
}
