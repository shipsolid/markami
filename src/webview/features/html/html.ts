import type { RawHtmlRange } from '../../../core/markdown/syntax.js';

export type HtmlClassification = 'safe' | 'ambiguous' | 'unsafe';

export interface ClassifiedHtmlRange extends RawHtmlRange {
  readonly classification: HtmlClassification;
}

const SAFE_TAGS = new Set([
  'blockquote', 'br', 'code', 'details', 'div', 'em', 'hr', 'kbd', 'li', 'mark',
  'ol', 'p', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'ul'
]);
const VOID_TAGS = new Set(['br', 'hr']);
const DANGEROUS_HTML = /<(?:script|iframe|form|object|embed|style|link|meta|svg|math|input|button)\b|\bon[a-z]+\s*=|\bsrcdoc\s*=|\b(?:href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data|command):/iu;

export function classifyRawHtml(range: RawHtmlRange): ClassifiedHtmlRange {
  const classification = DANGEROUS_HTML.test(range.source)
    ? 'unsafe'
    : range.nodeType === 'block' && isSimpleSafeHtml(range.source)
      ? 'safe'
      : 'ambiguous';
  return { ...range, classification };
}

function isSimpleSafeHtml(source: string): boolean {
  const stack: string[] = [];
  const tag = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([^<>]*)>/gu;
  let cursor = 0;
  let count = 0;
  for (const match of source.matchAll(tag)) {
    const before = source.slice(cursor, match.index);
    if (/[<>]/u.test(before)) return false;
    cursor = match.index + match[0].length;
    count += 1;
    const closing = match[1] === '/';
    const rawName = match[2] ?? '';
    const name = rawName.toLocaleLowerCase();
    if (rawName !== name || !SAFE_TAGS.has(name)) return false;
    const attributes = match[3] ?? '';
    if (closing) {
      if (attributes.trim() !== '' || stack.pop() !== name) return false;
      continue;
    }
    const selfClosing = /\/\s*$/u.test(attributes) || VOID_TAGS.has(name);
    if (!safeAttributes(attributes.replace(/\/\s*$/u, ''))) return false;
    if (!selfClosing) stack.push(name);
  }
  return count > 0 && stack.length === 0 && !/[<>]/u.test(source.slice(cursor));
}

function safeAttributes(attributes: string): boolean {
  let remaining = attributes;
  const attribute = /\s+(?:title|aria-label)\s*=\s*(?:"[^"]*"|'[^']*')|\s+open(?=\s|$)/gu;
  remaining = remaining.replace(attribute, '');
  return remaining.trim() === '';
}
