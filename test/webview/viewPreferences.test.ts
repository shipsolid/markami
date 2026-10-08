// @vitest-environment jsdom

import { EditorSelection, EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { projectionField } from '../../src/webview/projection/ProjectionPlugin.js';
import { syntaxRevealPolicy } from '../../src/webview/projection/syntaxReveal.js';

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
});
