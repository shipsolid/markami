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
