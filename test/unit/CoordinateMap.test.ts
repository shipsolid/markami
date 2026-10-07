import { describe, expect, test } from 'vitest';
import { createCoordinateMap, editorOffset, hostOffset } from '../../src/core/source/CoordinateMap.js';

describe('CoordinateMap', () => {
  test('crlf_offsets_edit_final_word', () => {
    const map = createCoordinateMap('a\r\nb\r\nc');

    expect(map.editorText).toBe('a\nb\nc');
    expect(map.toHost(editorOffset(4))).toBe(6);
    expect(map.toEditor(hostOffset(6))).toBe(4);
  });

  test('keeps LF coordinates as an identity map', () => {
    const map = createCoordinateMap('a\nb\n');

    for (let offset = 0; offset <= map.editorText.length; offset += 1) {
      expect(map.toHost(editorOffset(offset))).toBe(offset);
      expect(map.toEditor(hostOffset(offset))).toBe(offset);
    }
  });

  test('normalizes mixed separators while retaining exact host boundaries', () => {
    const map = createCoordinateMap('a\r\nb\nc\rd');

    expect(map.editorText).toBe('a\nb\nc\nd');
    expect(map.toHost(editorOffset(2))).toBe(3);
    expect(map.toHost(editorOffset(4))).toBe(5);
    expect(map.toHost(editorOffset(6))).toBe(7);
    expect(map.toEditor(hostOffset(2), 'backward')).toBe(1);
    expect(map.toEditor(hostOffset(2), 'forward')).toBe(2);
  });

  test('counts emoji and combining characters as UTF-16 code units', () => {
    const map = createCoordinateMap('😀\r\ne\u0301');

    expect(map.editorText).toBe('😀\ne\u0301');
    expect(map.toHost(editorOffset(3))).toBe(4);
    expect(map.toHost(editorOffset(5))).toBe(6);
    expect(map.toEditor(hostOffset(6))).toBe(5);
  });

  test('maps empty lines and final newlines without inventing content', () => {
    const map = createCoordinateMap('\r\n\r\n');

    expect(map.editorText).toBe('\n\n');
    expect(map.toHost(editorOffset(2))).toBe(4);
    expect(map.toEditor(hostOffset(4))).toBe(2);
  });

  test('rejects non-integer and out-of-range offsets', () => {
    const map = createCoordinateMap('abc');

    expect(() => editorOffset(1.5)).toThrow(/integer/u);
    expect(() => hostOffset(-1)).toThrow(/non-negative/u);
    expect(() => map.toHost(editorOffset(4))).toThrow(/outside editor text/u);
    expect(() => map.toEditor(hostOffset(4))).toThrow(/outside host text/u);
  });
});
