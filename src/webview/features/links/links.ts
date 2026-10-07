import { EditorView } from '@codemirror/view';
import { createTextPatch } from '../../../core/source/PatchSet.js';
import type { ActionResult } from '../../../core/markdown/formatting.js';
import { isEscapedMarkdown, isProtectedResourceRange, protectedResourceRanges } from '../../../core/markdown/resourceRanges.js';

export interface MarkdownLink {
  readonly form: 'inline' | 'reference';
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly labelRange: { readonly from: number; readonly to: number };
  readonly destination: string;
  readonly destinationRange: { readonly from: number; readonly to: number };
  readonly reference?: string;
}

interface ReferenceDefinition {
  readonly destination: string;
  readonly destinationRange: { readonly from: number; readonly to: number };
}

export function findLinks(source: string): readonly MarkdownLink[] {
  const protectedRanges = protectedResourceRanges(source);
  const definitions = new Map<string, ReferenceDefinition>();
  const definitionPattern = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|(\S+))/gmu;
  for (const match of source.matchAll(definitionPattern)) {
    if (isProtectedResourceRange(protectedRanges, match.index, match.index + match[0].length)) continue;
    const reference = match[1];
    const destination = match[2] ?? match[3];
    if (reference === undefined || destination === undefined) continue;
    const destinationOffset = match[0].indexOf(destination);
    definitions.set(normalizeReference(reference), {
      destination,
      destinationRange: { from: match.index + destinationOffset, to: match.index + destinationOffset + destination.length }
    });
  }

  const links: MarkdownLink[] = [];
  const inlinePattern = /(?<!!)\[([^\]\n]+)\]\((?:<([^>\n]+)>|([^\s)]+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu;
  for (const match of source.matchAll(inlinePattern)) {
    if (isEscapedMarkdown(source, match.index) || isProtectedResourceRange(protectedRanges, match.index, match.index + match[0].length)) continue;
    const label = match[1];
    const destination = match[2] ?? match[3];
    if (label === undefined || destination === undefined) continue;
    const labelOffset = match[0].indexOf(label);
    const destinationOffset = match[0].indexOf(destination, labelOffset + label.length);
    links.push({
      form: 'inline', from: match.index, to: match.index + match[0].length, label, destination,
      labelRange: { from: match.index + labelOffset, to: match.index + labelOffset + label.length },
      destinationRange: { from: match.index + destinationOffset, to: match.index + destinationOffset + destination.length }
    });
  }

  const occupied = links.map((link) => ({ from: link.from, to: link.to }));
  const referencePattern = /(?<!!)\[([^\]\n]+)\]\[([^\]\n]*)\]/gu;
  for (const match of source.matchAll(referencePattern)) {
    if (isEscapedMarkdown(source, match.index) || isProtectedResourceRange(protectedRanges, match.index, match.index + match[0].length)) continue;
    const label = match[1];
    const reference = match[2] || label;
    if (label === undefined || reference === undefined) continue;
    const definition = definitions.get(normalizeReference(reference));
    if (definition === undefined) continue;
    const labelOffset = match[0].indexOf(label);
    links.push({
      form: 'reference', from: match.index, to: match.index + match[0].length, label, reference,
      destination: definition.destination,
      labelRange: { from: match.index + labelOffset, to: match.index + labelOffset + label.length },
      destinationRange: definition.destinationRange
    });
    occupied.push({ from: match.index, to: match.index + match[0].length });
  }

  const shortcutPattern = /(?<!!)\[([^\]\n]+)\](?!\[|\(|:)/gu;
  for (const match of source.matchAll(shortcutPattern)) {
    const to = match.index + match[0].length;
    if (occupied.some((range) => match.index < range.to && to > range.from) ||
      isEscapedMarkdown(source, match.index) ||
      isProtectedResourceRange(protectedRanges, match.index, to)) continue;
    const label = match[1];
    if (label === undefined) continue;
    const definition = definitions.get(normalizeReference(label));
    if (definition === undefined) continue;
    const labelOffset = match[0].indexOf(label);
    links.push({
      form: 'reference', from: match.index, to, label, reference: label,
      destination: definition.destination,
      labelRange: { from: match.index + labelOffset, to: match.index + labelOffset + label.length },
      destinationRange: definition.destinationRange
    });
  }
  return links.sort((left, right) => left.from - right.from);
}

export function githubSlug(heading: string, existing: readonly string[]): string {
  const base = heading.trim().toLocaleLowerCase()
    .replaceAll(/<[^>]*>/gu, '')
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, '')
    .replaceAll(/[\s_]+/gu, '-')
    .replaceAll(/-+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let suffix = 1;
  while (used.has(`${base}-${String(suffix)}`)) suffix += 1;
  return `${base}-${String(suffix)}`;
}

export function findLinkAt(source: string, position: number): MarkdownLink | undefined {
  return findLinks(source).find((link) => position >= link.from && position <= link.to);
}

export function planLinkDestination(source: string, link: MarkdownLink, destination: string): ActionResult {
  if (!isSafeDestination(destination)) return { ok: false, reason: 'link destination scheme is blocked' };
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(link.destinationRange.from, link.destinationRange.to, destination)],
      selectionAfter: { anchor: link.labelRange.from, head: link.labelRange.to },
      allowedRanges: [link.destinationRange],
      label: 'Edit link destination'
    }
  };
}

export function linkNavigationExtension(open: (destination: string) => void): ReturnType<typeof EditorView.domEventHandlers> {
  return EditorView.domEventHandlers({
    click: (event, view) => {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const link = position === null ? undefined : findLinkAt(view.state.doc.toString(), position);
      if (link === undefined) return false;
      event.preventDefault();
      open(link.destination);
      return true;
    }
  });
}

function normalizeReference(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ').toLocaleLowerCase();
}

function isSafeDestination(value: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(value)?.[1]?.toLocaleLowerCase();
  return scheme === undefined || scheme === 'http' || scheme === 'https' || scheme === 'mailto';
}
