import type { AppearanceMode } from '../../../protocol/viewPreferences.js';

export type DocumentPalette = 'catppuccin-mocha' | 'vscode';

/**
 * Publishes the effective palette on the root element, where palette.css remaps the theme tokens for the shell and
 * for the floating widgets appended to the body. Only Document appearance takes a palette of its own.
 */
export function applyPalette(documentRef: Document, palette: DocumentPalette, appearance: AppearanceMode): void {
  documentRef.documentElement.dataset.markamiPalette = appearance === 'document' ? palette : 'vscode';
}
