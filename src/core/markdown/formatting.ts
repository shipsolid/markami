import { createTextPatch, type TextPatch } from '../source/PatchSet.js';

export interface ActionContext {
  readonly hostVersion: number;
  readonly editorRevision: number;
  readonly selection: { readonly anchor: number; readonly head: number };
  readonly source: string;
  readonly capabilities: Readonly<Record<string, boolean>>;
}

export interface PlannedEdit {
  readonly patches: readonly TextPatch[];
  readonly selectionAfter: { readonly anchor: number; readonly head: number };
  readonly allowedRanges: readonly { readonly from: number; readonly to: number }[];
  readonly label: string;
}

export type ActionResult =
  | { readonly ok: true; readonly edit: PlannedEdit }
  | { readonly ok: false; readonly reason: string };

export type InlineFormatKind = 'strong' | 'emphasis' | 'strike' | 'code' | 'link' | 'clear';

export interface InlineFormatOptions {
  readonly href?: string;
}

export type InlineFormatState = 'active' | 'mixed' | 'inactive';

export function inlineFormatState(ctx: ActionContext, kind: Exclude<InlineFormatKind, 'clear'>): InlineFormatState {
  const range = selectionRange(ctx);
  const relevant = findWrappers(ctx.source).filter((wrapper) =>
    wrapper.kind === kind && range.from < wrapper.innerTo && range.to > wrapper.innerFrom
  );
  if (relevant.length === 0) {
    return 'inactive';
  }
  return relevant.some((wrapper) => wrapper.innerFrom <= range.from && wrapper.innerTo >= range.to)
    ? 'active'
    : 'mixed';
}

export function selectionCapabilities(
  source: string,
  selection: { readonly anchor: number; readonly head: number }
): Readonly<Record<string, boolean>> {
  const from = Math.min(selection.anchor, selection.head);
  const to = Math.max(selection.anchor, selection.head);
  const unsupported = protectedRanges(source).some((range) => from < range.to && to > range.from);
  return {
    formatting: !unsupported,
    sourceIsland: unsupported,
    mixedBlocks: /\n[ \t]*\n/u.test(source.slice(from, to))
  };
}

interface Wrapper {
  readonly kind: Exclude<InlineFormatKind, 'clear'>;
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly innerFrom: number;
  readonly innerTo: number;
  readonly openingFrom: number;
  readonly openingTo: number;
  readonly closingFrom: number;
  readonly closingTo: number;
}

const SIMPLE_WRAPPERS: readonly {
  readonly kind: Wrapper['kind'];
  readonly label: string;
  readonly pattern: RegExp;
  readonly delimiterLength: number;
}[] = [
  { kind: 'strong', label: 'bold', pattern: /\*\*([^*\n]+)\*\*|__([^_\n]+)__/gu, delimiterLength: 2 },
  { kind: 'strike', label: 'strikethrough', pattern: /~~([^~\n]+)~~/gu, delimiterLength: 2 },
  { kind: 'emphasis', label: 'italic', pattern: /(?<![*_])(?:\*([^*\n]+)\*|_([^_\n]+)_)(?![*_])/gu, delimiterLength: 1 }
];

