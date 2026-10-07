import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import './app.css';
import {
  inlineFormatState,
  selectionCapabilities,
  type ActionContext
} from '../core/markdown/formatting.js';
import { buildBlockIndex, type MovableBlock } from '../core/markdown/blockIndex.js';
import { FeatureRegistry } from '../core/markdown/featureRegistry.js';
import { planBlockMove } from '../core/markdown/moveBlock.js';
import { createCoordinateMap, editorOffset, type CoordinateMap } from '../core/source/CoordinateMap.js';
import { createTextPatch, type TextPatch } from '../core/source/PatchSet.js';
import type { HostMessage } from '../protocol/messages.js';
import { HostBridge } from './bridge/hostBridge.js';
import { createFormattingActionRegistry, insertionActionId } from './editor/actionRegistry.js';
import { applyPlannedEdit, createFormattingKeymap, executeEditorAction } from './editor/commands.js';
import { canOpenSlash, openSlashState } from './editor/slashState.js';
import { planListEnter, planListIndent } from './features/tasks/listPlanner.js';
import { registerTechnicalFeatures, technicalBlocks } from './features/technicalBlocks.js';
import { tableProjectionField } from './features/tables/TableProjection.js';
import { findLinkAt, githubSlug, linkNavigationExtension } from './features/links/links.js';
import { linkProjectionField } from './features/links/LinkProjection.js';
import { ResourceClient } from './features/images/ResourceClient.js';
import { imageProjection } from './features/images/ImageProjection.js';
import { projectionField } from './projection/ProjectionPlugin.js';
import { LinkPopover } from './ui/inlinePopover/LinkPopover.js';
import { ImagePopover } from './ui/images/ImagePopover.js';
import { blockHandleGutter, BlockHandles, computeAutoScrollVelocity } from './ui/blocks/BlockHandles.js';
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
let imagePopover: ImagePopover | undefined;
let slashPalette: SlashPalette | undefined;
let blockHandles: BlockHandles | undefined;
let selectionToolbarEnabled = true;
let slashCommandsEnabled = true;
let mathEnabled = true;
let blockHandlesEnabled = true;
let renderMermaid = true;
let codeBlockWrap = false;
const actions = createFormattingActionRegistry();
const featureRegistry = new FeatureRegistry();
const technicalCompartment = new Compartment();
const policyReloadCompartment = new Compartment();
const resources = new ResourceClient(vscode, navigateFragment);
let pendingPolicyReload: string | undefined;
registerTechnicalFeatures(featureRegistry);
featureRegistry.register({ id: 'tables', sourceKinds: ['gfmTable'] });

