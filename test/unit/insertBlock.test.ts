import { describe, expect, test } from 'vitest';
import { applyPatchSet } from '../../src/core/source/PatchSet.js';
import { planInsertBlock, type InsertBlockKind } from '../../src/core/markdown/insertBlock.js';
import type { ActionContext } from '../../src/core/markdown/formatting.js';

function context(source: string, from: number, to: number, capabilities: Readonly<Record<string, boolean>> = {}): ActionContext {
  return {
    hostVersion: 5,
    editorRevision: 8,
    selection: { anchor: from, head: to },
    source,
    capabilities
  };
}

describe('deterministic block insertion', () => {
  test('slash_mer_replaces_query_only', () => {
    const source = 'prefix\n\n/mer\n\nsuffix';
    const from = source.indexOf('/mer');
    const result = planInsertBlock(context(source, from, from + 4), 'mermaid');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const edited = applyPatchSet(source, result.edit.patches);
    expect(edited).toBe('prefix\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nsuffix');
    expect(edited.slice(0, from)).toBe(source.slice(0, from));
    expect(edited.endsWith('\n\nsuffix')).toBe(true);
    expect(result.edit.selectionAfter).toEqual({ anchor: from + 11, head: from + 11 });
  });

  test.each<[InsertBlockKind, string]>([
    ['text', ''],
    ['heading1', '# '],
    ['heading6', '###### '],
    ['bullet', '- '],
    ['numbered', '1. '],
    ['task', '- [ ] '],
    ['quote', '> '],
    ['divider', '---'],
    ['code', '```\n\n```'],
    ['table', '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |'],
    ['math', '$$\n\n$$'],
    ['raw', '']
  ])('inserts the deterministic %s template', (kind, expected) => {
    const result = planInsertBlock(context('/x', 0, 2, { math: true }), kind);
    expect(result.ok).toBe(true);
    if (result.ok) expect(applyPatchSet('/x', result.edit.patches)).toBe(expected);
  });

  test('code language and image Markdown are validated planner inputs', () => {
    const code = planInsertBlock(context('/code', 0, 5), 'code', { language: 'typescript' });
    expect(code.ok).toBe(true);
    if (code.ok) expect(applyPatchSet('/code', code.edit.patches)).toBe('```typescript\n\n```');

    expect(planInsertBlock(context('/img', 0, 4), 'image')).toEqual({
      ok: false,
      reason: 'image insertion requires the host image service'
    });
    const image = planInsertBlock(context('/img', 0, 4), 'image', { imageMarkdown: '![diagram](./assets/diagram.png)' });
    expect(image.ok).toBe(true);
    if (image.ok) expect(applyPatchSet('/img', image.edit.patches)).toBe('![diagram](./assets/diagram.png)');
  });

  test('math insertion is unavailable when rendering is disabled', () => {
    expect(planInsertBlock(context('/math', 0, 5, { math: false }), 'math')).toEqual({
      ok: false,
      reason: 'math insertion is disabled'
    });
  });

  test('rejects stale or non-local trigger ranges', () => {
    expect(planInsertBlock(context('text /mer text', 5, 9), 'mermaid')).toEqual({
      ok: false,
      reason: 'block insertion requires an empty top-level paragraph'
    });
  });
});