export function planInlineFormat(
  ctx: ActionContext,
  kind: InlineFormatKind,
  options: InlineFormatOptions = {}
): ActionResult {
  const range = selectionRange(ctx);
  const invalid = validateSelection(ctx.source, range.from, range.to);
  if (invalid !== undefined) {
    return { ok: false, reason: invalid };
  }

  const wrappers = findWrappers(ctx.source);
  if (kind === 'clear') {
    return planClear(ctx, wrappers, range.from, range.to);
  }

  const containing = wrappers.find((wrapper) =>
    wrapper.kind === kind && wrapper.innerFrom <= range.from && wrapper.innerTo >= range.to
  );
  if (containing !== undefined) {
    return removeWrapper(ctx, containing);
  }

  const selected = ctx.source.slice(range.from, range.to);
  const delimiters = delimitersFor(kind, selected, options);
  if (!delimiters.ok) {
    return delimiters;
  }
  const patches = [
    createTextPatch(range.from, range.from, delimiters.open),
    createTextPatch(range.to, range.to, delimiters.close)
  ];
  const contentPadding = delimiters.openPadding.length;
  const forward = ctx.selection.anchor <= ctx.selection.head;
  const mapped = {
    anchor: range.from + delimiters.open.length + contentPadding,
    head: range.to + delimiters.open.length + contentPadding
  };
  return {
    ok: true,
    edit: {
      patches,
      selectionAfter: forward ? mapped : { anchor: mapped.head, head: mapped.anchor },
      allowedRanges: [{ from: range.from, to: range.to }],
      label: `Apply ${formatLabel(kind)}`
    }
  };
}

