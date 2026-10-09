import DOMPurify from 'dompurify';

const SAFE_TAGS = [
  'blockquote', 'br', 'code', 'details', 'div', 'em', 'hr', 'kbd', 'li', 'mark',
  'ol', 'p', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'ul'
];

export function sanitizeRawHtml(source: string): string {
  return DOMPurify.sanitize(source, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: ['aria-label', 'open', 'title'],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['a', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta', 'object', 'script', 'style', 'svg']
  });
}

export function sanitizeMermaidSvg(source: string): string {
  const sanitized = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['a', 'foreignObject', 'image', 'script'],
    FORBID_CONTENTS: ['foreignObject', 'image', 'script'],
    FORBID_ATTR: ['href', 'xlink:href']
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  for (const style of template.content.querySelectorAll('style')) {
    if (hasExternalCssReference(style.textContent)) style.remove();
  }
  for (const element of template.content.querySelectorAll('[style]')) {
    const style = element.getAttribute('style') ?? '';
    if (hasExternalCssReference(style)) element.removeAttribute('style');
  }
  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name !== 'style' && hasUnsafeSvgUrlReference(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}

function hasExternalCssReference(source: string): boolean {
  const normalized = normalizeCss(source);
  return normalized.includes('url(') || normalized.includes('@import') ||
    normalized.includes('image-set(') || normalized.includes('-moz-binding');
}

function hasUnsafeSvgUrlReference(source: string): boolean {
  const normalized = normalizeCss(source);
  const urlReferences = [...normalized.matchAll(/url\(([^)]*)\)/gu)];
  const urlTokens = normalized.match(/url\(/gu)?.length ?? 0;

  return urlTokens > 0 && (urlReferences.length !== urlTokens || urlReferences.some(([, target]) =>
    !/^(?:#[^"'()]+|(["'])#[^"'()]+\1)$/u.test(target ?? '')));
}

function normalizeCss(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/\\([0-9a-f]{1,6})\s?|\\(.)/giu, (_match, hex: string | undefined, escaped: string | undefined) =>
      hex === undefined ? escaped as string : decodeCssCodePoint(hex))
    .replaceAll(/\s+/gu, '')
    .toLocaleLowerCase();
}

function decodeCssCodePoint(hex: string): string {
  const value = Number.parseInt(hex, 16);
  return value === 0 || value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF)
    ? '\uFFFD'
    : String.fromCodePoint(value);
}
