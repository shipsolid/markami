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
  appearance: 'vscode',
  width: 'auto',
  maxContentWidth: 1200,
  useEditorFont: false
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
