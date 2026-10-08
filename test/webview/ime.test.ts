import { describe, expect, test, vi } from 'vitest';
import { CompositionGate } from '../../src/webview/bridge/compositionGate.js';
import { HostBridge, shouldApplyExternalChange } from '../../src/webview/bridge/hostBridge.js';
import { createTextPatch } from '../../src/core/source/PatchSet.js';
import { PROTOCOL_VERSION } from '../../src/protocol/version.js';

describe('IME composition delivery', () => {
  test('defers external changes until the composition commits in arrival order', () => {
    const deliver = vi.fn<(value: string) => void>();
    const gate = new CompositionGate<string>();

    gate.start();
    gate.deliverOrDefer('first', deliver);
    gate.deliverOrDefer('second', deliver);
    expect(deliver).not.toHaveBeenCalled();

    gate.end(deliver);
    expect(deliver.mock.calls.map(([value]) => value)).toEqual(['first', 'second']);
  });

  test('delivers ordinary messages immediately and clears stale work on reset', () => {
    const delivered: string[] = [];
    const gate = new CompositionGate<string>();

    gate.deliverOrDefer('ready', (value) => delivered.push(value));
    gate.start();
    gate.deliverOrDefer('stale', (value) => delivered.push(value));
    gate.reset();
    gate.end((value) => delivered.push(value));

    expect(delivered).toEqual(['ready']);
  });

  test('does not apply deferred host offsets after composition creates a sync conflict', () => {
    const applied: string[] = [];
    const bridge = new HostBridge({ postMessage: () => undefined }, (message, owned, disposition) => {
      if (message.type === 'documentChanged' && shouldApplyExternalChange(disposition.externalChange, owned)) {
        applied.push(message.changes[0]?.insert ?? '');
      }
    });
    bridge.handle({
      type: 'hydrate', protocolVersion: PROTOCOL_VERSION, viewId: 'view', generation: 1,
      document: { text: 'abc', version: 1, eol: '\n' },
      viewPreferences: {
        schemaVersion: 1,
        rememberPerFile: true,
        effective: {
          appearance: 'vscode', width: 'auto', maxContentWidth: 960,
          syntaxReveal: 'activeBlock', outlineCollapsed: false
        }
      }
    });
    bridge.queue?.enqueueLocal([createTextPatch(0, 0, 'local')]);

    bridge.handle({
      type: 'documentChanged', beforeVersion: 1, version: 2,
      changes: [createTextPatch(3, 3, ' external')]
    });

    expect(bridge.queue?.state).toBe('conflict');
    expect(applied).toEqual([]);
  });
});
