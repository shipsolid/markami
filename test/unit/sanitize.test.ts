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
        <style>.unsafe { fill: u\\72l(https://example.com/style.svg) }</style>
        <script>globalThis.pwned = true</script>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
        <a href="javascript:globalThis.pwned = true"><text>Linked node</text></a>
        <image href="https://example.com/track.png"></image>
        <g style="fill:url\\28 https\\3a //example.com/paint.svg\\29"><text>Styled node</text></g>
        <g style="fill:\\ffffff"><text>Invalid escape</text></g>
        <defs><filter id="shadow"><feGaussianBlur stdDeviation="2"></feGaussianBlur></filter></defs>
        <rect class="local-filter" filter="url(#shadow)" width="10" height="10"></rect>
        <rect class="external-fill" fill="url(https://example.com/fill.svg)" width="10" height="10"></rect>
        <rect class="escaped-external-filter" filter="u\\72l(https\\3a //example.com/filter.svg)" width="10" height="10"></rect>
      </svg>
    `);
    const root = document.createElement('div');
    root.innerHTML = sanitized;

    expect(root.querySelector('svg[viewBox="0 0 100 100"] g.node path')).not.toBeNull();
    expect(root.textContent).toContain('Linked node');
    expect(root.textContent).toContain('Styled node');
    expect(root.textContent).toContain('Invalid escape');
    expect(root.querySelector('script, foreignObject, a, image, style')).toBeNull();
    expect(root.querySelectorAll('[style]')).toHaveLength(2);
    expect(root.querySelector('.local-filter')?.getAttribute('filter')).toBe('url(#shadow)');
    expect(root.querySelector('.external-fill')?.hasAttribute('fill')).toBe(false);
    expect(root.querySelector('.escaped-external-filter')?.hasAttribute('filter')).toBe(false);
    expect(sanitized).not.toMatch(/(?:javascript:|https:\/\/example\.com)/iu);
  });

  test('keeps an actual linked Mermaid node visible but inert', async () => {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value: () => 100
    });
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 20 })
    });
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
    const rendered = await mermaid.render(
      'sanitizer-linked-node',
      'flowchart TD\n  A[Linked node]\n  click A "https://example.com"'
    );
    const root = document.createElement('div');
    root.innerHTML = sanitizeMermaidSvg(rendered.svg);

    expect(root.textContent).toContain('Linked node');
    expect(root.querySelector('a, [href], [xlink\\:href]')).toBeNull();
  });
});
