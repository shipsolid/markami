// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import { sanitizeMermaidSvg, sanitizeRawHtml } from '../../src/webview/security/sanitize.js';

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

describe('Mermaid SVG sanitizer', () => {
  test('preserves diagram geometry while removing active and external content', () => {
    const sanitized = sanitizeMermaidSvg(`
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g class="node" style="fill: red"><path d="M0 0 L10 10"></path><text>Safe</text></g>
        <script>globalThis.pwned = true</script>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
        <a href="javascript:globalThis.pwned = true"><text>bad link</text></a>
        <image href="https://example.com/track.png"></image>
      </svg>
    `);
    const root = document.createElement('div');
    root.innerHTML = sanitized;

    expect(root.querySelector('svg[viewBox="0 0 100 100"] g.node path')).not.toBeNull();
    expect(root.querySelector('svg text')?.textContent).toBe('Safe');
    expect(root.querySelector('script, foreignObject, a, image')).toBeNull();
    expect(sanitized).not.toMatch(/(?:javascript:|https:\/\/example\.com)/iu);
  });
});
