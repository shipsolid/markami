// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';
import { applyPalette } from '../../src/webview/ui/appearance/palette.js';

afterEach(() => {
  delete document.documentElement.dataset.markamiPalette;
});

describe('document palette', () => {
  test('only Document appearance takes the configured palette', () => {
    applyPalette(document, 'catppuccin-mocha', 'document');
    expect(document.documentElement.dataset.markamiPalette).toBe('catppuccin-mocha');

    applyPalette(document, 'catppuccin-mocha', 'vscode');
    expect(document.documentElement.dataset.markamiPalette).toBe('vscode');
  });

  test('the vscode palette always follows the editor theme', () => {
    applyPalette(document, 'vscode', 'document');
    expect(document.documentElement.dataset.markamiPalette).toBe('vscode');
  });
});
