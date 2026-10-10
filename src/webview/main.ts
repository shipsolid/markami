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
import { isProtocolTextWithinLimit } from '../protocol/limits.js';
import { parseHostMessage } from '../protocol/schemas.js';
import { CompositionGate } from './bridge/compositionGate.js';
import type { FileViewOverrideChanges, SyntaxRevealPolicy, ViewPreferencesState } from '../protocol/viewPreferences.js';
import { HostBridge, shouldApplyExternalChange, shouldShowExternalConflict } from './bridge/hostBridge.js';
import { preserveLiveConflictDraft } from './bridge/recovery.js';
import { createFormattingActionRegistry, insertionActionId } from './editor/actionRegistry.js';
import {
  applyPlannedEdit,
  codeInsertionArgs,
  createFormattingKeymap,
  executeEditorAction,
  planCapturedEditorAction
} from './editor/commands.js';
import { createDocumentKeymap } from './editor/keymap.js';
import { captureScrollAnchor, restoreScrollAnchor } from './editor/scrollAnchor.js';
import { canOpenSlash, openSlashState } from './editor/slashState.js';
import { planListEnter, planListIndent } from './features/tasks/listPlanner.js';
import { registerTechnicalFeatures, technicalBlocks } from './features/technicalBlocks.js';
import { tableProjectionField } from './features/tables/TableProjection.js';
import { findLinkAt, linkNavigationExtension } from './features/links/links.js';
import { linkProjectionField } from './features/links/LinkProjection.js';
import { ResourceClient } from './features/images/ResourceClient.js';
import { imageProjection } from './features/images/ImageProjection.js';
import { documentSyntax } from './features/html/HtmlProjection.js';
import { projectionField } from './projection/ProjectionPlugin.js';
import {
  manualSyntaxReveal,
  setManualSyntaxReveal,
  syntaxRevealPolicy
} from './projection/syntaxReveal.js';
import { LinkPopover } from './ui/inlinePopover/LinkPopover.js';
import { ImagePopover } from './ui/images/ImagePopover.js';
import { blockHandleGutter, BlockHandles, computeAutoScrollVelocity } from './ui/blocks/BlockHandles.js';
import { SlashPalette } from './ui/slash/SlashPalette.js';
import { SelectionToolbar } from './ui/toolbar/SelectionToolbar.js';
import {
  DEFAULT_APPEARANCE,
  DocumentControls,
  applyAppearance,
  normalizeAppearancePreferences,
  type AppearanceChange,
  type AppearancePreferences
} from './ui/appearance/DocumentControls.js';
import { DocumentFind, type FindMatch, type FindMode } from './ui/find/DocumentFind.js';
import { findHighlights, setFindHighlights } from './ui/find/FindHighlights.js';
import { DocumentOutline, sourceOffsetForHeadingFragment } from './ui/outline/DocumentOutline.js';
import { ConflictBanner, ErrorBanner } from './ui/notifications/ConflictBanner.js';

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
let documentControls: DocumentControls | undefined;
let documentFind: DocumentFind | undefined;
let documentOutline: DocumentOutline | undefined;
let conflictBanner: ConflictBanner | undefined;
let conflictDraft: string | undefined;
let errorBanner: ErrorBanner | undefined;
let selectionToolbarEnabled = true;
let slashCommandsEnabled = true;
let mathEnabled = true;
let blockHandlesEnabled = true;
let outlineEnabled = true;
let renderMermaid = true;
let renderSafeHtml = true;
let showSourceIslandLabels = true;
let debugShowSourceRanges = false;
let codeBlockWrap = true;
let appearancePreferences: AppearancePreferences = DEFAULT_APPEARANCE;
let syntaxReveal: SyntaxRevealPolicy = 'activeBlock';
let outlineCollapsed = false;
const actions = createFormattingActionRegistry();
const featureRegistry = new FeatureRegistry();
const technicalCompartment = new Compartment();
const policyReloadCompartment = new Compartment();
const syntaxRevealCompartment = new Compartment();
const documentSyntaxCompartment = new Compartment();
const resources = new ResourceClient(vscode, navigateFragment);
const compositionGate = new CompositionGate<HostMessage>();
let pendingPolicyReload: string | undefined;
registerTechnicalFeatures(featureRegistry);
featureRegistry.register({ id: 'tables', sourceKinds: ['gfmTable'] });
featureRegistry.register({ id: 'frontmatter', sourceKinds: ['yamlFrontmatter'] });
featureRegistry.register({ id: 'html-source-islands', sourceKinds: ['rawHtml', 'mdx', 'customDirective'] });

