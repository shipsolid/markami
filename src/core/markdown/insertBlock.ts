import type { ActionContext, ActionResult } from './formatting.js';
import { createTextPatch } from '../source/PatchSet.js';

export type InsertBlockKind =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bullet'
  | 'numbered'
  | 'task'
  | 'quote'
  | 'divider'
  | 'code'
  | 'table'
  | 'mermaid'
  | 'math'
  | 'image'
  | 'raw';

export interface InsertBlockArgs {
  readonly language?: string;
  readonly imageMarkdown?: string;
}

interface Template {
  readonly source: string;
  readonly cursor: number;
  readonly label: string;
}

export function planInsertBlock(
  ctx: ActionContext,
  kind: InsertBlockKind,
  args: InsertBlockArgs = {}
): ActionResult {
  const from = Math.min(ctx.selection.anchor, ctx.selection.head);
  const to = Math.max(ctx.selection.anchor, ctx.selection.head);
  if (!isEmptyTopLevelParagraph(ctx.source, from, to)) {
    return { ok: false, reason: 'block insertion requires an empty top-level paragraph' };
  }
  if (kind === 'math' && ctx.capabilities.math === false) {
    return { ok: false, reason: 'math insertion is disabled' };
  }
  const template = templateFor(kind, args);
  if (!template.ok) {
    return template;
  }
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(from, to, template.value.source)],
      selectionAfter: {
        anchor: from + template.value.cursor,
        head: from + template.value.cursor
      },
      allowedRanges: [{ from, to }],
      label: template.value.label
    }
  };
}

function templateFor(
  kind: InsertBlockKind,
  args: InsertBlockArgs
): { readonly ok: true; readonly value: Template } | { readonly ok: false; readonly reason: string } {
  if (kind.startsWith('heading')) {
    const level = Number(kind.slice('heading'.length));
    const source = `${'#'.repeat(level)} `;
    return success(source, source.length, `Insert heading ${String(level)}`);
  }
  if (kind === 'text' || kind === 'raw') return success('', 0, kind === 'raw' ? 'Reveal raw Markdown' : 'Insert text');
  if (kind === 'bullet') return success('- ', 2, 'Insert bullet list');
  if (kind === 'numbered') return success('1. ', 3, 'Insert numbered list');
  if (kind === 'task') return success('- [ ] ', 6, 'Insert task list');
  if (kind === 'quote') return success('> ', 2, 'Insert quote');
  if (kind === 'divider') return success('---', 3, 'Insert divider');
  if (kind === 'code') {
    const language = args.language ?? '';
    if (!/^[\w+-]*$/u.test(language)) {
      return { ok: false, reason: 'code language contains unsupported characters' };
    }
    const opening = `\`\`\`${language}\n`;
    return success(`${opening}\n\`\`\``, opening.length, 'Insert code block');
  }
  if (kind === 'table') {
    const source = '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |';
    return success(source, source.lastIndexOf('|  |') + 2, 'Insert table');
  }
  if (kind === 'mermaid') {
    const opening = '```mermaid\n';
    const body = 'flowchart TD\n  A --> B';
    return success(`${opening}${body}\n\`\`\``, opening.length, 'Insert Mermaid block');
  }
  if (kind === 'math') {
    return success('$$\n\n$$', 3, 'Insert math block');
  }
  if (args.imageMarkdown === undefined) {
    return { ok: false, reason: 'image insertion requires the host image service' };
  }
  if (!/^!\[[^\]\n]*\]\([^\n]+\)$/u.test(args.imageMarkdown)) {
    return { ok: false, reason: 'host image service returned invalid Markdown' };
  }
  return success(args.imageMarkdown, args.imageMarkdown.length, 'Insert image');
}

function success(source: string, cursor: number, label: string): { readonly ok: true; readonly value: Template } {
  return { ok: true, value: { source, cursor, label } };
}

function isEmptyTopLevelParagraph(source: string, from: number, to: number): boolean {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > to || to > source.length) {
    return false;
  }
  const lineFrom = source.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const nextNewline = source.indexOf('\n', to);
  const lineTo = nextNewline === -1 ? source.length : nextNewline;
  const before = source.slice(lineFrom, from);
  const selected = source.slice(from, to);
  const after = source.slice(to, lineTo);
  return before.trim() === '' && after.trim() === '' && (selected === '' || /^\/[\p{L}\p{N}_-]*$/u.test(selected));
}
