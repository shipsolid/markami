import { EditorSelection, Transaction } from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { ActionContext, ActionResult, PlannedEdit } from '../../core/markdown/formatting.js';
import type { ActionRegistry } from './actionRegistry.js';

export function executeEditorAction(
  view: EditorView,
  registry: ActionRegistry,
  actionId: string,
  context: ActionContext,
  args?: unknown
): boolean {
  const result = registry.plan(actionId, context, args);
  if (!result.ok) {
    return false;
  }
  applyPlannedEdit(view, result.edit);
  return true;
}

export function planCapturedEditorAction(
  registry: ActionRegistry,
  actionId: string,
  captured: ActionContext,
  current: ActionContext,
  args?: unknown
): ActionResult {
  if (
    captured.hostVersion !== current.hostVersion ||
    captured.editorRevision !== current.editorRevision ||
    captured.source !== current.source ||
    captured.selection.anchor !== current.selection.anchor ||
    captured.selection.head !== current.selection.head
  ) {
    return { ok: false, reason: 'document changed while the command was open' };
  }
  return registry.plan(actionId, captured, args);
}

export function codeInsertionArgs(value: string | null): { readonly language: string } | undefined {
  return value === null ? undefined : { language: value };
}

export function applyPlannedEdit(view: EditorView, edit: PlannedEdit): void {
  view.dispatch({
    changes: edit.patches.map((patch) => ({
      from: Number(patch.from),
      to: Number(patch.to),
      insert: patch.insert
    })),
    selection: EditorSelection.range(edit.selectionAfter.anchor, edit.selectionAfter.head),
    annotations: Transaction.userEvent.of('input.markami')
  });
}

export function createFormattingKeymap(
  registry: ActionRegistry,
  context: () => ActionContext,
  openLink?: (context: ActionContext) => boolean
): readonly KeyBinding[] {
  const command = (id: string) => (view: EditorView): boolean => executeEditorAction(view, registry, id, context());
  return [
    { key: 'Mod-b', run: command('markami.bold') },
    { key: 'Mod-i', run: command('markami.italic') },
    { key: 'Mod-Shift-`', run: command('markami.inlineCode') },
    { key: 'Mod-k', run: () => openLink?.(context()) ?? false }
  ];
}