export function planHeading(ctx: ActionContext, level: 0 | 1 | 2 | 3 | 4 | 5 | 6): ActionResult {
  const range = selectionRange(ctx);
  const startLine = lineAt(ctx.source, range.from);
  const endProbe = range.to > range.from ? range.to - 1 : range.to;
  const endLine = lineAt(ctx.source, endProbe);
  if (startLine.from !== endLine.from || /^\s*(?:>|[-+*]\s|\d+[.)]\s|```|~~~)/u.test(startLine.text)) {
    return { ok: false, reason: 'heading conversion requires one paragraph or heading' };
  }

  const following = lineAt(ctx.source, Math.min(startLine.to + 1, ctx.source.length));
  const setext = following.from === startLine.to + 1 && /^ {0,3}(=+|-+)\s*$/u.test(following.text);
  if (setext) {
    return planSetextHeading(ctx, level, startLine, following);
  }

  const atx = /^( {0,3})(#{1,6})([ \t]+)(.*?)([ \t]+#+[ \t]*)?$/u.exec(startLine.text);
  const patches: TextPatch[] = [];
  if (atx !== null) {
    const prefixLength = (atx[1]?.length ?? 0) + (atx[2]?.length ?? 0) + (atx[3]?.length ?? 0);
    patches.push(createTextPatch(startLine.from, startLine.from + prefixLength, level === 0 ? '' : `${'#'.repeat(level)} `));
    const closing = atx[5];
    if (closing !== undefined) {
      patches.push(createTextPatch(startLine.to - closing.length, startLine.to, ''));
    }
  } else if (level > 0) {
    patches.push(createTextPatch(startLine.from, startLine.from, `${'#'.repeat(level)} `));
  } else {
    return { ok: false, reason: 'selection is already a paragraph' };
  }
  return headingResult(ctx, patches, startLine.from, startLine.to, level);
}

function planSetextHeading(
  ctx: ActionContext,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  title: Line,
  underline: Line
): ActionResult {
  let patches: TextPatch[];
  if (level === 1 || level === 2) {
    const marker = level === 1 ? '=' : '-';
    const indent = /^ */u.exec(underline.text)?.[0] ?? '';
    const width = Math.max(1, underline.text.trim().length);
    patches = [createTextPatch(underline.from, underline.to, `${indent}${marker.repeat(width)}`)];
  } else if (level === 0) {
    patches = [createTextPatch(title.to, underline.to, '')];
  } else {
    patches = [
      createTextPatch(title.from, title.from, `${'#'.repeat(level)} `),
      createTextPatch(title.to, underline.to, '')
    ];
  }
  return headingResult(ctx, patches, title.from, underline.to, level);
}

function headingResult(
  ctx: ActionContext,
  patches: readonly TextPatch[],
  from: number,
  to: number,
  level: number
): ActionResult {
  return {
    ok: true,
    edit: {
      patches,
      selectionAfter: mapSelection(ctx.selection, patches),
      allowedRanges: [{ from, to }],
      label: level === 0 ? 'Convert to paragraph' : `Convert to heading ${String(level)}`
    }
  };
}

function planClear(ctx: ActionContext, wrappers: readonly Wrapper[], from: number, to: number): ActionResult {
  const intersecting = wrappers.filter((wrapper) => from < wrapper.innerTo && to > wrapper.innerFrom);
  const unsafe = intersecting.find((wrapper) => from > wrapper.innerFrom || to < wrapper.innerTo);
  if (unsafe !== undefined) {
    return { ok: false, reason: `selection partially intersects ${unsafe.label} formatting` };
  }
  if (intersecting.length === 0) {
    return { ok: false, reason: 'selection contains no recognized inline formatting' };
  }
  const patches = intersecting.flatMap((wrapper) => wrapperPatches(wrapper));
  return {
    ok: true,
    edit: {
      patches,
      selectionAfter: mapSelection(ctx.selection, patches),
      allowedRanges: [{ from: Math.min(...intersecting.map((item) => item.from)), to: Math.max(...intersecting.map((item) => item.to)) }],
      label: 'Clear inline formatting'
    }
  };
}

function removeWrapper(ctx: ActionContext, wrapper: Wrapper): ActionResult {
  const patches = wrapperPatches(wrapper);
  return {
    ok: true,
    edit: {
      patches,
      selectionAfter: mapSelection(ctx.selection, patches),
      allowedRanges: [{ from: wrapper.from, to: wrapper.to }],
      label: `Remove ${wrapper.label}`
    }
  };
}

function wrapperPatches(wrapper: Wrapper): TextPatch[] {
  return [
    createTextPatch(wrapper.openingFrom, wrapper.openingTo, ''),
    createTextPatch(wrapper.closingFrom, wrapper.closingTo, '')
  ];
}

function findWrappers(source: string): Wrapper[] {
  const wrappers: Wrapper[] = [];
  for (const descriptor of SIMPLE_WRAPPERS) {
    for (const match of source.matchAll(descriptor.pattern)) {
      const from = match.index;
      const to = from + match[0].length;
      wrappers.push({
        kind: descriptor.kind,
        label: descriptor.label,
        from,
        to,
        innerFrom: from + descriptor.delimiterLength,
        innerTo: to - descriptor.delimiterLength,
        openingFrom: from,
        openingTo: from + descriptor.delimiterLength,
        closingFrom: to - descriptor.delimiterLength,
        closingTo: to
      });
    }
  }
  for (const match of source.matchAll(/(`+)([^\n]*?)\1/gu)) {
    const from = match.index;
    const delimiterLength = match[1]?.length ?? 1;
    const to = from + match[0].length;
    wrappers.push({
      kind: 'code', label: 'inline code', from, to,
      innerFrom: from + delimiterLength, innerTo: to - delimiterLength,
      openingFrom: from, openingTo: from + delimiterLength,
      closingFrom: to - delimiterLength, closingTo: to
    });
  }
  for (const match of source.matchAll(/\[([^\]\n]+)\]\(([^)\n]*)\)/gu)) {
    const from = match.index;
    const labelLength = match[1]?.length ?? 0;
    const to = from + match[0].length;
    wrappers.push({
      kind: 'link', label: 'link', from, to,
      innerFrom: from + 1, innerTo: from + 1 + labelLength,
      openingFrom: from, openingTo: from + 1,
      closingFrom: from + 1 + labelLength, closingTo: to
    });
  }
  return wrappers.sort((left, right) => left.from - right.from || right.to - left.to);
}

