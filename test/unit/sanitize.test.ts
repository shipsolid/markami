// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import { sanitizeRawHtml } from '../../src/webview/security/sanitize.js';

describe('raw HTML sanitizer', () => {
  test('keeps the narrow safe allowlist', () => {
    expect(sanitizeRawHtml('<div title="note"><strong>Safe</strong><br></div>'))
      .toBe('<div title="note"><strong>Safe</strong><br></div>');
  });

  test.each([
    '<script>globalThis.pwned = true</script>',
    '<div onmouseover="globalThis.pwned = true">hover</div>',
    '<iframe srcdoc="<script>pwned()</script>"></iframe>',
    '<form action="javascript:pwned()"><button>Send</button></form>',
    '<a href="command:workbench.action.closeWindow">bad</a>',
    '<svg><a href="javascript:pwned()"><text>bad</text></a></svg>',
    '<math><mtext onclick="pwned()">bad</mtext></math>',
    '<div style="background:url(https://example.com/track)">bad</div>'
  ])('removes executable HTML from %s', (source) => {
    const sanitized = sanitizeRawHtml(source);
    const root = document.createElement('div');
    root.innerHTML = sanitized;

    expect(root.querySelector('script, iframe, form, a, [onmouseover], [srcdoc]')).toBeNull();
    expect(sanitized).not.toMatch(/(?:javascript|command):/iu);
  });
});
