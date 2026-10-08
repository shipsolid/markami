// @vitest-environment jsdom

import { EditorSelection, EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { projectionField } from '../../src/webview/projection/ProjectionPlugin.js';
import {
  manualSyntaxReveal,
  setManualSyntaxReveal,
  syntaxRevealPolicy
} from '../../src/webview/projection/syntaxReveal.js';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

describe('view preference projection', () => {
  test('syntax_reveal_policy_reconfigures_projection_without_source_edits', () => {
    const source = '**first** and **second**';
    const policy = new Compartment();
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        selection: EditorSelection.cursor(3),
        extensions: [policy.of(syntaxRevealPolicy.of('activeBlock')), projectionField]
      })
    });
    const originalState = view.state;

    expect(view.contentDOM.textContent).toContain('**first** and **second**');
    view.dispatch({ effects: policy.reconfigure(syntaxRevealPolicy.of('selection')) });
    expect(view.contentDOM.textContent).toContain('**first** and second');
    view.dispatch({ effects: policy.reconfigure(syntaxRevealPolicy.of('manual')) });
    expect(view.contentDOM.textContent).toContain('first and second');

    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.selection.main).toEqual(originalState.selection.main);
  });

  test('manual source reveal exposes only the requested range without changing source', () => {
    const source = '**first** and **second**';
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: source,
        selection: EditorSelection.cursor(12),
        extensions: [syntaxRevealPolicy.of('manual'), manualSyntaxReveal, projectionField]
      })
    });
    const selection = view.state.selection;

    expect(view.contentDOM.textContent).toContain('first and second');
    view.dispatch({ effects: setManualSyntaxReveal.of({ from: 0, to: 9 }) });
    expect(view.contentDOM.textContent).toContain('**first** and second');
    view.dispatch({ effects: setManualSyntaxReveal.of(undefined) });
    expect(view.contentDOM.textContent).toContain('first and second');
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.selection).toBe(selection);
  });
});
