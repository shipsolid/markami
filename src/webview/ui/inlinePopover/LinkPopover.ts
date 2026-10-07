import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import type { ActionRegistry } from '../../editor/actionRegistry.js';

export class LinkPopover {
  public readonly element: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private captured: ActionContext | undefined;

  public constructor(
    document: Document,
    private readonly registry: ActionRegistry,
    private readonly apply: (result: Extract<ActionResult, { ok: true }>) => void,
    private readonly currentContext: () => ActionContext
  ) {
    this.element = document.createElement('form');
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Link destination');
    this.input = document.createElement('input');
    this.input.type = 'url';
    this.input.setAttribute('aria-label', 'Link destination');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Apply link';
    this.element.append(this.input, submit);
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      this.confirm();
    });
    document.body.append(this.element);
  }

  public show(ctx: ActionContext, initialHref = ''): void {
    this.captured = cloneContext(ctx);
    this.input.value = initialHref;
    this.element.hidden = false;
    this.input.focus({ preventScroll: true });
  }

  public cancel(): void {
    this.captured = undefined;
    this.element.hidden = true;
  }

  public destroy(): void {
    this.element.remove();
    this.captured = undefined;
  }

  public confirm(): boolean {
    const captured = this.captured;
    const current = this.currentContext();
    if (captured === undefined || !sameAnchor(captured, current)) {
      this.cancel();
      return false;
    }
    const result = this.registry.plan('markami.link', captured, { href: this.input.value });
    if (!result.ok) {
      this.input.setCustomValidity(result.reason);
      this.input.reportValidity();
      return false;
    }
    this.apply(result);
    this.cancel();
    return true;
  }
}

function sameAnchor(left: ActionContext, right: ActionContext): boolean {
  return left.hostVersion === right.hostVersion &&
    left.editorRevision === right.editorRevision &&
    left.source === right.source &&
    left.selection.anchor === right.selection.anchor &&
    left.selection.head === right.selection.head;
}

function cloneContext(ctx: ActionContext): ActionContext {
  return { ...ctx, selection: { ...ctx.selection }, capabilities: { ...ctx.capabilities } };
}
