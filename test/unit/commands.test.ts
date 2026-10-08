import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { FORWARDED_COMMANDS, REQUIRED_COMMANDS } from '../../src/extension/commands.js';
import { createDocumentKeymap } from '../../src/webview/editor/keymap.js';
import { readRemoteImagePolicy, readWebviewConfiguration } from '../../src/extension/configuration.js';

interface PackageManifest {
  readonly contributes?: {
    readonly commands?: readonly { readonly command?: string; readonly title?: string }[];
    readonly keybindings?: readonly { readonly command?: string; readonly when?: string }[];
    readonly configuration?: { readonly properties?: Readonly<Record<string, { readonly default?: unknown }>> };
  };
}

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageManifest;

describe('command and configuration contract', () => {
  test('manifest contributes every required command exactly once', () => {
    const contributed = manifest.contributes?.commands ?? [];
    const ids = contributed.map((command) => command.command);

    for (const required of REQUIRED_COMMANDS) {
      expect(ids.filter((id) => id === required.id), required.id).toHaveLength(1);
      expect(contributed.find((command) => command.command === required.id)?.title).toBe(required.title);
    }
  });

  test('forwarded commands use stable unique IDs and include source find', () => {
    const ids = FORWARDED_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('markami.findSource');
    expect(ids).toContain('markami.toggleSourceReveal');
    expect(ids).toContain('markami.copyCurrentBlockMarkdown');
  });

  test('all contributed shortcuts are scoped to the active markami custom editor', () => {
    for (const binding of manifest.contributes?.keybindings ?? []) {
      expect(binding.when, binding.command).toBe('activeCustomEditorId == markami.editor');
    }
  });

  test('webview keymap owns only document-local save, find, and source reveal shortcuts', () => {
    const bindings = createDocumentKeymap({ save: () => true, find: () => true, toggleSourceReveal: () => true });
    expect(bindings.map((binding) => binding.key)).toEqual(['Mod-s', 'Mod-f', 'Mod-Shift-m']);
    expect(bindings.every((binding) => binding.preventDefault === true)).toBe(true);
  });

  test('manifest exposes the complete settings contract with privacy-safe defaults', () => {
    const properties = manifest.contributes?.configuration?.properties ?? {};
    const expected = [
      'markami.openAsDefault',
      'markami.syntaxReveal',
      'markami.remoteImages',
      'markami.renderMermaid',
      'markami.renderMath',
      'markami.renderSafeHtml',
      'markami.codeBlock.wrap',
      'markami.outline.enabled',
      'markami.slashCommands.enabled',
      'markami.selectionToolbar.enabled',
      'markami.blockHandles.enabled',
      'markami.appearance.mode',
      'markami.document.width',
      'markami.document.maxContentWidth',
      'markami.viewPreferences.rememberPerFile',
      'markami.sourceIslands.showLabel',
      'markami.theme.useEditorFont',
      'markami.assets.pasteDirectory',
      'markami.fidelity.strict',
      'markami.debug.showSourceRanges'
    ];
    expect(expected.filter((key) => properties[key] === undefined)).toEqual([]);
    expect(properties['markami.remoteImages']?.default).toBe('prompt');
    expect(properties['markami.openAsDefault']?.default).toBe(false);
  });

  test('runtime configuration rejects invalid values and keeps safe defaults', () => {
    const values: Readonly<Record<string, unknown>> = {
      'selectionToolbar.enabled': 'yes',
      'outline.enabled': false,
      'theme.useEditorFont': false,
      remoteImages: 'unsafe'
    };
    const configuration = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };

    expect(readWebviewConfiguration(configuration)).toEqual({
      selectionToolbarEnabled: true,
      slashCommandsEnabled: true,
      mathEnabled: true,
      blockHandlesEnabled: true,
      outlineEnabled: false,
      renderMermaid: true,
      codeBlockWrap: false,
      useEditorFont: false
    });
    expect(readRemoteImagePolicy(configuration)).toBe('prompt');
  });
});
