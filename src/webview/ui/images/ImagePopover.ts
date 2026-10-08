import type { ActionContext, ActionResult } from '../../../core/markdown/formatting.js';
import { planImageFields, type MarkdownImage } from '../../features/images/images.js';

export class ImagePopover {
  public readonly element: HTMLFormElement;
  private readonly alt: HTMLInputElement;
  private readonly destination: HTMLInputElement;
  private readonly title: HTMLInputElement;
  private captured: ActionContext | undefined;
  private image: MarkdownImage | undefined;

  public constructor(
    document: Document,
    private readonly apply: (result: Extract<ActionResult, { ok: true }>) => void,
    private readonly currentContext: () => ActionContext,
    private readonly openAsset: (destination: string) => void,
    private readonly revealSource: (image: MarkdownImage) => void,
    private readonly restoreEditorFocus: () => void = () => undefined
  ) {
    this.element = document.createElement('form');
    this.element.hidden = true;
    this.element.className = 'markami-image-popover';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'Edit image');
    this.element.setAttribute('aria-modal', 'false');
    this.alt = this.field(document, 'Alt text');
    this.destination = this.field(document, 'Image path');
    this.title = this.field(document, 'Image title');
    const applyButton = document.createElement('button');
    applyButton.type = 'submit';
    applyButton.textContent = 'Apply';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open asset';
    openButton.addEventListener('click', () => {
      if (this.image !== undefined) this.openAsset(this.image.destination);
    });
    const sourceButton = document.createElement('button');
    sourceButton.type = 'button';
    sourceButton.textContent = 'Reveal source';
    sourceButton.addEventListener('click', () => {
      if (this.image !== undefined) this.revealSource(this.image);
      this.cancel();
    });
    this.element.append(this.alt, this.destination, this.title, applyButton, openButton, sourceButton);
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
    document.body.append(this.element);
  }

  public show(context: ActionContext, image: MarkdownImage): void {
    this.captured = cloneContext(context);
    this.image = image;
    this.alt.value = image.alt;
    this.destination.value = image.destination;
    this.title.value = image.title ?? '';
    this.element.hidden = false;
    this.alt.focus({ preventScroll: true });
  }

  public confirm(): boolean {
    const captured = this.captured;
    const image = this.image;
    if (captured === undefined || image === undefined || !sameAnchor(captured, this.currentContext())) {
      this.cancel();
      return false;
    }
    const result = planImageFields(captured.source, image, {
      alt: this.alt.value,
      destination: this.destination.value,
      title: this.title.value
    });
    if (!result.ok) {
      this.destination.setCustomValidity(result.reason);
      this.destination.reportValidity();
      return false;
    }
    this.apply(result);
    this.cancel();
    this.restoreEditorFocus();
    return true;
  }

  public cancel(): void {
    this.captured = undefined;
    this.image = undefined;
    this.element.hidden = true;
  }

  public destroy(): void {
    this.element.remove();
    this.captured = undefined;
    this.image = undefined;
  }

  private field(document: Document, label: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', label);
    input.placeholder = label;
    input.addEventListener('input', () => input.setCustomValidity(''));
    return input;
  }
}

function sameAnchor(left: ActionContext, right: ActionContext): boolean {
  return left.hostVersion === right.hostVersion && left.editorRevision === right.editorRevision &&
    left.source === right.source;
}

function cloneContext(context: ActionContext): ActionContext {
  return { ...context, selection: { ...context.selection }, capabilities: { ...context.capabilities } };
}
