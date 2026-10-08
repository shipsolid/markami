import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import type { ActionRegistry } from '../../editor/actionRegistry.js';
import { findLinkAt, planLinkDestination, type MarkdownLink } from '../../features/links/links.js';

export class LinkPopover {
  public readonly element: HTMLFormElement;
  public readonly status: HTMLElement;
  private readonly input: HTMLInputElement;
  private captured: ActionContext | undefined;
  private capturedLink: MarkdownLink | undefined;

  public constructor(
    document: Document,
    private readonly registry: ActionRegistry,
    private readonly apply: (result: Extract<ActionResult, { ok: true }>) => void,
    private readonly currentContext: () => ActionContext,
    private readonly restoreEditorFocus: () => void = () => undefined
  ) {
    this.element = document.createElement('form');
    this.element.hidden = true;
    this.element.className = 'markami-link-popover';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'Link destination');
    this.element.setAttribute('aria-modal', 'false');
    this.status = liveStatus(document);
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.setAttribute('aria-label', 'Link destination');
    this.input.addEventListener('input', () => this.input.setCustomValidity(''));
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Apply link';
    this.element.append(this.input, submit);
    this.element.addEventListener('submit', (event) => {
      event.preventDefault();
      this.confirm();
    });
    this.element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      this.cancel();
      this.restoreEditorFocus();
    });
    document.body.append(this.element, this.status);
  }

  public show(ctx: ActionContext, initialHref = ''): void {
    this.status.textContent = '';
    this.captured = cloneContext(ctx);
    this.capturedLink = findLinkAt(ctx.source, ctx.selection.head);
    this.input.value = initialHref || this.capturedLink?.destination || '';
    this.element.hidden = false;
    this.input.focus({ preventScroll: true });
  }

  public cancel(): void {
    this.captured = undefined;
    this.capturedLink = undefined;
    this.element.hidden = true;
  }

  public destroy(): void {
    this.element.remove();
    this.status.remove();
    this.captured = undefined;
    this.capturedLink = undefined;
  }

  public confirm(): boolean {
    const captured = this.captured;
    const current = this.currentContext();
    if (captured === undefined || !sameAnchor(captured, current)) {
      this.cancel();
      this.status.textContent = 'Link editing cancelled because the document changed.';
      this.restoreEditorFocus();
      return false;
    }
    const result = this.capturedLink === undefined
      ? this.registry.plan('markami.link', captured, { href: this.input.value })
      : planLinkDestination(captured.source, this.capturedLink, this.input.value);
    if (!result.ok) {
      this.input.setCustomValidity(result.reason);
      this.input.reportValidity();
      return false;
    }
    this.apply(result);
    this.cancel();
    this.restoreEditorFocus();
    return true;
  }
}

function liveStatus(document: Document): HTMLElement {
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.position = 'absolute';
  status.style.width = '1px';
  status.style.height = '1px';
  status.style.overflow = 'hidden';
  return status;
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
