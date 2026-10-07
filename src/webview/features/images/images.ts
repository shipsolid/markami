import type { ActionResult, PlannedEdit } from '../../../core/markdown/formatting.js';
import { createTextPatch } from '../../../core/source/PatchSet.js';
import { isEscapedMarkdown, isProtectedResourceRange, protectedResourceRanges } from '../../../core/markdown/resourceRanges.js';

export interface MarkdownImage {
  readonly form: 'inline' | 'reference';
  readonly from: number;
  readonly to: number;
  readonly alt: string;
  readonly altRange: { readonly from: number; readonly to: number };
  readonly destination: string;
  readonly destinationRange: { readonly from: number; readonly to: number };
  readonly title?: string;
  readonly titleRange?: { readonly from: number; readonly to: number };
  readonly titleSyntaxRange?: { readonly from: number; readonly to: number };
  readonly titleInsertion: number;
  readonly reference?: string;
}

interface ReferenceDefinition {
  readonly destination: string;
  readonly destinationRange: { readonly from: number; readonly to: number };
  readonly title?: string;
  readonly titleRange?: { readonly from: number; readonly to: number };
  readonly titleSyntaxRange?: { readonly from: number; readonly to: number };
  readonly titleInsertion: number;
}

export function findImages(source: string): readonly MarkdownImage[] {
  const protectedRanges = protectedResourceRanges(source);
  const definitions = findDefinitions(source, protectedRanges);
  const images: MarkdownImage[] = [];
  const inline = /!\[([^\]\n]*)\]\((?:<([^>\n]+)>|([^\s)]+))(?:([ \t]+)(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\)/gu;
  for (const match of source.matchAll(inline)) {
    if (isEscapedMarkdown(source, match.index) || isProtectedResourceRange(protectedRanges, match.index, match.index + match[0].length)) continue;
    const alt = match[1];
    const destination = match[2] ?? match[3];
    if (alt === undefined || destination === undefined) continue;
    const altOffset = match[0].indexOf(alt, 2);
    const destinationOffset = match[0].indexOf(destination, altOffset + alt.length);
    const title = match[5] ?? match[6] ?? match[7];
    const titleOffset = title === undefined ? -1 : match[0].indexOf(title, destinationOffset + destination.length);
    const whitespace = match[4];
    images.push({
      form: 'inline', from: match.index, to: match.index + match[0].length, alt, destination,
      altRange: { from: match.index + altOffset, to: match.index + altOffset + alt.length },
      destinationRange: { from: match.index + destinationOffset, to: match.index + destinationOffset + destination.length },
      titleInsertion: match.index + match[0].length - 1,
      ...(title === undefined ? {} : {
        title,
        titleRange: { from: match.index + titleOffset, to: match.index + titleOffset + title.length },
        titleSyntaxRange: {
          from: match.index + destinationOffset + destination.length,
          to: match.index + titleOffset + title.length + 1
        }
      }),
      ...(whitespace === undefined ? {} : {})
    });
  }

  const occupied = images.map((image) => ({ from: image.from, to: image.to }));
  const reference = /!\[([^\]\n]*)\]\[([^\]\n]*)\]/gu;
  for (const match of source.matchAll(reference)) {
    if (isEscapedMarkdown(source, match.index) || isProtectedResourceRange(protectedRanges, match.index, match.index + match[0].length)) continue;
    const alt = match[1];
    const key = match[2] || alt;
    if (alt === undefined || key === undefined) continue;
    const definition = definitions.get(normalizeReference(key));
    if (definition === undefined) continue;
    const altOffset = match[0].indexOf(alt, 2);
    images.push({
      form: 'reference', from: match.index, to: match.index + match[0].length, alt, reference: key,
      altRange: { from: match.index + altOffset, to: match.index + altOffset + alt.length },
      destination: definition.destination,
      destinationRange: definition.destinationRange,
      titleInsertion: definition.titleInsertion,
      ...(definition.title === undefined ? {} : {
        title: definition.title,
        titleRange: definition.titleRange,
        titleSyntaxRange: definition.titleSyntaxRange
      })
    });
    occupied.push({ from: match.index, to: match.index + match[0].length });
  }

  const shortcut = /!\[([^\]\n]+)\](?!\[|\()/gu;
  for (const match of source.matchAll(shortcut)) {
    const to = match.index + match[0].length;
    if (occupied.some((range) => match.index < range.to && to > range.from) ||
      isEscapedMarkdown(source, match.index) ||
      isProtectedResourceRange(protectedRanges, match.index, to)) continue;
    const alt = match[1];
    if (alt === undefined) continue;
    const definition = definitions.get(normalizeReference(alt));
    if (definition === undefined) continue;
    const altOffset = match[0].indexOf(alt, 2);
    images.push({
      form: 'reference', from: match.index, to, alt, reference: alt,
      altRange: { from: match.index + altOffset, to: match.index + altOffset + alt.length },
      destination: definition.destination,
      destinationRange: definition.destinationRange,
      titleInsertion: definition.titleInsertion,
      ...(definition.title === undefined ? {} : {
        title: definition.title,
        titleRange: definition.titleRange,
        titleSyntaxRange: definition.titleSyntaxRange
      })
    });
  }
  return images.sort((left, right) => left.from - right.from);
}

export function planImageField(
  _source: string,
  image: MarkdownImage,
  field: 'alt' | 'destination' | 'title',
  value: string
): ActionResult {
  if (field === 'destination' && !isSafeDestination(value)) {
    return { ok: false, reason: 'image destination scheme is blocked' };
  }
  let range: { readonly from: number; readonly to: number };
  let insert = value;
  if (field === 'alt') {
    range = image.altRange;
    insert = value.replaceAll('\\', '\\\\').replaceAll(']', '\\]');
  } else if (field === 'destination') {
    range = image.destinationRange;
  } else if (image.titleRange !== undefined && image.titleSyntaxRange !== undefined) {
    range = value === '' ? image.titleSyntaxRange : image.titleRange;
  } else {
    range = { from: image.titleInsertion, to: image.titleInsertion };
    insert = value === '' ? '' : ` "${value.replaceAll('"', '\\"')}"`;
  }
  return {
    ok: true,
    edit: {
      patches: [createTextPatch(range.from, range.to, insert)],
      selectionAfter: { anchor: image.altRange.from, head: image.altRange.to },
      allowedRanges: [range],
      label: `Edit image ${field}`
    }
  };
}

export function planImageFields(
  source: string,
  image: MarkdownImage,
  values: { readonly alt: string; readonly destination: string; readonly title: string }
): ActionResult {
  const changes: readonly ['alt' | 'destination' | 'title', string, string][] = [
    ['alt', image.alt, values.alt],
    ['destination', image.destination, values.destination],
    ['title', image.title ?? '', values.title]
  ];
  const planned: PlannedEdit[] = [];
  for (const [field, before, after] of changes) {
    if (before === after) continue;
    const result = planImageField(source, image, field, after);
    if (!result.ok) return result;
    planned.push(result.edit);
  }
  if (planned.length === 0) return { ok: false, reason: 'image fields are unchanged' };
  return {
    ok: true,
    edit: {
      patches: planned.flatMap((edit) => edit.patches),
      selectionAfter: { anchor: image.altRange.from, head: image.altRange.from + values.alt.length },
      allowedRanges: planned.flatMap((edit) => edit.allowedRanges),
      label: 'Edit image'
    }
  };
}

function findDefinitions(
  source: string,
  protectedRanges: readonly { readonly from: number; readonly to: number }[]
): Map<string, ReferenceDefinition> {
  const definitions = new Map<string, ReferenceDefinition>();
  const pattern = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|(\S+?))(?:([ \t]+)(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/gmu;
  for (const match of source.matchAll(pattern)) {
    if (isProtectedResourceRange(protectedRanges, match.index, match.index + match[0].length)) continue;
    const key = match[1];
    const destination = match[2] ?? match[3];
    if (key === undefined || destination === undefined) continue;
    const destinationOffset = match[0].indexOf(destination);
    const title = match[5] ?? match[6] ?? match[7];
    const titleOffset = title === undefined ? -1 : match[0].indexOf(title, destinationOffset + destination.length);
    definitions.set(normalizeReference(key), {
      destination,
      destinationRange: { from: match.index + destinationOffset, to: match.index + destinationOffset + destination.length },
      titleInsertion: match.index + match[0].trimEnd().length,
      ...(title === undefined ? {} : {
        title,
        titleRange: { from: match.index + titleOffset, to: match.index + titleOffset + title.length },
        titleSyntaxRange: {
          from: match.index + destinationOffset + destination.length,
          to: match.index + titleOffset + title.length + 1
        }
      })
    });
  }
  return definitions;
}

function normalizeReference(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ').toLocaleLowerCase();
}

function isSafeDestination(value: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(value)?.[1]?.toLocaleLowerCase();
  return scheme === undefined || scheme === 'http' || scheme === 'https';
}
