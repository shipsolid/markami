import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import type { ActionRegistry } from '../../editor/actionRegistry.js';

export interface SelectionBounds {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly viewportHeight: number;
}

export interface ToolbarDisplayOptions {
  readonly focus?: boolean;
  readonly composing?: boolean;
  readonly dragging?: boolean;
  readonly mixedBlocks?: boolean;
  readonly states?: Readonly<Record<string, 'active' | 'mixed' | 'inactive'>>;
}

export type ToolbarApply = (actionId: string, context: ActionContext, result: Extract<ActionResult, { ok: true }>) => void;

export class SelectionToolbar {
  public readonly element: HTMLElement;
  public readonly status: HTMLElement;
  public capturedContext: ActionContext | undefined;

  private readonly buttons: HTMLButtonElement[] = [];
  private activeIndex = 0;

  public constructor(
    document: Document,
    private readonly registry: ActionRegistry,
    private readonly apply: ToolbarApply,
    private readonly restoreEditorFocus: () => void
  ) {
    this.element = document.createElement('div');
    this.element.className = 'markami-selection-toolbar';
    this.element.hidden = true;
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Selection formatting');
    this.element.style.position = 'fixed';
    this.element.style.zIndex = '20';
    this.element.style.padding = '4px';
    this.element.style.border = '1px solid var(--vscode-widget-border, transparent)';
    this.element.style.borderRadius = '6px';
    this.element.style.background = 'var(--vscode-editorWidget-background)';
    this.element.style.color = 'var(--vscode-editorWidget-foreground)';

    for (const action of registry.list()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action.id;
      button.textContent = compactLabel(action.id, action.label);
      button.setAttribute('aria-label', action.label);
      button.tabIndex = this.buttons.length === 0 ? 0 : -1;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => this.activate(action.id));
      this.buttons.push(button);
      this.element.append(button);
    }
    this.status = document.createElement('span');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.style.position = 'absolute';
    this.status.style.width = '1px';
    this.status.style.height = '1px';
    this.status.style.overflow = 'hidden';
    this.element.append(this.status);
    this.element.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.body.append(this.element);
  }

  public show(ctx: ActionContext, bounds: SelectionBounds, options: ToolbarDisplayOptions = {}): boolean {
    const from = Math.min(ctx.selection.anchor, ctx.selection.head);
    const to = Math.max(ctx.selection.anchor, ctx.selection.head);
    if (
      from === to || options.composing === true || options.dragging === true || options.mixedBlocks === true ||
      ctx.capabilities.formatting === false || ctx.capabilities.sourceIsland === true
    ) {
      this.hide();
      if (options.mixedBlocks === true || ctx.capabilities.mixedBlocks === true) {
        this.status.textContent = 'Formatting unavailable: selection crosses unsupported blocks.';
      } else if (ctx.capabilities.formatting === false || ctx.capabilities.sourceIsland === true) {
        this.status.textContent = 'Formatting unavailable in source-only content.';
      }
      return false;
    }
    this.capturedContext = cloneContext(ctx);
    this.status.textContent = '';
    this.element.hidden = false;
    this.position(bounds);
    this.updateButtons(ctx, options.states ?? {});
    if (options.focus === true) {
      this.activeIndex = Math.max(0, this.buttons.findIndex((button) => !button.disabled));
      this.setRovingFocus(this.activeIndex, true);
    }
    return true;
  }

  public hide(): void {
    this.element.hidden = true;
    this.capturedContext = undefined;
  }

  public revalidate(current: ActionContext): boolean {
    const captured = this.capturedContext;
    if (
      captured === undefined ||
      captured.hostVersion !== current.hostVersion ||
      captured.editorRevision !== current.editorRevision ||
      captured.source !== current.source ||
      captured.selection.anchor !== current.selection.anchor ||
      captured.selection.head !== current.selection.head
    ) {
      this.hide();
      this.status.textContent = 'Formatting cancelled because the selection changed.';
      return false;
    }
    return true;
  }

  public destroy(): void {
    this.element.remove();
    this.capturedContext = undefined;
  }

  private activate(actionId: string): void {
    const ctx = this.capturedContext;
    if (ctx === undefined) {
      return;
    }
    const result = this.registry.plan(actionId, ctx);
    if (!result.ok) {
      this.status.textContent = result.reason;
      return;
    }
    this.apply(actionId, ctx, result);
    this.hide();
  }

  private updateButtons(ctx: ActionContext, states: Readonly<Record<string, 'active' | 'mixed' | 'inactive'>>): void {
    for (const button of this.buttons) {
      const id = button.dataset.action ?? '';
      const action = this.registry.get(id);
      button.disabled = action === undefined || !action.isAvailable(ctx);
      const state = states[id] ?? 'inactive';
      button.setAttribute('aria-pressed', state === 'mixed' ? 'mixed' : String(state === 'active'));
      button.title = button.disabled ? `${action?.label ?? id} is unavailable for this selection` : action?.label ?? id;
    }
  }

  private position(bounds: SelectionBounds): void {
    const toolbarHeight = Math.max(36, this.element.getBoundingClientRect().height);
    const above = bounds.top - toolbarHeight - 8;
    const top = above >= 4 ? above : Math.min(bounds.viewportHeight - toolbarHeight - 4, bounds.bottom + 8);
    this.element.style.left = `${String(Math.max(4, bounds.left))}px`;
    this.element.style.top = `${String(Math.max(4, top))}px`;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
      this.restoreEditorFocus();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    for (let count = 0; count < this.buttons.length; count += 1) {
      this.activeIndex = (this.activeIndex + direction + this.buttons.length) % this.buttons.length;
      if (!this.buttons[this.activeIndex]?.disabled) {
        this.setRovingFocus(this.activeIndex, true);
        return;
      }
    }
  }

  private setRovingFocus(index: number, focus: boolean): void {
    this.buttons.forEach((button, buttonIndex) => {
      button.tabIndex = buttonIndex === index ? 0 : -1;
    });
    if (focus) {
      this.buttons[index]?.focus({ preventScroll: true });
    }
  }
}

function cloneContext(ctx: ActionContext): ActionContext {
  return {
    hostVersion: ctx.hostVersion,
    editorRevision: ctx.editorRevision,
    selection: { ...ctx.selection },
    source: ctx.source,
    capabilities: { ...ctx.capabilities }
  };
}

function compactLabel(id: string, label: string): string {
  if (id === 'markami.bold') return 'B';
  if (id === 'markami.italic') return 'I';
  if (id === 'markami.strikethrough') return 'S';
  if (id === 'markami.inlineCode') return '</>';
  if (id === 'markami.link') return 'Link';
  if (id === 'markami.clearFormatting') return 'Clear';
  if (id === 'markami.paragraph') return 'P';
  return label.replace('Heading ', 'H');
}
