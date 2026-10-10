// @vitest-environment jsdom

import { history, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import {
  applyAppearance,
  normalizeAppearancePreferences,
  resolveContentWidth,
  type AppearanceMode,
  type DocumentWidth
} from '../../src/webview/ui/appearance/DocumentControls.js';
import { captureScrollAnchor, restoreScrollAnchor } from '../../src/webview/editor/scrollAnchor.js';
import { tableProjectionField } from '../../src/webview/features/tables/TableProjection.js';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

describe('appearance and responsive width', () => {
  const appearances: readonly AppearanceMode[] = ['vscode', 'document'];
  const widths: readonly DocumentWidth[] = ['auto', 'readable', 'full'];
  const panes = [320, 768, 1440] as const;

  test('vscode_document_width_matrix_obeys_caps_and_narrow_shell', () => {
    for (const appearance of appearances) {
      for (const width of widths) {
        for (const paneWidth of panes) {
          const contentWidth = resolveContentWidth({ appearance, width, maxContentWidth: 960, useEditorFont: true }, paneWidth);
          const available = paneWidth - (paneWidth <= 480 ? 24 : 48);
          expect(contentWidth).toBeLessThanOrEqual(available);
          if (width === 'full') expect(contentWidth).toBe(available);
          if (width === 'auto') expect(contentWidth).toBe(Math.min(available, 960));
          if (width === 'readable') expect(contentWidth).toBe(Math.min(available, 640, 960));
        }
      }
    }
  });

  test('full width ignores max while invalid preferences fall back safely', () => {
    expect(resolveContentWidth({ appearance: 'document', width: 'full', maxContentWidth: 480, useEditorFont: false }, 1440))
      .toBe(resolveContentWidth({ appearance: 'document', width: 'full', maxContentWidth: 2400, useEditorFont: false }, 1440));
    expect(normalizeAppearancePreferences({ appearance: 'wrong', width: 'wide', maxContentWidth: Number.POSITIVE_INFINITY }))
      .toEqual({ appearance: 'vscode', width: 'auto', maxContentWidth: 1200, useEditorFont: false });
    expect(normalizeAppearancePreferences({ appearance: 'document', width: 'readable', maxContentWidth: 479, useEditorFont: false }))
      .toEqual({ appearance: 'document', width: 'readable', maxContentWidth: 1200, useEditorFont: false });
  });

  test('switching appearance preserves dirty text selection history and pending patch count', () => {
    const shell = document.createElement('main');
    document.body.append(shell);
    let localPatches = 0;
    view = new EditorView({
      parent: shell,
      state: EditorState.create({
        doc: 'Pending',
        selection: EditorSelection.cursor(7),
        extensions: [
          history(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) localPatches += 1;
          })
        ]
      })
    });
    view.dispatch({ changes: { from: 7, insert: ' edit' }, selection: EditorSelection.cursor(12) });
    const beforeState = view.state;
    const beforeSelection = view.state.selection;
    const beforeUndoDepth = undoDepth(view.state);

    for (const appearance of appearances) {
      for (const width of widths) {
        applyAppearance(view, { appearance, width, maxContentWidth: 880, useEditorFont: appearance === 'vscode' });
      }
    }

    expect(view.state).toBe(beforeState);
    expect(view.state.doc.toString()).toBe('Pending edit');
    expect(view.state.selection).toBe(beforeSelection);
    expect(undoDepth(view.state)).toBe(beforeUndoDepth);
    expect(localPatches).toBe(1);
    expect(shell.dataset.appearance).toBe('document');
    expect(shell.dataset.width).toBe('full');
    expect(shell.style.getPropertyValue('--markami-max-content-width')).toBe('880px');
  });

  test('semantic scroll anchor restores pixel displacement with zoom scaling', () => {
    let anchorTop = 120;
    let isConnected = true;
    const requested: Array<{ key?: unknown; read: (candidate: EditorView) => unknown; write?: (value: unknown, candidate: EditorView) => void }> = [];
    const scrollDOM = {
      scrollTop: 50,
      getBoundingClientRect: () => ({ top: 100 })
    };
    const fake = {
      state: { doc: { length: 100 } },
      viewportLineBlocks: [{ from: 20 }],
      coordsAtPos: () => ({ top: anchorTop }),
      scrollDOM,
      scaleY: 2,
      dom: { get isConnected() { return isConnected; } },
      requestMeasure: (request: typeof requested[number]) => requested.push(request)
    } as unknown as EditorView;

    const anchor = captureScrollAnchor(fake);
    expect(anchor).toEqual({ sourceOffset: 20, deltaY: 20 });
    anchorTop = 160;
    restoreScrollAnchor(fake, anchor);
    const request = requested[0];
    if (request === undefined) throw new Error('missing measure request');
    request.write?.(request.read(fake), fake);

    expect(scrollDOM.scrollTop).toBe(70);
    restoreScrollAnchor(fake, anchor);
    expect(requested[1]?.key).toBe(request.key);

    isConnected = false;
    requested[1]?.write?.(40, fake);
    expect(scrollDOM.scrollTop).toBe(70);
  });

  test('wide tables use a local overflow wrapper around the grid', () => {
    const shell = document.createElement('main');
    document.body.append(shell);
    view = new EditorView({
      parent: shell,
      state: EditorState.create({
        doc: 'Before\n\n| A | B |\n| --- | --- |\n| one | two |',
        extensions: [tableProjectionField]
      })
    });

    expect(shell.querySelector('.markami-table > .markami-table-scroll > .markami-table-grid[role="grid"]')).not.toBeNull();
  });
});
