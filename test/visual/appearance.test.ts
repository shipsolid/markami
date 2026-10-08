// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { applyAppearance, resolveContentWidth } from '../../src/webview/ui/appearance/DocumentControls.js';

const appearanceCss = readFileSync(path.join(process.cwd(), 'src/webview/styles/appearance.css'), 'utf8');
const layoutCss = readFileSync(path.join(process.cwd(), 'src/webview/styles/layout.css'), 'utf8');

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

describe('appearance visual-state baselines', () => {
  test.each(['vscode-light', 'vscode-dark', 'vscode-high-contrast'] as const)('%s', (theme) => {
    document.body.className = theme;
    const shell = document.createElement('main');
    shell.className = 'markami-document-shell';
    document.body.append(shell);
    view = new EditorView({ parent: shell, state: EditorState.create({ doc: '# Heading\n\nBody' }) });

    const states = (['vscode', 'document'] as const).flatMap((appearance) =>
      (['auto', 'readable', 'full'] as const).map((width) => {
        const preferences = { appearance, width, maxContentWidth: 960, useEditorFont: true };
        applyAppearance(view as EditorView, preferences);
        return {
          appearance: shell.dataset.appearance,
          contentAt320: resolveContentWidth(preferences, 320),
          contentAt1440: resolveContentWidth(preferences, 1440),
          max: shell.style.getPropertyValue('--markami-max-content-width'),
          theme,
          width: shell.dataset.width
        };
      })
    );

    expect(states).toEqual([
      { appearance: 'vscode', contentAt320: 296, contentAt1440: 960, max: '960px', theme, width: 'auto' },
      { appearance: 'vscode', contentAt320: 296, contentAt1440: 640, max: '960px', theme, width: 'readable' },
      { appearance: 'vscode', contentAt320: 296, contentAt1440: 1392, max: '960px', theme, width: 'full' },
      { appearance: 'document', contentAt320: 296, contentAt1440: 960, max: '960px', theme, width: 'auto' },
      { appearance: 'document', contentAt320: 296, contentAt1440: 640, max: '960px', theme, width: 'readable' },
      { appearance: 'document', contentAt320: 296, contentAt1440: 1392, max: '960px', theme, width: 'full' }
    ]);
  });

  test('production CSS applies responsive shell and document hierarchy', () => {
    const style = document.createElement('style');
    style.textContent = `${layoutCss}\n${appearanceCss}`;
    document.head.append(style);
    const shell = document.createElement('main');
    shell.className = 'markami-document-shell';
    shell.dataset.appearance = 'document';
    shell.dataset.width = 'readable';
    const content = document.createElement('div');
    content.className = 'cm-content';
    const first = document.createElement('div');
    first.className = 'cm-line markami-heading1';
    const sixth = document.createElement('div');
    sixth.className = 'cm-line markami-heading6';
    content.append(first, sixth);
    shell.append(content);
    document.body.append(shell);

    expect(getComputedStyle(shell).display).toBe('flex');
    expect(getComputedStyle(shell).overflow).toBe('hidden');
    expect(getComputedStyle(content).boxSizing).toBe('border-box');
    expect(getComputedStyle(first).fontSize).toBe('28.8px');
    expect(getComputedStyle(first).fontWeight).toBe('700');
    expect(getComputedStyle(sixth).fontSize).toBe('16px');
    expect(appearanceCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(layoutCss).toContain('@media (max-width: 480px)');
  });
});
