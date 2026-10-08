import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { findImages, type MarkdownImage } from './images.js';
import { syntaxSelection } from '../../projection/syntaxReveal.js';

interface Resolution {
  readonly key: string;
  readonly uri?: string;
}

interface ImageProjectionState {
  readonly resolutions: ReadonlyMap<string, string | undefined>;
  readonly decorations: DecorationSet;
}

const resolvedImage = StateEffect.define<Resolution>();

const imageProjectionField = StateField.define<ImageProjectionState>({
  create(state) {
    const resolutions = new Map<string, string | undefined>();
    const selection = syntaxSelection(state);
    return { resolutions, decorations: imageDecorations(state.doc.toString(), selection.from, selection.to, resolutions) };
  },
  update(value, transaction) {
    const resolutions = transaction.docChanged
      ? new Map<string, string | undefined>()
      : new Map(value.resolutions);
    for (const effect of transaction.effects) {
      if (effect.is(resolvedImage)) resolutions.set(effect.value.key, effect.value.uri);
    }
    const selection = syntaxSelection(transaction.state);
    return {
      resolutions,
      decorations: imageDecorations(
        transaction.state.doc.toString(),
        selection.from,
        selection.to,
        resolutions
      )
    };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

export function imageProjection(
  resolve: (rawPath: string) => Promise<string | undefined>,
  edit: (image: MarkdownImage) => void
) {
  const resolver = ViewPlugin.fromClass(class {
    private readonly pending = new Set<string>();
    private destroyed = false;

    public constructor(private readonly view: EditorView) {
      this.view.dom.addEventListener('markami-edit-image', this.handleEdit);
      this.requestMissing();
    }

    public update(update: ViewUpdate): void {
      if (update.docChanged) this.pending.clear();
      if (update.docChanged || update.selectionSet || update.transactions.some((transaction) => transaction.effects.length > 0)) {
        this.requestMissing();
      }
    }

    public destroy(): void {
      this.destroyed = true;
      this.pending.clear();
      this.view.dom.removeEventListener('markami-edit-image', this.handleEdit);
    }

    private requestMissing(): void {
      const state = this.view.state.field(imageProjectionField);
      for (const image of findImages(this.view.state.doc.toString())) {
        if (this.pending.size >= 32) break;
        const key = imageKey(image);
        if (state.resolutions.has(key) || this.pending.has(key)) continue;
        this.pending.add(key);
        void resolve(image.destination).then(
          (uri) => this.finish(key, uri),
          () => this.finish(key, undefined)
        );
      }
    }

    private finish(key: string, uri: string | undefined): void {
      if (this.destroyed) return;
      this.pending.delete(key);
      this.view.dispatch({ effects: resolvedImage.of(uri === undefined ? { key } : { key, uri }) });
    }

    private readonly handleEdit = (event: Event): void => {
      if (event instanceof CustomEvent && isMarkdownImage(event.detail)) edit(event.detail);
    };
  });
  return [imageProjectionField, resolver];
}

function imageDecorations(
  source: string,
  selectionFrom: number,
  selectionTo: number,
  resolutions: ReadonlyMap<string, string | undefined>
): DecorationSet {
  return Decoration.set(findImages(source).flatMap((image) => {
    if (selectionFrom <= image.to && selectionTo >= image.from) return [];
    const key = imageKey(image);
    return [Decoration.replace({
      widget: new ImageWidget(image, resolutions.has(key), resolutions.get(key))
    }).range(image.from, image.to)];
  }), true);
}

class ImageWidget extends WidgetType {
  public constructor(
    private readonly image: MarkdownImage,
    private readonly loaded: boolean,
    private readonly uri: string | undefined
  ) { super(); }

  public eq(other: ImageWidget): boolean {
    return this.image.from === other.image.from && this.image.to === other.image.to &&
      this.image.alt === other.image.alt && this.loaded === other.loaded && this.uri === other.uri;
  }

  public toDOM(view: EditorView): HTMLElement {
    const container = view.dom.ownerDocument.createElement('span');
    container.className = 'markami-image';
    const content = view.dom.ownerDocument.createElement('span');
    if (this.uri !== undefined) {
      const image = view.dom.ownerDocument.createElement('img');
      image.src = this.uri;
      image.alt = this.image.alt;
      image.loading = 'lazy';
      image.addEventListener('error', () => renderPlaceholder(content, this.image.alt, true));
      content.append(image);
    } else {
      renderPlaceholder(content, this.image.alt, this.loaded);
    }
    const edit = view.dom.ownerDocument.createElement('button');
    edit.type = 'button';
    edit.className = 'markami-image-edit';
    edit.textContent = 'Edit image';
    edit.addEventListener('click', () => container.dispatchEvent(new CustomEvent('markami-edit-image', {
      bubbles: true,
      detail: this.image
    })));
    container.append(content, edit);
    return container;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

function renderPlaceholder(container: HTMLElement, alt: string, failed: boolean): void {
  container.replaceChildren();
  container.classList.add('markami-image-placeholder');
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', alt || 'Image');
  container.append(`${failed ? 'Missing image' : 'Loading image'}: ${alt || 'untitled'}`);
}

function imageKey(image: MarkdownImage): string {
  return `${String(image.from)}:${String(image.to)}:${image.destination}`;
}

function isMarkdownImage(value: unknown): value is MarkdownImage {
  return typeof value === 'object' && value !== null && 'from' in value && 'to' in value && 'destination' in value;
}
