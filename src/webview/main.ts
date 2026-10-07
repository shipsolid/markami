import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState(state: T): void;
};

type HostMessage = {
  readonly type: 'snapshot';
  readonly text: string;
  readonly version: number;
};

const vscode = acquireVsCodeApi();
const parent = document.querySelector<HTMLElement>('#editor');
if (parent === null) {
  throw new Error('Missing markami editor mount point');
}

let view: EditorView | undefined;

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isSnapshot(event.data)) {
    return;
  }

  view?.destroy();
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc: event.data.text,
      extensions: [
        markdown(),
        keymap.of(defaultKeymap),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontSize: 'var(--vscode-editor-font-size)' },
          '.cm-scroller': { fontFamily: 'var(--vscode-editor-font-family)', overflow: 'auto' },
          '.cm-content': { padding: '24px' }
        }),
        EditorView.editable.of(false)
      ]
    })
  });
});

vscode.postMessage({ type: 'ready' });

function isSnapshot(value: unknown): value is HostMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<HostMessage>;
  return candidate.type === 'snapshot' && typeof candidate.text === 'string' && Number.isInteger(candidate.version);
}