function protectedRanges(source: string): readonly { readonly from: number; readonly to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  const lines = source.split('\n');
  let offset = 0;
  let openFence: { from: number; marker: '`' | '~'; length: number } | undefined;
  for (const [index, line] of lines.entries()) {
    const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fence !== null) {
      const token = fence[1] ?? '```';
      const marker = token[0] as '`' | '~';
      if (openFence === undefined) {
        openFence = { from: offset, marker, length: token.length };
      } else if (openFence.marker === marker && token.length >= openFence.length) {
        ranges.push({ from: openFence.from, to: offset + line.length });
        openFence = undefined;
      }
    }
    if (index < lines.length - 1) {
      offset += line.length + 1;
    }
  }
  if (openFence !== undefined) {
    ranges.push({ from: openFence.from, to: source.length });
  }
  const frontmatter = /^(---|\+\+\+)\n[\s\S]*?\n\1(?:\n|$)/u.exec(source);
  if (frontmatter !== null) {
    ranges.push({ from: 0, to: frontmatter[0].length });
  }
  for (const wrapper of findWrappers(source)) {
    if (wrapper.kind === 'code') {
      ranges.push({ from: wrapper.from, to: wrapper.to });
    }
  }
  return ranges;
}

function delimitersFor(
  kind: Exclude<InlineFormatKind, 'clear'>,
  selected: string,
  options: InlineFormatOptions
): { readonly ok: true; readonly open: string; readonly close: string; readonly openPadding: string } | { readonly ok: false; readonly reason: string } {
  if (kind === 'strong') return { ok: true, open: '**', close: '**', openPadding: '' };
  if (kind === 'emphasis') return { ok: true, open: '*', close: '*', openPadding: '' };
  if (kind === 'strike') return { ok: true, open: '~~', close: '~~', openPadding: '' };
  if (kind === 'code') {
    const longest = Math.max(0, ...[...selected.matchAll(/`+/gu)].map((match) => match[0].length));
    const fence = '`'.repeat(longest + 1);
    return { ok: true, open: fence, close: fence, openPadding: '' };
  }
  const href = options.href ?? 'https://';
  if (/^\s*(?:javascript|vbscript|data):/iu.test(href)) {
    return { ok: false, reason: 'link destination uses an unsafe scheme' };
  }
  const escapedHref = href.replaceAll(' ', '%20').replaceAll(')', '\\)');
  return { ok: true, open: '[', close: `](${escapedHref})`, openPadding: '' };
}

function validateSelection(source: string, from: number, to: number): string | undefined {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > source.length) {
    return 'selection is outside the current source';
  }
  if (source.slice(from, to).includes('\n')) {
    return 'inline formatting requires a single-line selection';
  }
  return undefined;
}

function selectionRange(ctx: ActionContext): { readonly from: number; readonly to: number } {
  return {
    from: Math.min(ctx.selection.anchor, ctx.selection.head),
    to: Math.max(ctx.selection.anchor, ctx.selection.head)
  };
}

function formatLabel(kind: Exclude<InlineFormatKind, 'clear'>): string {
  return { strong: 'bold', emphasis: 'italic', strike: 'strikethrough', code: 'inline code', link: 'link' }[kind];
}

function mapSelection(
  selection: { readonly anchor: number; readonly head: number },
  patches: readonly TextPatch[]
): { readonly anchor: number; readonly head: number } {
  return {
    anchor: mapPosition(selection.anchor, patches),
    head: mapPosition(selection.head, patches)
  };
}

function mapPosition(position: number, patches: readonly TextPatch[]): number {
  let mapped = position;
  for (const patch of [...patches].sort((left, right) => Number(left.from) - Number(right.from))) {
    const from = Number(patch.from);
    const to = Number(patch.to);
    if (to <= position) {
      mapped += patch.insert.length - (to - from);
    } else if (from < position) {
      mapped = from + patch.insert.length;
    }
  }
  return mapped;
}

interface Line {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

function lineAt(source: string, position: number): Line {
  const bounded = Math.max(0, Math.min(position, source.length));
  const before = source.lastIndexOf('\n', Math.max(0, bounded - 1));
  const from = before + 1;
  const next = source.indexOf('\n', bounded);
  const to = next === -1 ? source.length : next;
  return { from, to, text: source.slice(from, to) };
}
