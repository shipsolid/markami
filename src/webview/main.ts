import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import {
  inlineFormatState,
  selectionCapabilities,
  type ActionContext
} from '../core/markdown/formatting.js';
import { createCoordinateMap, editorOffset, type CoordinateMap } from '../core/source/CoordinateMap.js';
import { createTextPatch, type TextPatch } from '../core/source/PatchSet.js';
import type { HostMessage } from '../protocol/messages.js';
import { HostBridge } from './bridge/hostBridge.js';
import { createFormattingActionRegistry, insertionActionId } from './editor/actionRegistry.js';
import { applyPlannedEdit, createFormattingKeymap, executeEditorAction } from './editor/commands.js';
import { canOpenSlash, openSlashState } from './editor/slashState.js';
import { projectionField } from './projection/ProjectionPlugin.js';
import { LinkPopover } from './ui/inlinePopover/LinkPopover.js';
import { SlashPalette } from './ui/slash/SlashPalette.js';
import { SelectionToolbar } from './ui/toolbar/SelectionToolbar.js';

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
let editorRevision = 0;
let toolbar: SelectionToolbar | undefined;
let linkPopover: LinkPopover | undefined;
let slashPalette: SlashPalette | undefined;
let selectionToolbarEnabled = true;
let slashCommandsEnabled = true;
let mathEnabled = true;
const actions = createFormattingActionRegistry();

const bridge = new HostBridge(vscode, (message, ownedOrigin) => {
  if (message.type === 'hydrate') {
    eol = message.document.eol;
    coordinateMap = createCoordinateMap(message.document.text);
    createEditor(coordinateMap.editorText);
  } else if (message.type === 'documentChanged' && !ownedOrigin) {
    applyHostPatches(message.changes);
  } else if (message.type === 'executeAction') {
    executeHostAction(message.actionId);
  } else if (message.type === 'configuration') {
    selectionToolbarEnabled = message.selectionToolbarEnabled;
    slashCommandsEnabled = message.slashCommandsEnabled;
    mathEnabled = message.mathEnabled;
    slashPalette?.setMathEnabled(mathEnabled);
    if (!selectionToolbarEnabled) {
      toolbar?.hide();
    }
  }
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isHostMessage(event.data)) {
    bridge.handle(event.data);
  }
});
window.addEventListener('resize', () => {
  if (toolbar?.capturedContext !== undefined) {
    updateSelectionToolbar();
  }
});
bridge.ready();

function createEditor(text: string): void {
  toolbar?.destroy();
  linkPopover?.destroy();
  slashPalette?.destroy();
  view?.destroy();
  editorRevision = 0;
  view = new EditorView({
    parent: editorParent,
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown(),
        projectionField,
        keymap.of([
          ...createSlashKeymap(),
          ...createFormattingKeymap(actions, currentActionContext, openLinkPopover),
          ...defaultKeymap
        ]),
        EditorView.domEventHandlers({
          compositionstart: () => {
            toolbar?.hide();
            return false;
          },
          dragstart: () => {
            toolbar?.hide();
            return false;
          }
        }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            editorRevision += 1;
            toolbar?.revalidate(currentActionContext());
          }
          if (update.geometryChanged && toolbar?.capturedContext !== undefined) {
            updateSelectionToolbar();
          }
          if (!update.docChanged || applyingHostChange || coordinateMap === undefined || bridge.queue === undefined) {
            if (update.selectionSet && !update.docChanged) {
              updateSelectionToolbar();
            }
          } else {
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
          }
          if (update.docChanged || update.selectionSet) {
            updateSlashPalette();
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: 'var(--vscode-editor-font-size)' },
          '.cm-scroller': { fontFamily: 'var(--vscode-editor-font-family)', overflow: 'auto' },
          '.cm-content': { padding: '24px' }
        })
      ]
    })
  });
  toolbar = new SelectionToolbar(document, actions, (_actionId, _context, result) => {
    if (_actionId === 'markami.link') {
      linkPopover?.show(_context);
      return;
    }
    if (view !== undefined) {
      applyPlannedEdit(view, result.edit);
    }
  }, () => view?.focus());
  linkPopover = new LinkPopover(document, actions, (result) => {
    if (view !== undefined) {
      applyPlannedEdit(view, result.edit);
    }
  }, currentActionContext);
  slashPalette = new SlashPalette(document, (kind, state, args) => {
    const result = actions.plan(insertionActionId(kind), state.context, args);
    if (!result.ok) {
      if (slashPalette !== undefined) {
        slashPalette.status.textContent = result.reason;
      }
      return;
    }
    if (view !== undefined) {
      applyPlannedEdit(view, result.edit);
    }
  }, {
    mathEnabled,
    chooseLanguage: () => Promise.resolve(window.prompt('Code language (optional)', '') ?? undefined)
  });
}