const bridge = new HostBridge(vscode, (message, ownedOrigin, disposition) => {
  if (message.type === 'resourceResult') {
    resources.handle(message);
  } else if (message.type === 'preparePolicyReload') {
    pendingPolicyReload = message.requestId;
    view?.dispatch({ effects: policyReloadCompartment.reconfigure(EditorView.editable.of(false)) });
  } else if (message.type === 'hydrate') {
    eol = message.document.eol;
    coordinateMap = createCoordinateMap(message.document.text);
    applyViewPreferencesState(message.viewPreferences);
    createEditor(coordinateMap.editorText);
    if (disposition.restoredDraft !== undefined) showConflictBanner(disposition.restoredDraft);
  } else if (message.type === 'viewPreferencesChanged') {
    applyViewPreferencesState(message.viewPreferences);
  } else if (message.type === 'recoveryAvailable') {
    showConflictBanner();
  } else if (message.type === 'patchRejected' && disposition.rejectionMatched === true) {
    showConflictBanner(bridge.queue?.optimisticText);
  } else if (message.type === 'showError') {
    if (message.code === 'RECOVERY_STORAGE' || message.code === 'RECOVERY_CAPACITY') {
      bridge.cancelRecoveryResolution();
    }
    errorBanner?.destroy();
    errorBanner = new ErrorBanner(message.message);
    document.body.prepend(errorBanner.element);
  } else if (message.type === 'documentChanged' && !ownedOrigin) {
    if (shouldApplyExternalChange(disposition.externalChange, ownedOrigin)) {
      applyHostPatches(message.changes);
    } else if (shouldShowExternalConflict(disposition.externalChange, ownedOrigin)) {
      showConflictBanner(bridge.queue?.optimisticText);
    }
  } else if (message.type === 'executeAction') {
    executeHostAction(message.actionId, message.value);
  } else if (message.type === 'configuration') {
    selectionToolbarEnabled = message.selectionToolbarEnabled;
    slashCommandsEnabled = message.slashCommandsEnabled;
    mathEnabled = message.mathEnabled;
    blockHandlesEnabled = message.blockHandlesEnabled;
    outlineEnabled = message.outlineEnabled;
    renderMermaid = message.renderMermaid;
    renderSafeHtml = message.renderSafeHtml;
    showSourceIslandLabels = message.showSourceIslandLabels;
    debugShowSourceRanges = message.debugShowSourceRanges;
    codeBlockWrap = message.codeBlockWrap;
    updateAppearance({
      useEditorFont: message.useEditorFont
    });
    slashPalette?.setMathEnabled(mathEnabled);
    if (!blockHandlesEnabled) blockHandles?.hide();
    documentOutline?.setEnabled(outlineEnabled);
    view?.dispatch({
      effects: [
        technicalCompartment.reconfigure(technicalBlocks({
          renderMermaid,
          renderMath: mathEnabled,
          codeWrap: codeBlockWrap
        })),
        documentSyntaxCompartment.reconfigure(documentSyntax({
          renderSafeHtml,
          showSourceIslandLabels,
          debugShowSourceRanges
        }))
      ]
    });
    if (!selectionToolbarEnabled) {
      toolbar?.hide();
    }
  }
  acknowledgePolicyReloadWhenSynced();
}, vscode);

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = parseHostMessage(event.data);
  if (!parsed.ok) {
    if (parsed.requestSnapshot) {
      bridge.requestSnapshotRecovery();
    }
    return;
  }
  const message = parsed.message;
  if (message.type === 'hydrate') {
    compositionGate.reset();
  }
  if (message.type === 'documentChanged') {
    compositionGate.deliverOrDefer(message, (deferred) => bridge.handle(deferred));
  } else {
    bridge.handle(message);
  }
});
window.addEventListener('resize', () => {
  documentOutline?.setNarrow(window.innerWidth <= 480);
  if (toolbar?.capturedContext !== undefined) {
    updateSelectionToolbar();
  }
});
window.addEventListener('pagehide', () => resources.dispose(), { once: true });
bridge.ready();

