import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { FORWARDED_COMMANDS, REQUIRED_COMMANDS } from '../../src/extension/commands.js';
import { createDocumentKeymap } from '../../src/webview/editor/keymap.js';
import {
  readAssetPasteDirectory,
  readRemoteImagePolicy,
  readWebviewConfiguration
} from '../../src/extension/configuration.js';
import { createFormattingActionRegistry, insertionActionId } from '../../src/webview/editor/actionRegistry.js';
import { planCapturedEditorAction } from '../../src/webview/editor/commands.js';
import { codeInsertionArgs } from '../../src/webview/editor/commands.js';
import { ActiveViewTracker } from '../../src/extension/ActiveViewTracker.js';
import { isMarkamiCustomEditorInput } from '../../src/extension/commands.js';

interface PackageManifest {
  readonly engines?: { readonly node?: string; readonly vscode?: string };
  readonly contributes?: {
    readonly commands?: readonly { readonly command?: string; readonly title?: string }[];
    readonly keybindings?: readonly { readonly command?: string; readonly when?: string }[];
    readonly configuration?: { readonly properties?: Readonly<Record<string, { readonly default?: unknown }>> };
  };
}

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageManifest;
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('command and configuration contract', () => {
  test('manifest declares the minimum Node runtime required by production dependencies', () => {
    expect(manifest.engines?.node).toBe('>=22.12.0');
  });

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
      'markami.debug.showSourceRanges'
    ];
    expect(expected.filter((key) => properties[key] === undefined)).toEqual([]);
    expect(properties['markami.remoteImages']?.default).toBe('prompt');
    expect(properties['markami.openAsDefault']?.default).toBe(false);
    expect(properties['markami.fidelity.strict']).toBeUndefined();
  });

  test('runtime configuration rejects invalid values and keeps safe defaults', () => {
    const values: Readonly<Record<string, unknown>> = {
      'selectionToolbar.enabled': 'yes',
      'outline.enabled': false,
      'theme.useEditorFont': false,
      remoteImages: 'unsafe',
      'assets.pasteDirectory': '../outside'
    };
    const configuration = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };

    expect(readWebviewConfiguration(configuration)).toEqual({
      selectionToolbarEnabled: true,
      slashCommandsEnabled: true,
      mathEnabled: true,
      blockHandlesEnabled: true,
      outlineEnabled: false,
      renderMermaid: true,
      renderSafeHtml: true,
      showSourceIslandLabels: true,
      debugShowSourceRanges: false,
      codeBlockWrap: false,
      useEditorFont: false
    });
    expect(readRemoteImagePolicy(configuration)).toBe('prompt');
    expect(readAssetPasteDirectory(configuration)).toBe('assets/${documentBasename}');
  });

  test('CI protects pull requests and main with pinned complete quality gates', () => {
    const actionReferences = [...ciWorkflow.matchAll(/^\s*- uses: ([^\s]+)(?:\s+#.*)?$/gmu)]
      .map((match) => match[1] ?? '');
    const checkoutCount = actionReferences.filter((reference) => reference.startsWith('actions/checkout@')).length;
    const credentialGuards = [...ciWorkflow.matchAll(/^\s+persist-credentials: false$/gmu)];

    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences.every((reference) => /@[0-9a-f]{40}$/u.test(reference))).toBe(true);
    expect(credentialGuards).toHaveLength(checkoutCount);
    expect(ciWorkflow).toContain('npm run test:webview');
    expect(ciWorkflow).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(ciWorkflow).toContain('npm run test:visual');
    expect(ciWorkflow).toContain('npm run bench');
  });

  test('deferred command refuses an insertion after the document context changes', () => {
    const captured = {
      hostVersion: 4,
      editorRevision: 7,
      source: 'before',
      selection: { anchor: 6, head: 6 },
      capabilities: {}
    };
    const current = {
      ...captured,
      editorRevision: 8,
      source: 'before changed',
      selection: { anchor: 14, head: 14 }
    };

    expect(planCapturedEditorAction(
      createFormattingActionRegistry(),
      insertionActionId('image'),
      captured,
      current,
      { imageMarkdown: '![diagram](diagram.png)' }
    )).toEqual({ ok: false, reason: 'document changed while the command was open' });
  });

  test('async host choices are leased to the panel that opened them', () => {
    const tracker = new ActiveViewTracker<object>();
    const first = {};
    const second = {};
    tracker.activate(first);
    tracker.markReady(first);
    const lease = tracker.capture();
    if (lease === undefined) throw new Error('missing active-view lease');

    tracker.activate(second);
    tracker.markReady(second);

    expect(tracker.isCurrent(lease)).toBe(false);
    expect(tracker.current).toBe(second);
  });

  test('an active view cannot receive actions until its webview completes the ready handshake', () => {
    const tracker = new ActiveViewTracker<object>();
    const view = {};
    tracker.activate(view);

    expect(tracker.current).toBeUndefined();
    expect(tracker.capture()).toBeUndefined();

    tracker.markReady(view);

    expect(tracker.current).toBe(view);
    expect(tracker.capture()).toBeDefined();
  });

  test('readiness of a background view never retargets actions', () => {
    const tracker = new ActiveViewTracker<object>();
    const active = {};
    const background = {};
    tracker.activate(active);

    tracker.markReady(background);

    expect(tracker.current).toBeUndefined();
  });

  test('a webview reload revokes readiness and outstanding leases', () => {
    const tracker = new ActiveViewTracker<object>();
    const view = {};
    tracker.activate(view);
    tracker.markReady(view);
    const lease = tracker.capture();
    if (lease === undefined) throw new Error('missing active-view lease');

    tracker.markPending(view);

    expect(tracker.isCurrent(lease)).toBe(false);
    expect(tracker.current).toBeUndefined();

    tracker.markReady(view);

    expect(tracker.isCurrent(lease)).toBe(false);
    expect(tracker.current).toBe(view);
  });

  test('source command accepts only the markami custom editor and code prompt cancellation is neutral', () => {
    expect(isMarkamiCustomEditorInput({ viewType: 'markami.editor' })).toBe(true);
    expect(isMarkamiCustomEditorInput({ viewType: 'other.editor' })).toBe(false);
    expect(codeInsertionArgs(null)).toBeUndefined();
    expect(codeInsertionArgs('typescript')).toEqual({ language: 'typescript' });
  });
});