function currentActionContext(): ActionContext {
  if (view === undefined) {
    return { hostVersion: 0, editorRevision, selection: { anchor: 0, head: 0 }, source: '', capabilities: {} };
  }
  const selection = view.state.selection.main;
  const source = view.state.doc.toString();
  return {
    hostVersion: bridge.queue?.acknowledgedVersion ?? 0,
    editorRevision,
    selection: { anchor: selection.anchor, head: selection.head },
    source,
    capabilities: {
      ...selectionCapabilities(source, { anchor: selection.anchor, head: selection.head }),
      math: mathEnabled
    }
  };
}

function updateSelectionToolbar(focus = false): void {
  if (view === undefined || toolbar === undefined) {
    return;
  }
  const selection = view.state.selection.main;
  if (!focus && !selectionToolbarEnabled) {
    toolbar.hide();
    return;
  }
  if (selection.empty) {
    toolbar.hide();
    return;
  }
  const start = view.coordsAtPos(selection.from);
  const end = view.coordsAtPos(selection.to);
  if (start === null || end === null) {
    toolbar.hide();
    return;
  }
  const context = currentActionContext();
  toolbar.show(context, {
    left: Math.min(start.left, end.left),
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
    viewportHeight: window.innerHeight
  }, {
    focus,
    composing: view.composing,
    mixedBlocks: context.capabilities.mixedBlocks === true,
    states: currentFormattingStates()
  });
}

function currentFormattingStates(): Readonly<Record<string, 'active' | 'mixed' | 'inactive'>> {
  const context = currentActionContext();
  return {
    'markami.bold': inlineFormatState(context, 'strong'),
    'markami.italic': inlineFormatState(context, 'emphasis'),
    'markami.strikethrough': inlineFormatState(context, 'strike'),
    'markami.inlineCode': inlineFormatState(context, 'code'),
    'markami.link': inlineFormatState(context, 'link')
  };
}

function executeHostAction(actionId: string): void {
  if (actionId === 'markami.showSelectionToolbar') {
    updateSelectionToolbar(true);
    return;
  }
  if (actionId === 'markami.link') {
    openLinkPopover(currentActionContext());
    return;
  }
  if (actionId === 'markami.openSlashCommands') {
    openSlashPalette(true);
    return;
  }
  if (view !== undefined) {
    executeEditorAction(view, actions, actionId, currentActionContext());
  }
}

function updateSlashPalette(): void {
  const context = currentActionContext();
  if (slashPalette?.isOpen === true) {
    if (slashPalette.update(context)) {
      positionSlashPalette();
    }
    return;
  }
  if (slashCommandsEnabled && canOpenSlash(context)) {
    slashPalette?.open(openSlashState(context));
    positionSlashPalette();
  }
}

function openSlashPalette(explicit: boolean): boolean {
  if (slashPalette === undefined) {
    return false;
  }
  try {
    slashPalette.open(openSlashState(currentActionContext(), explicit));
    positionSlashPalette();
    return true;
  } catch {
    return false;
  }
}

function positionSlashPalette(): void {
  if (view === undefined || slashPalette === undefined) {
    return;
  }
  const coordinates = view.coordsAtPos(view.state.selection.main.head);
  if (coordinates !== null) {
    slashPalette.position(coordinates.left, coordinates.bottom + 6);
  }
}

function createSlashKeymap(): readonly KeyBinding[] {
  return ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].map((key) => ({
    key,
    run: () => slashPalette?.handleKey(key) ?? false
  }));
}

function openLinkPopover(context: ActionContext): boolean {
  if (context.selection.anchor === context.selection.head || linkPopover === undefined) {
    return false;
  }
  linkPopover.show(context);
  return true;
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