const bridge = new HostBridge(vscode, (message, ownedOrigin) => {
  if (message.type === 'resourceResult') {
    resources.handle(message);
  } else if (message.type === 'preparePolicyReload') {
    pendingPolicyReload = message.requestId;
    view?.dispatch({ effects: policyReloadCompartment.reconfigure(EditorView.editable.of(false)) });
  } else if (message.type === 'hydrate') {
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
    blockHandlesEnabled = message.blockHandlesEnabled;
    renderMermaid = message.renderMermaid;
    codeBlockWrap = message.codeBlockWrap;
    slashPalette?.setMathEnabled(mathEnabled);
    if (!blockHandlesEnabled) blockHandles?.hide();
    view?.dispatch({
      effects: technicalCompartment.reconfigure(technicalBlocks({
        renderMermaid,
        renderMath: mathEnabled,
        codeWrap: codeBlockWrap
      }))
    });
    if (!selectionToolbarEnabled) {
      toolbar?.hide();
    }
  }
  acknowledgePolicyReloadWhenSynced();
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
  imagePopover?.destroy();
  slashPalette?.destroy();
  blockHandles?.destroy();
  view?.destroy();
  editorRevision = 0;
  view = new EditorView({
    parent: editorParent,
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown({ codeLanguages: languages }),
        policyReloadCompartment.of(EditorView.editable.of(true)),
        projectionField,
        linkProjectionField,
        linkNavigationExtension((destination) => void resources.openLink(destination)),
        ...imageProjection(
          (rawPath) => resources.resolveImage(rawPath),
          (image) => imagePopover?.show(currentActionContext(), image)
        ),
        technicalCompartment.of(technicalBlocks({ renderMermaid, renderMath: mathEnabled, codeWrap: codeBlockWrap })),
        tableProjectionField,
        blockHandleGutter(() => blockHandlesEnabled ? currentBlocks() : [], () => blockHandles),
        keymap.of([
          ...createSlashKeymap(),
          ...createListKeymap(),
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
          },
          dragover: (event, editor) => handleBlockDragOver(event, editor),
          drop: (event, editor) => handleBlockDrop(event, editor)
        }),
        keymap.of([
          { key: 'Escape', run: () => blockHandles?.handleKey('Escape') ?? false },
          { key: 'Alt-ArrowUp', run: () => moveActiveBlock(-1) },
          { key: 'Alt-ArrowDown', run: () => moveActiveBlock(1) }
        ]),
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
  imagePopover = new ImagePopover(document, (result) => {
    if (view !== undefined) applyPlannedEdit(view, result.edit);
  }, currentActionContext, (destination) => {
    void resources.openLink(destination);
  }, revealImageSource);
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
    chooseLanguage: () => Promise.resolve(window.prompt('Code language (optional)', '') ?? undefined),
    chooseImage: () => resources.pickImage(),
    currentContext: currentActionContext
  });
  blockHandles = new BlockHandles(document, moveBlockTo, revealBlockSource, copyBlockMarkdown);
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
  if (actionId === 'markami.moveBlockUp') {
    moveActiveBlock(-1);
    return;
  }
  if (actionId === 'markami.moveBlockDown') {
    moveActiveBlock(1);
    return;
  }
  if (actionId === 'markami.moveBlockTo') {
    const blockCount = currentBlocks().length;
    const requested = Number(window.prompt(`Move block to position (1-${String(blockCount)})`, '1'));
    if (Number.isInteger(requested)) moveActiveBlockTo(requested - 1);
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

function createListKeymap(): readonly KeyBinding[] {
  const plan = (kind: 'enter' | 'indent' | 'outdent') => (): boolean => {
    if (view === undefined) return false;
    const context = currentActionContext();
    const result = kind === 'enter'
      ? planListEnter(context)
      : planListIndent(context, kind);
    if (!result.ok) return false;
    applyPlannedEdit(view, result.edit);
    return true;
  };
  return [
    { key: 'Enter', run: plan('enter') },
    { key: 'Tab', run: plan('indent') },
    { key: 'Shift-Tab', run: plan('outdent') }
  ];
}

function currentBlocks(): readonly MovableBlock[] {
  if (view === undefined) return [];
  return buildBlockIndex(view.state.doc.toString(), editorRevision);
}

function activeBlock(): MovableBlock | undefined {
  if (view === undefined) return undefined;
  const position = view.state.selection.main.head;
  return currentBlocks().find((block) => position >= block.core.from && position <= block.separatorAfter.to);
}

function moveActiveBlock(direction: -1 | 1): boolean {
  const block = activeBlock();
  if (block === undefined) return false;
  return moveBlockTo(block.id, block.order + direction);
}

function moveActiveBlockTo(targetIndex: number): boolean {
  const block = activeBlock();
  return block === undefined ? false : moveBlockTo(block.id, targetIndex);
}

function moveBlockTo(blockId: string, targetIndex: number): boolean {
  if (view === undefined) return false;
  const source = view.state.doc.toString();
  const result = planBlockMove(source, currentBlocks(), blockId, targetIndex);
  if (!result.ok) {
    if (blockHandles !== undefined) blockHandles.status.textContent = result.reason;
    return false;
  }
  applyPlannedEdit(view, result.edit);
  view.focus();
  return true;
}

function revealBlockSource(blockId: string): void {
  if (view === undefined) return;
  const block = currentBlocks().find((candidate) => candidate.id === blockId);
  if (block !== undefined) {
    view.dispatch({ selection: { anchor: block.core.from, head: block.core.to } });
    view.focus();
  }
}

function copyBlockMarkdown(blockId: string): void {
  if (view === undefined) return;
  const source = view.state.doc.toString();
  const block = currentBlocks().find((candidate) => candidate.id === blockId);
  if (block !== undefined) {
    void navigator.clipboard.writeText(source.slice(block.core.from, block.core.to));
  }
}

function handleBlockDragOver(event: DragEvent, editor: EditorView): boolean {
  if (blockHandles?.isDragging !== true) return false;
  const position = editor.posAtCoords({ x: event.clientX, y: event.clientY });
  const target = position === null ? undefined : currentBlocks().find((block) => position <= block.separatorAfter.to);
  if (target === undefined) return false;
  event.preventDefault();
  const coordinates = editor.coordsAtPos(target.core.from);
  blockHandles.updateDragTarget(target.order, coordinates?.top ?? event.clientY);
  editor.scrollDOM.scrollTop += computeAutoScrollVelocity(event.clientY, window.innerHeight);
  return true;
}

function handleBlockDrop(event: DragEvent, editor: EditorView): boolean {
  if (blockHandles?.isDragging !== true) return false;
  const position = editor.posAtCoords({ x: event.clientX, y: event.clientY });
  const target = position === null ? undefined : currentBlocks().find((block) => position <= block.separatorAfter.to);
  if (target === undefined) return false;
  event.preventDefault();
  return blockHandles.drop(target.order, editorRevision);
}

function openLinkPopover(context: ActionContext): boolean {
  const emptyOutsideLink = context.selection.anchor === context.selection.head &&
    findLinkAt(context.source, context.selection.head) === undefined;
  if (emptyOutsideLink || linkPopover === undefined) {
    return false;
  }
  linkPopover.show(context);
  return true;
}

function revealImageSource(image: { readonly from: number; readonly to: number }): void {
  if (view === undefined) return;
  view.dispatch({ selection: { anchor: image.from, head: image.to }, scrollIntoView: true });
  view.focus();
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

function acknowledgePolicyReloadWhenSynced(): void {
  if (pendingPolicyReload === undefined || bridge.queue?.state !== 'synced') return;
  vscode.postMessage({ type: 'policyReloadReady', requestId: pendingPolicyReload });
  pendingPolicyReload = undefined;
}

function navigateFragment(fragment: string): void {
  if (view === undefined) return;
  const target = decodeFragment(fragment);
  const source = view.state.doc.toString();
  const used: string[] = [];
  let offset = 0;
  for (const line of source.split('\n')) {
    const heading = /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/u.exec(line)?.[1];
    if (heading !== undefined) {
      const slug = githubSlug(heading, used);
      used.push(slug);
      if (slug === target) {
        view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
        view.focus();
        return;
      }
    }
    offset += line.length + 1;
  }
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment).toLocaleLowerCase();
  } catch {
    return fragment.toLocaleLowerCase();
  }
}
