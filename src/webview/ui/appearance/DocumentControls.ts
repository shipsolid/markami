import type { EditorView } from '@codemirror/view';
import type { AppearanceMode, DocumentWidth } from '../../../protocol/viewPreferences.js';

export type { AppearanceMode, DocumentWidth } from '../../../protocol/viewPreferences.js';

export interface AppearancePreferences {
  readonly appearance: AppearanceMode;
  readonly width: DocumentWidth;
  readonly maxContentWidth: number;
  readonly useEditorFont: boolean;
}

export type AppearanceChange = Partial<AppearancePreferences>;

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  appearance: 'document',
  width: 'auto',
  maxContentWidth: 1200,
  useEditorFont: true
};

export function normalizeAppearancePreferences(value: unknown): AppearancePreferences {
  if (typeof value !== 'object' || value === null) return DEFAULT_APPEARANCE;
  const candidate = value as Partial<Record<keyof AppearancePreferences, unknown>>;
  const appearance = candidate.appearance === 'document' || candidate.appearance === 'vscode'
    ? candidate.appearance
    : DEFAULT_APPEARANCE.appearance;
  const width = candidate.width === 'readable' || candidate.width === 'full' || candidate.width === 'auto'
    ? candidate.width
    : DEFAULT_APPEARANCE.width;
  const maxContentWidth = typeof candidate.maxContentWidth === 'number' &&
    Number.isInteger(candidate.maxContentWidth) &&
    candidate.maxContentWidth >= 480 && candidate.maxContentWidth <= 2400
    ? candidate.maxContentWidth
    : DEFAULT_APPEARANCE.maxContentWidth;
  const useEditorFont = typeof candidate.useEditorFont === 'boolean'
    ? candidate.useEditorFont
    : DEFAULT_APPEARANCE.useEditorFont;
  return { appearance, width, maxContentWidth, useEditorFont };
}

export function applyAppearance(view: EditorView, preferences: AppearancePreferences): void {
  const normalized = normalizeAppearancePreferences(preferences);
  const shell = view.dom.parentElement ?? view.dom;
  shell.classList.add('markami-document-shell');
  shell.dataset.appearance = normalized.appearance;
  shell.dataset.width = normalized.width;
  shell.dataset.editorFont = String(normalized.useEditorFont);
  shell.style.setProperty('--markami-max-content-width', `${String(normalized.maxContentWidth)}px`);
}

export function resolveContentWidth(
  preferences: AppearancePreferences,
  paneWidth: number,
  characterWidth = 8
): number {
  const normalized = normalizeAppearancePreferences(preferences);
  const horizontalPadding = paneWidth <= 480 ? 24 : 48;
  const available = Math.max(0, paneWidth - horizontalPadding);
  if (normalized.width === 'full') return available;
  if (normalized.width === 'readable') {
    return Math.min(available, 80 * characterWidth, normalized.maxContentWidth);
  }
  return Math.min(available, normalized.maxContentWidth);
}

export class DocumentControls {
  public readonly element: HTMLElement;
  private readonly appearance: HTMLSelectElement;
  private readonly width: HTMLSelectElement;
  private readonly maximum: HTMLInputElement;
  private preferences: AppearancePreferences;

  public constructor(
    documentRef: Document,
    host: HTMLElement,
    initial: AppearancePreferences,
    private readonly onChange: (change: AppearanceChange) => void
  ) {
    this.preferences = normalizeAppearancePreferences(initial);
    this.element = documentRef.createElement('nav');
    this.element.className = 'markami-document-controls';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Document appearance and width');

    this.appearance = select(documentRef, 'Document appearance', [
      ['vscode', 'VS Code'],
      ['document', 'Document']
    ]);
    this.width = select(documentRef, 'Document width', [
      ['auto', 'Auto width'],
      ['readable', 'Readable width'],
      ['full', 'Full width']
    ]);
    this.maximum = documentRef.createElement('input');
    this.maximum.type = 'number';
    this.maximum.min = '480';
    this.maximum.max = '2400';
    this.maximum.step = '1';
    this.maximum.setAttribute('aria-label', 'Maximum content width');
    this.maximum.title = 'Maximum content width in CSS pixels';

    this.appearance.addEventListener('change', this.changeAppearance);
    this.width.addEventListener('change', this.changeWidth);
    this.maximum.addEventListener('change', this.changeMaximum);
    this.element.append(label(documentRef, 'Appearance', this.appearance), label(documentRef, 'Width', this.width), label(documentRef, 'Maximum', this.maximum));
    host.insertBefore(this.element, host.firstChild);
    this.setPreferences(this.preferences);
  }

  public setPreferences(preferences: AppearancePreferences): void {
    this.preferences = normalizeAppearancePreferences(preferences);
    this.appearance.value = this.preferences.appearance;
    this.width.value = this.preferences.width;
    this.maximum.value = String(this.preferences.maxContentWidth);
    this.maximum.disabled = this.preferences.width === 'full';
  }

  public focusAppearance(): void {
    this.appearance.focus();
  }

  public focusWidth(): void {
    this.width.focus();
  }

  public destroy(): void {
    this.appearance.removeEventListener('change', this.changeAppearance);
    this.width.removeEventListener('change', this.changeWidth);
    this.maximum.removeEventListener('change', this.changeMaximum);
    this.element.remove();
  }

  private readonly changeAppearance = (): void => {
    if (this.appearance.value !== 'vscode' && this.appearance.value !== 'document') return;
    this.preferences = { ...this.preferences, appearance: this.appearance.value };
    this.onChange({ appearance: this.preferences.appearance });
  };

  private readonly changeWidth = (): void => {
    if (this.width.value !== 'auto' && this.width.value !== 'readable' && this.width.value !== 'full') return;
    this.preferences = { ...this.preferences, width: this.width.value };
    this.maximum.disabled = this.preferences.width === 'full';
    this.onChange({ width: this.preferences.width });
  };

  private readonly changeMaximum = (): void => {
    const normalized = normalizeAppearancePreferences({
      ...this.preferences,
      maxContentWidth: Number(this.maximum.value)
    });
    this.preferences = normalized;
    this.maximum.value = String(normalized.maxContentWidth);
    this.onChange({ maxContentWidth: normalized.maxContentWidth });
  };
}

function select(documentRef: Document, ariaLabel: string, options: readonly (readonly [string, string])[]): HTMLSelectElement {
  const control = documentRef.createElement('select');
  control.setAttribute('aria-label', ariaLabel);
  for (const [value, text] of options) {
    const option = documentRef.createElement('option');
    option.value = value;
    option.textContent = text;
    control.append(option);
  }
  return control;
}

function label(documentRef: Document, text: string, control: HTMLElement): HTMLLabelElement {
  const element = documentRef.createElement('label');
  const caption = documentRef.createElement('span');
  caption.textContent = text;
  element.append(caption, control);
  return element;
}
