import { markdownLanguage } from '@codemirror/lang-markdown';

import { findFencedBlocks } from './fences.js';

export type SyntaxKind = 'strong' | 'emphasis' | 'strike' | 'inlineCode' |
  'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' |
  'quote' | 'list' | 'divider';

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface MarkDecoration extends SourceRange {
  readonly kind: 'strong' | 'emphasis' | 'strike' | 'inlineCode';
}

export type HiddenToken = SourceRange;

export interface LineStyle extends SourceRange {
  readonly kind: Exclude<SyntaxKind, 'strong' | 'emphasis' | 'strike' | 'inlineCode'>;
}

export interface WidgetSpec extends SourceRange {
  readonly kind: string;
}

export interface SourceIslandSpec extends SourceRange {
  readonly reason: string;
}

export interface ProjectionPlan {
  readonly version: 1;
  readonly marks: readonly MarkDecoration[];
  readonly hiddenTokens: readonly HiddenToken[];
  readonly lineStyles: readonly LineStyle[];
  readonly widgets: readonly WidgetSpec[];
  readonly sourceIslands: readonly SourceIslandSpec[];
}

export interface ProjectionOptions {
  readonly selection?: SourceRange;
  readonly semanticRanges?: readonly (SourceRange & { readonly kind: string })[];
  readonly sourceIslands?: readonly SourceIslandSpec[];
}

export function buildProjectionPlan(source: string, options: ProjectionOptions = {}): ProjectionPlan {
  const marks: MarkDecoration[] = [];
  const hiddenTokens: HiddenToken[] = [];
  const lineStyles: LineStyle[] = [];
  const sourceIslands = mergeIslands([...findUnterminatedFence(source), ...(options.sourceIslands ?? [])]);
  // Code is literal: a shell comment must not become a heading and `**` must not become bold.
  const fenced = findFencedBlocks(source);

  collectLines(source, lineStyles, hiddenTokens, options.selection, sourceIslands, fenced);
  collectInline(source, /\*\*([^*\n]+)\*\*/gu, 'strong', 2, marks, hiddenTokens, options.selection, sourceIslands, fenced);
  collectInline(source, /~~([^~\n]+)~~/gu, 'strike', 2, marks, hiddenTokens, options.selection, sourceIslands, fenced);
  collectInline(source, /(?<!\*)\*([^*\n]+)\*(?!\*)/gu, 'emphasis', 1, marks, hiddenTokens, options.selection, sourceIslands, fenced);
  collectInline(source, /`([^`\n]+)`/gu, 'inlineCode', 1, marks, hiddenTokens, options.selection, sourceIslands, fenced);

  if (options.semanticRanges !== undefined && disagrees(marks, options.semanticRanges)) {
    return emptyWithIsland(source.length, 'parser disagreement');
  }
  return { version: 1, marks, hiddenTokens, lineStyles, widgets: [], sourceIslands };
}

export interface RawHtmlRange extends SourceRange {
  readonly nodeType: 'block' | 'tag' | 'comment';
  readonly source: string;
}

export function findRawHtmlRanges(source: string): readonly RawHtmlRange[] {
  return scanMarkdownRanges(source).html;
}

function scanMarkdownRanges(source: string): {
  readonly code: readonly SourceRange[];
  readonly html: readonly RawHtmlRange[];
} {
  const code: SourceRange[] = [];
  const ranges: RawHtmlRange[] = [];
  markdownLanguage.parser.parse(source).cursor().iterate((node) => {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') {
      code.push({ from: node.from, to: node.to });
    }
    const nodeType = node.name === 'HTMLBlock'
      ? 'block'
      : node.name === 'HTMLTag'
        ? 'tag'
        : node.name === 'CommentBlock'
          ? 'comment'
          : undefined;
    if (nodeType !== undefined) {
      ranges.push({ from: node.from, to: node.to, nodeType, source: source.slice(node.from, node.to) });
    }
  });
  return { code, html: ranges };
}

export function findUnknownSyntaxRanges(source: string): readonly SourceIslandSpec[] {
  const ranges: SourceIslandSpec[] = [];
  const markdownRanges = scanMarkdownRanges(source);
  const protectedRanges = markdownRanges.code;
  for (const match of source.matchAll(/^:::[\w-]+[^\r\n]*(?:\r\n|\r|\n)/gmu)) {
    const endPattern = /^:::\s*$/gmu;
    endPattern.lastIndex = match.index + match[0].length;
    const closing = endPattern.exec(source);
    const to = closing === null ? source.length : closing.index + closing[0].length;
    const range = { from: match.index, to, reason: 'custom directive' } as const;
    if (!protectedRanges.some((candidate) => overlaps(candidate, range))) ranges.push(range);
  }
  for (const match of source.matchAll(/^(?:import|export)\s[^\r\n]*(?:\r\n|\r|\n|$)/gmu)) {
    const range = { from: match.index, to: match.index + match[0].length, reason: 'MDX' } as const;
    if (!protectedRanges.some((candidate) => overlaps(candidate, range))) ranges.push(range);
  }
  for (const html of markdownRanges.html) {
    if (/^<\/?[A-Z]/u.test(html.source.trimStart())) {
      ranges.push({ from: html.from, to: html.to, reason: 'MDX' });
    }
  }
  return mergeIslands(ranges);
}

function collectLines(
  source: string,
  styles: LineStyle[],
  hidden: HiddenToken[],
  selection: SourceRange | undefined,
  islands: readonly SourceIslandSpec[],
  fenced: readonly SourceRange[]
): void {
  let offset = 0;
  for (const line of source.split('\n')) {
    const end = offset + line.length;
    if (fenced.some((block) => offset >= block.from && offset <= block.to)) {
      offset = end + 1;
      continue;
    }
    const heading = /^(#{1,6})\s/u.exec(line);
    const quote = /^>\s?/u.exec(line);
    const list = /^\s*(?:[-+*]|\d+[.)])\s/u.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length ?? 1;
      styles.push({ from: offset, to: end, kind: `heading${String(level)}` as LineStyle['kind'] });
      maybeHide(offset, offset + heading[0].length, offset, end, hidden, selection, islands);
    } else if (quote !== null) {
      styles.push({ from: offset, to: end, kind: 'quote' });
      maybeHide(offset, offset + quote[0].length, offset, end, hidden, selection, islands);
    } else if (list !== null) {
      styles.push({ from: offset, to: end, kind: 'list' });
    } else if (/^\s*(?:---+|___+|\*\*\*+)\s*$/u.test(line)) {
      styles.push({ from: offset, to: end, kind: 'divider' });
      maybeHide(offset, end, offset, end, hidden, selection, islands);
    }
    offset = end + 1;
  }
}

function collectInline(
  source: string,
  pattern: RegExp,
  kind: MarkDecoration['kind'],
  delimiter: number,
  marks: MarkDecoration[],
  hidden: HiddenToken[],
  selection: SourceRange | undefined,
  islands: readonly SourceIslandSpec[],
  fenced: readonly SourceRange[]
): void {
  for (const match of source.matchAll(pattern)) {
    const from = match.index;
    const to = from + match[0].length;
    if (islands.some((island) => overlaps({ from, to }, island)) || fenced.some((block) => overlaps({ from, to }, block))) {
      continue;
    }
    marks.push({ from: from + delimiter, to: to - delimiter, kind });
    if (!touchesSelection({ from, to }, selection)) {
      hidden.push({ from, to: from + delimiter }, { from: to - delimiter, to });
    }
  }
}

function findUnterminatedFence(source: string): SourceIslandSpec[] {
  const fence = /^(?:```|~~~)/gmu;
  const matches = [...source.matchAll(fence)];
  if (matches.length % 2 === 0) {
    return [];
  }
  return [{ from: matches.at(-1)?.index ?? 0, to: source.length, reason: 'unterminated fence' }];
}