function createEditor(text: string): void {
  conflictBanner?.destroy();
  conflictBanner = undefined;
  conflictDraft = undefined;
  errorBanner?.destroy();
  errorBanner = undefined;
  documentControls?.destroy();
  toolbar?.destroy();
  linkPopover?.destroy();
  imagePopover?.destroy();
  slashPalette?.destroy();
  blockHandles?.destroy();
  documentFind?.destroy();
  documentOutline?.destroy();
  view?.destroy();
  editorRevision = 0;
  view = new EditorView({
    parent: editorParent,
    state: EditorState.create({
      doc: text,
      extensions: [
        markdown({ codeLanguages: languages }),
        EditorState.changeFilter.of((transaction) => {
          if (!transaction.docChanged) return true;
          const nextSource = transaction.newDoc.toString().replaceAll('\n', eol);
          if (isProtocolTextWithinLimit(nextSource)) return true;
          queueMicrotask(() => vscode.postMessage({ type: 'requestSourceFallback' }));
          return false;
        }),
        policyReloadCompartment.of(EditorView.editable.of(true)),
        syntaxRevealCompartment.of(syntaxRevealPolicy.of(syntaxReveal)),
        manualSyntaxReveal,
        projectionField,
        documentSyntaxCompartment.of(documentSyntax({
          renderSafeHtml,
          showSourceIslandLabels,
          debugShowSourceRanges
        })),
        linkProjectionField,
        linkNavigationExtension((destination) => void resources.openLink(destination)),
        ...imageProjection(
          (rawPath) => resources.resolveImage(rawPath),
          (image) => imagePopover?.show(currentActionContext(), image)
        ),
        technicalCompartment.of(technicalBlocks({ renderMermaid, renderMath: mathEnabled, codeWrap: codeBlockWrap })),
        tableProjectionField,
        findHighlights,
        blockHandleGutter(() => blockHandlesEnabled ? currentBlocks() : [], () => blockHandles),
        keymap.of([
          ...createDocumentKeymap({
            save: requestSave,
            find: () => openFind('visible'),
            toggleSourceReveal: () => revealCurrentBlock(true)
          }),
          ...createSlashKeymap(),
          ...createListKeymap(),
          ...createFormattingKeymap(actions, currentActionContext, openLinkPopover),
          ...defaultKeymap
        ]),
        EditorView.domEventHandlers({
          compositionstart: () => {
            compositionGate.start();
            toolbar?.hide();
            return false;
          },
          compositionend: () => {
            queueMicrotask(() => compositionGate.end((message) => bridge.handle(message)));
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
            updateDocumentOutline();
          }
          if (update.docChanged) {
            queueMicrotask(() => documentFind?.refresh());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: 'var(--vscode-editor-font-size)' },
          '.cm-scroller': { overflow: 'auto' },
          // CodeMirror's built-in gutter is a light grey strip regardless of the VS Code theme.
          '.cm-gutters': {
            backgroundColor: 'var(--vscode-editorGutter-background, var(--vscode-editor-background))',
            border: 'none',
            color: 'var(--vscode-editorLineNumber-foreground)'
          }
        })
      ]
    })
  });
  documentControls = new DocumentControls(document, editorParent, appearancePreferences, requestViewPreferenceChange);
  applyAppearance(view, appearancePreferences);
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
  }, currentActionContext, () => view?.focus());
  imagePopover = new ImagePopover(document, (result) => {
    if (view !== undefined) applyPlannedEdit(view, result.edit);
  }, currentActionContext, (destination) => {
    void resources.openLink(destination);
  }, revealImageSource, () => view?.focus());
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
  blockHandles = new BlockHandles(document, moveBlockTo, revealBlockSource, copyBlockMarkdown, () => view?.focus());
  documentFind = new DocumentFind(
    document,
    () => view?.state.doc.toString() ?? '',
    navigateFindMatch,
    showFindResults,
    () => view?.focus()
  );
  documentOutline = new DocumentOutline(document, navigateToSourceOffset, (collapsed) => {
    requestViewPreferenceChange({ outlineCollapsed: collapsed });
  });
  documentOutline.setEnabled(outlineEnabled);
  documentOutline.setCollapsed(outlineCollapsed);
  documentOutline.setNarrow(window.innerWidth <= 480);
  updateDocumentOutline();
}

