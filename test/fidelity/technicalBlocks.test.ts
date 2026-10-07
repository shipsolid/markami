import { describe, expect, test, vi } from 'vitest';
import { applyPatchSet } from '../../src/core/source/PatchSet.js';
import type { ActionContext } from '../../src/core/markdown/formatting.js';
import { planTaskToggle } from '../../src/webview/features/tasks/taskPlanner.js';
import { findFencedBlocks, planCodeContentEdit } from '../../src/webview/features/codeBlocks/codeFence.js';
import { DebouncedMermaidRenderer, LocalMermaidRenderer } from '../../src/webview/features/mermaid/mermaidRenderer.js';
import { findMathRanges } from '../../src/webview/features/math/mathRenderer.js';
import { findAlerts } from '../../src/webview/features/alerts/alerts.js';
import { planListEnter, planListIndent } from '../../src/webview/features/tasks/listPlanner.js';

function context(source: string, position = 0): ActionContext {
  return {
    hostVersion: 1,
    editorRevision: 1,
    selection: { anchor: position, head: position },
    source,
    capabilities: {}
  };
}

describe('technical Markdown source fidelity', () => {
  test('checkbox_changes_one_character', () => {
    const source = '- [ ] ship release';
    const result = planTaskToggle(context(source), 2, true);

    expect(result).toMatchObject({ ok: true, edit: { patches: [{ from: 3, to: 4, insert: 'x' }] } });
    if (result.ok) expect(applyPatchSet(source, result.edit.patches)).toBe('- [x] ship release');
  });

  test('edit_code_preserves_tilde_fence_and_info', () => {
    const source = 'Before\n\n~~~ts title="demo"\nconst n = 1;\n~~~\n\nAfter';
    const block = findFencedBlocks(source)[0];
    if (block === undefined) throw new Error('missing fence');
    const result = planCodeContentEdit(context(source), block, 'const n = 2;\n');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.edit.patches).toEqual([{ from: block.content.from, to: block.content.to, insert: 'const n = 2;\n' }]);
    expect(applyPatchSet(source, result.edit.patches)).toBe('Before\n\n~~~ts title="demo"\nconst n = 2;\n~~~\n\nAfter');
  });

  test('mermaid_failure_leaves_source_unchanged', async () => {
    const source = 'flowchart LR\nA --> B';
    const renderer = new LocalMermaidRenderer(async () => Promise.reject(new Error('bad diagram')), 4);

    const result = await renderer.render(source);
    expect(result).toEqual({ ok: false, error: 'bad diagram' });
    expect(source).toBe('flowchart LR\nA --> B');
  });

  test('math_currency_ambiguity_keeps_source', () => {
    const source = 'The service costs $5 and the budget is $10.';
    expect(findMathRanges(source)).toHaveLength(0);
    expect(findMathRanges('Use $x + y$ here.')).toContainEqual(expect.objectContaining({ display: false, source: 'x + y' }));
  });

  test('github_alert_marker_preserved', () => {
    const source = '> [!WARNING]\n> Capacity is low.';
    const alert = findAlerts(source)[0];
    expect(alert).toMatchObject({ type: 'warning', marker: { from: 2, to: 12 } });
    expect(source.slice(alert?.marker.from, alert?.marker.to)).toBe('[!WARNING]');
  });

  test('list Enter continues and exits without normalizing markers', () => {
    const continued = '- item';
    const continueResult = planListEnter(context(continued, continued.length));
    expect(continueResult.ok).toBe(true);
    if (continueResult.ok) expect(applyPatchSet(continued, continueResult.edit.patches)).toBe('- item\n- ');

    const empty = '* ';
    const exitResult = planListEnter(context(empty, empty.length));
    expect(exitResult.ok).toBe(true);
    if (exitResult.ok) expect(applyPatchSet(empty, exitResult.edit.patches)).toBe('');

    const indented = planListIndent(context('- child', 4), 'indent');
    expect(indented.ok).toBe(true);
    if (indented.ok) expect(applyPatchSet('- child', indented.edit.patches)).toBe('  - child');
    const outdented = planListIndent(context('  - child', 5), 'outdent');
    expect(outdented.ok).toBe(true);
    if (outdented.ok) expect(applyPatchSet('  - child', outdented.edit.patches)).toBe('- child');
  });

  test('Mermaid jobs are cached, bounded, and obsolete debounce work is cancelled', async () => {
    vi.useFakeTimers();
    const render = vi.fn((diagram: string) => Promise.resolve(`<svg>${diagram}</svg>`));
    const renderer = new LocalMermaidRenderer(render, 2);
    expect(await renderer.render('A')).toEqual({ ok: true, svg: '<svg>A</svg>' });
    expect(await renderer.render('A')).toEqual({ ok: true, svg: '<svg>A</svg>' });
    expect(render).toHaveBeenCalledOnce();

    const received: string[] = [];
    const debounced = new DebouncedMermaidRenderer(renderer, 200);
    debounced.schedule('old', (result) => received.push(result.ok ? result.svg : result.error));
    debounced.schedule('new', (result) => received.push(result.ok ? result.svg : result.error));
    await vi.advanceTimersByTimeAsync(200);
    expect(received).toEqual(['<svg>new</svg>']);
    debounced.dispose();
    vi.useRealTimers();
  });
});
