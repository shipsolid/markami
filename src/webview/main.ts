import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { createCoordinateMap, editorOffset, type CoordinateMap } from '../core/source/CoordinateMap.js';
import { createTextPatch, type TextPatch } from '../core/source/PatchSet.js';
import type { HostMessage } from '../protocol/messages.js';
import { HostBridge } from './bridge/hostBridge.js';
import { projectionField } from './projection/ProjectionPlugin.js';

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState(state: T): void;
};

const vscode = acquireVsCodeApi();
const parent = document.querySelector<HTMLElement>('#editor');
if (parent === null) {
  throw new Error('Missing markami editor mount point');
}
const editorParent: HTMLElement = parent;

let view: EditorView | undefined;
let coordinateMap: CoordinateMap | undefined;
let eol: '\n' | '\r\n' = '\n';
let applyingHostChange = false;

const bridge = new HostBridge(vscode, (message, ownedOrigin) => {
  if (message.type === 'hydrate') {
    eol = message.document.eol;
    coordinateMap = createCoordinateMap(message.document.text);
    createEditor(coordinateMap.editorText);
  } else if (message.type === 'documentChanged' && !ownedOrigin) {
    applyHostPatches(message.changes);
  }
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isHostMessage(event.data)) {
    bridge.handle(event.data);
  }
});
bridge.ready();

function createEditor(text: string): void {
  view?.destroy();
  view = new EditorView({
    parent: editorParent,
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown(),
        projectionField,
        keymap.of(defaultKeymap),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applyingHostChange || coordinateMap === undefined || bridge.queue === undefined) {
            return;
          }
          const map = coordinateMap;
          const queue = bridge.queue;
          const patches: TextPatch[] = [];
          update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            patches.push(createTextPatch(
              Number(map.toHost(editorOffset(fromA))),
              Number(map.toHost(editorOffset(toA))),
              inserted.toString().replaceAll('\n', eol)
            ));
          });
          queue.enqueueLocal(patches);
          coordinateMap = createCoordinateMap(queue.optimisticText);
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: 'var(--vscode-editor-font-size)' },
          '.cm-scroller': { fontFamily: 'var(--vscode-editor-font-family)', overflow: 'auto' },
          '.cm-content': { padding: '24px' }
        })
      ]
    })
  });
}

function applyHostPatches(patches: readonly TextPatch[]): void {
  if (view === undefined || coordinateMap === undefined || bridge.queue === undefined) {
    return;
  }
  const map = coordinateMap;
  const queue = bridge.queue;
  const changes = patches.map((patch) => ({
    from: Number(map.toEditor(patch.from, 'backward')),
    to: Number(map.toEditor(patch.to, 'forward')),
    insert: patch.insert.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  }));
  applyingHostChange = true;
  view.dispatch({ changes });
  applyingHostChange = false;
  coordinateMap = createCoordinateMap(queue.optimisticText);
}

function isHostMessage(value: unknown): value is HostMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  return typeof (value as { type?: unknown }).type === 'string';
}