function showConflictBanner(draftText?: string): void {
  conflictDraft = preserveLiveConflictDraft(conflictDraft, draftText);
  view?.dispatch({ effects: policyReloadCompartment.reconfigure(EditorView.editable.of(false)) });
  conflictBanner?.destroy();
  conflictBanner = new ConflictBanner((choice) => {
    if (choice === 'reload' || choice === 'discard') bridge.resolveRecoveryWithNextHydrate();
    vscode.postMessage({
      type: 'recoveryChoice',
      choice,
      ...(conflictDraft === undefined ? {} : { draftText: conflictDraft })
    });
  });
  document.body.prepend(conflictBanner.element);
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

function executeHostAction(actionId: string, value?: string): void {
  if (actionId === 'markami.setDocumentAppearance') {
    if (value === 'vscode' || value === 'document') {
      requestViewPreferenceChange({ appearance: value });
    } else {
      documentControls?.focusAppearance();
    }
    return;
  }
  if (actionId === 'markami.setDocumentWidth') {
    if (value === 'auto' || value === 'readable' || value === 'full') {
      requestViewPreferenceChange({ width: value });
    } else {
      documentControls?.focusWidth();
    }
    return;
  }
  if (actionId === 'markami.resetFileViewPreferences') {
    vscode.postMessage({ type: 'resetFileViewPreferences' });
    return;
  }
  if (actionId === 'markami.resetWorkspaceViewPreferences') {
    vscode.postMessage({ type: 'resetWorkspaceViewPreferences' });
    return;
  }
  if (actionId === 'markami.find') {
    openFind('visible');
    return;
  }
  if (actionId === 'markami.findSource') {
    openFind('source');
    return;
  }
  if (actionId === 'markami.toggleSourceReveal') {
    revealCurrentBlock(true);
    return;
  }
  if (actionId === 'markami.revealCurrentBlock') {
    revealCurrentBlock(false);
    return;
  }
  if (actionId === 'markami.copyCurrentBlockMarkdown') {
    const block = activeBlock();
    if (block !== undefined) copyBlockMarkdown(block.id);
    return;
  }
  if (actionId === 'markami.refreshRenderedBlocks') {
    view?.dispatch({});
    updateDocumentOutline();
    return;
  }
  if (actionId === 'markami.showDiagnostics') {
    showDiagnostics();
    return;
  }
  if (actionId === 'markami.insertHeading') {
    const level = Number(window.prompt('Heading level (1-6)', '2'));
    if (Number.isInteger(level) && level >= 1 && level <= 6) {
      executeInsertion(`heading${String(level)}` as 'heading1');
    }
    return;
  }
  const insertion = insertionKindForCommand(actionId);
  if (insertion !== undefined) {
    if (insertion === 'image') {
      void insertSelectedImage();
    } else if (insertion === 'code') {
      const args = codeInsertionArgs(window.prompt('Code language (optional)', ''));
      if (args !== undefined) executeInsertion('code', args);
    } else {
      executeInsertion(insertion);
    }
    return;
  }
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

function updateAppearance(change: AppearanceChange): void {
  const next = normalizeAppearancePreferences({ ...appearancePreferences, ...change });
  appearancePreferences = next;
  documentControls?.setPreferences(next);
  if (view === undefined) return;
  const anchor = captureScrollAnchor(view);
  applyAppearance(view, next);
  restoreScrollAnchor(view, anchor);
  if (toolbar?.capturedContext !== undefined) updateSelectionToolbar();
}

function requestViewPreferenceChange(change: FileViewOverrideChanges): void {
  updateAppearance({
    ...(change.appearance === undefined ? {} : { appearance: change.appearance }),
    ...(change.width === undefined ? {} : { width: change.width }),
    ...(change.maxContentWidth === undefined ? {} : { maxContentWidth: change.maxContentWidth })
  });
  if (change.outlineCollapsed !== undefined) {
    outlineCollapsed = change.outlineCollapsed;
    documentOutline?.setCollapsed(outlineCollapsed);
  }
  const changes: FileViewOverrideChanges = {};
  if (change.appearance !== undefined) changes.appearance = change.appearance;
  if (change.width !== undefined) changes.width = change.width;
  if (change.maxContentWidth !== undefined) changes.maxContentWidth = change.maxContentWidth;
  if (change.syntaxReveal !== undefined) changes.syntaxReveal = change.syntaxReveal;
  if (change.outlineCollapsed !== undefined) changes.outlineCollapsed = change.outlineCollapsed;
  if (Object.keys(changes).length > 0) {
    vscode.postMessage({ type: 'updateViewPreferences', changes });
  }
}

function applyViewPreferencesState(state: ViewPreferencesState): void {
  syntaxReveal = state.effective.syntaxReveal;
  outlineCollapsed = state.effective.outlineCollapsed;
  editorParent.dataset.syntaxReveal = syntaxReveal;
  editorParent.dataset.outlineCollapsed = String(state.effective.outlineCollapsed);
  editorParent.dataset.rememberPerFile = String(state.rememberPerFile);
  updateAppearance({
    appearance: state.effective.appearance,
    width: state.effective.width,
    maxContentWidth: state.effective.maxContentWidth
  });
  view?.dispatch({ effects: syntaxRevealCompartment.reconfigure(syntaxRevealPolicy.of(syntaxReveal)) });
  documentOutline?.setCollapsed(outlineCollapsed);
}

function openFind(mode: FindMode): boolean {
  documentFind?.open(mode);
  return documentFind !== undefined;
}

function showFindResults(matches: readonly FindMatch[], activeIndex: number): void {
  view?.dispatch({ effects: setFindHighlights.of({ matches, activeIndex }) });
}

function navigateFindMatch(match: FindMatch): void {
  if (view === undefined) return;
  view.dispatch({ selection: { anchor: match.from }, scrollIntoView: true });
}

function navigateToSourceOffset(sourceOffset: number): void {
  if (view === undefined) return;
  view.dispatch({ selection: { anchor: sourceOffset }, scrollIntoView: true });
  view.focus();
}

function updateDocumentOutline(): void {
  if (view === undefined || documentOutline === undefined) return;
  documentOutline.update(view.state.doc.toString(), view.state.selection.main.head);
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

function requestSave(): boolean {
  vscode.postMessage({ type: 'save' });
  return true;
}

function currentBlocks(): readonly MovableBlock[] {
  if (view === undefined) return [];
  return buildBlockIndex(view.state.doc.toString(), editorRevision);
}

function revealCurrentBlock(toggle: boolean): boolean {
  if (view === undefined) return false;
  const block = activeBlock();
  if (block === undefined) return false;
  const current = view.state.field(manualSyntaxReveal, false);
  const alreadyRevealed = current?.from === block.core.from && current.to === block.core.to;
  view.dispatch({ effects: setManualSyntaxReveal.of(toggle && alreadyRevealed ? undefined : block.core) });
  view.focus();
  return true;
}

type CommandInsertionKind = 'bullet' | 'numbered' | 'task' | 'code' | 'mermaid' | 'table' | 'image' | 'math' | 'divider';

function insertionKindForCommand(actionId: string): CommandInsertionKind | undefined {
  return commandInsertions[actionId as keyof typeof commandInsertions];
}

const commandInsertions = {
  'markami.insertBulletList': 'bullet',
  'markami.insertNumberedList': 'numbered',
  'markami.insertTaskList': 'task',
  'markami.insertCodeBlock': 'code',
  'markami.insertMermaidBlock': 'mermaid',
  'markami.insertTable': 'table',
  'markami.insertImage': 'image',
  'markami.insertMathBlock': 'math',
  'markami.insertDivider': 'divider'
} as const;

function executeInsertion(kind: Parameters<typeof insertionActionId>[0], args?: unknown): boolean {
  if (view === undefined) return false;
  const result = actions.plan(insertionActionId(kind), currentActionContext(), args);
  if (!result.ok) return false;
  applyPlannedEdit(view, result.edit);
  return true;
}

async function insertSelectedImage(): Promise<void> {
  const targetView = view;
  if (targetView === undefined) return;
  const captured = currentActionContext();
  const imageMarkdown = await resources.pickImage();
  if (imageMarkdown === undefined || view !== targetView) return;
  const result = planCapturedEditorAction(
    actions,
    insertionActionId('image'),
    captured,
    currentActionContext(),
    { imageMarkdown }
  );
  if (result.ok) applyPlannedEdit(targetView, result.edit);
}

function showDiagnostics(): void {
  const source = view?.state.doc.toString() ?? '';
  if (blockHandles !== undefined) {
    blockHandles.status.textContent = `markami diagnostics: ${String(source.length)} UTF-16 units, ${String(currentBlocks().length)} top-level blocks, host version ${String(bridge.queue?.acknowledgedVersion ?? 0)}.`;
  }
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

function acknowledgePolicyReloadWhenSynced(): void {
  if (pendingPolicyReload === undefined || bridge.queue?.state !== 'synced') return;
  vscode.postMessage({ type: 'policyReloadReady', requestId: pendingPolicyReload });
  pendingPolicyReload = undefined;
}

function navigateFragment(fragment: string): void {
  if (view === undefined) return;
  const target = decodeFragment(fragment);
  const source = view.state.doc.toString();
  const offset = sourceOffsetForHeadingFragment(source, target);
  if (offset === undefined) return;
  view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
  view.focus();
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment).toLocaleLowerCase();
  } catch {
    return fragment.toLocaleLowerCase();
  }
}