function maybeHide(
  from: number,
  to: number,
  blockFrom: number,
  blockTo: number,
  hidden: HiddenToken[],
  selection: SourceRange | undefined,
  islands: readonly SourceIslandSpec[]
): void {
  if (!touchesSelection({ from: blockFrom, to: blockTo }, selection) && !islands.some((island) => overlaps({ from, to }, island))) {
    hidden.push({ from, to });
  }
}

function touchesSelection(range: SourceRange, selection: SourceRange | undefined): boolean {
  return selection !== undefined && selection.from <= range.to && selection.to >= range.from;
}

function overlaps(left: SourceRange, right: SourceRange): boolean {
  return left.from < right.to && right.from < left.to;
}

function disagrees(
  interaction: readonly MarkDecoration[],
  semantic: readonly (SourceRange & { readonly kind: string })[]
): boolean {
  return interaction.length !== semantic.length || interaction.some((item, index) => {
    const other = semantic[index];
    return other === undefined || item.from !== other.from || item.to !== other.to || item.kind !== other.kind;
  });
}

function emptyWithIsland(length: number, reason: string): ProjectionPlan {
  return {
    version: 1,
    marks: [],
    hiddenTokens: [],
    lineStyles: [],
    widgets: [],
    sourceIslands: [{ from: 0, to: length, reason }]
  };
}

function mergeIslands(islands: readonly SourceIslandSpec[]): SourceIslandSpec[] {
  const sorted = [...islands].sort((left, right) => left.from - right.from || right.to - left.to);
  const merged: SourceIslandSpec[] = [];
  for (const island of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && island.from >= previous.from && island.to <= previous.to) continue;
    merged.push(island);
  }
  return merged;
}
