import { describe, expect, test, vi } from 'vitest';
import { CompositionGate } from '../../src/webview/bridge/compositionGate.js';

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
});
