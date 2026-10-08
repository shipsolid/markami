import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { findFrontmatter } from '../../src/core/markdown/frontmatter.js';
import { selectionCapabilities } from '../../src/core/markdown/formatting.js';
import { buildProjectionPlan, findUnknownSyntaxRanges } from '../../src/core/markdown/syntax.js';
import {
  buildDocumentSyntaxPlan,
  documentSyntax,
  documentSyntaxField
} from '../../src/webview/features/html/HtmlProjection.js';

describe('frontmatter, HTML, and unknown syntax fidelity', () => {
  test('frontmatter_preserves_comments_anchors_quotes_order_and_duplicate_keys', () => {
    const source = [
      '\uFEFF---',
      '# retained comment',
      'defaults: &defaults',
      '  enabled: true',
      'title: "Quoted: value"',
      "title: 'duplicate stays'",
      '---',
      '',
      '# Body'
    ].join('\r\n');

    const block = findFrontmatter(source);
    expect(block).toMatchObject({
      from: 1,
      validity: 'valid',
      opening: { from: 1, to: 4 },
      source: source.slice(1, source.indexOf('\r\n\r\n'))
    });
    expect(block === undefined ? '' : source.slice(block.content.from, block.content.to)).toContain("title: 'duplicate stays'");

    const state = EditorState.create({ doc: source, extensions: [documentSyntax()] });
    state.field(documentSyntaxField);
    expect(state.doc.toString()).toBe(source.replaceAll('\r\n', '\n'));
  });

  test('frontmatter_source_edit_changes_only_the_selected_range', () => {
    const source = '---\ntitle: "Old"\ncount: 2\n---\n\nBody';
    const from = source.indexOf('Old');
    const state = EditorState.create({ doc: source, extensions: [documentSyntax()] });
    const changed = state.update({ changes: { from, to: from + 3, insert: 'New' } }).state.doc.toString();

    expect(changed).toBe('---\ntitle: "New"\ncount: 2\n---\n\nBody');
    expect(changed.slice(0, from)).toBe(source.slice(0, from));
    expect(changed.slice(from + 3)).toBe(source.slice(from + 3));
  });

  test('invalid_frontmatter_remains_editable_source', () => {
    const source = '---\ntitle: [broken\n---\n\nBody';
    const plan = buildDocumentSyntaxPlan(source, { from: source.length, to: source.length });

    expect(plan.frontmatter).toMatchObject({ validity: 'ambiguous', replaceSource: false });
    expect(plan.sourceIslands).toContainEqual(expect.objectContaining({ reason: 'invalid or ambiguous frontmatter' }));
    expect(EditorState.create({ doc: source, extensions: [documentSyntax()] }).doc.toString()).toBe(source);
  });

  test('YAML comment punctuation does not make valid frontmatter ambiguous', () => {
    const source = '---\n# brackets here are commentary: [ }\ntitle: Demo # literal [ text\n---';
    expect(findFrontmatter(source)).toMatchObject({ validity: 'valid' });
  });

  test('unsafe HTML is denied without changing raw source', () => {
    const cases = [
      '<script>globalThis.pwned = true</script>',
      '<div onclick="pwned()">unsafe</div>',
      '<iframe src="https://example.com"></iframe>',
      '<form action="/submit"><button>Send</button></form>',
      '<a href="javascript:pwned()">bad</a>',
      '<a href="command:workbench.action.closeWindow">bad</a>'
    ];

    for (const source of cases) {
      const plan = buildDocumentSyntaxPlan(source, { from: source.length, to: source.length });
      expect(plan.html).toContainEqual(expect.objectContaining({ classification: 'unsafe', replaceSource: false }));
      expect(EditorState.create({ doc: source, extensions: [documentSyntax()] }).doc.toString()).toBe(source);
    }
  });

  test('safe HTML renders only while inactive and unknown syntax stays source-visible', () => {
    const safe = '<div title="note"><strong>Safe</strong><br></div>';
    expect(buildDocumentSyntaxPlan(safe, { from: safe.length, to: safe.length }).html)
      .toContainEqual(expect.objectContaining({ classification: 'safe', replaceSource: true }));
    expect(buildDocumentSyntaxPlan(safe, { from: 5, to: 5 }).html)
      .toContainEqual(expect.objectContaining({ classification: 'safe', replaceSource: false }));

    for (const source of [
      ':::custom\n**literal markers**\n:::',
      'import Widget from "./Widget"\n\n<Widget value={1} />'
    ]) {
      const plan = buildDocumentSyntaxPlan(source, { from: source.length, to: source.length });
      expect(plan.sourceIslands.some((island) => island.reason === 'custom directive' || island.reason === 'MDX')).toBe(true);
      expect(buildProjectionPlan(source, { sourceIslands: plan.sourceIslands }).hiddenTokens).toHaveLength(0);
      const position = source.includes('literal') ? source.indexOf('literal') : source.indexOf('Widget');
      expect(selectionCapabilities(source, { anchor: position, head: position + 1 })).toMatchObject({
        formatting: false,
        sourceIsland: true
      });
    }
  });

  test('directive and MDX examples inside code are not source islands', () => {
    const source = '```md\n:::custom\n<Component value={1} />\n```\n\n`<Widget />`';
    expect(findUnknownSyntaxRanges(source)).toEqual([]);
  });
});
