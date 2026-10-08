import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildBlockIndex } from '../../src/core/markdown/blockIndex.js';
import { findFrontmatter } from '../../src/core/markdown/frontmatter.js';
import { buildProjectionPlan, findUnknownSyntaxRanges } from '../../src/core/markdown/syntax.js';
import { parseGfmTables } from '../../src/core/markdown/tables.js';
import { applyPatchSet, createTextPatch, invertPatchSet } from '../../src/core/source/PatchSet.js';
import { buildTechnicalPlan } from '../../src/webview/features/technicalBlocks.js';

const fixture = readFileSync(
  fileURLToPath(new URL('../../fixtures/corpus/comprehensive.md', import.meta.url)),
  'utf8'
);

function corpusVariants(): readonly [string, string][] {
  const body = fixture.replace(/^\uFEFF/u, '').replaceAll('\r\n', '\n');
  return [
    ['lf-bom-final', `\uFEFF${body.endsWith('\n') ? body : `${body}\n`}`],
    ['lf-no-bom-no-final', body.replace(/\n$/u, '')],
    ['crlf-bom-final', `\uFEFF${body.replaceAll('\n', '\r\n')}`],
    ['crlf-no-bom-no-final', body.replace(/\n$/u, '').replaceAll('\n', '\r\n')]
  ];
}

describe('golden Markdown corpus', () => {
  test.each(corpusVariants())('%s remains exact through every no-touch planner', (_name, source) => {
    const before = source;
    const islands = findUnknownSyntaxRanges(source);

    expect(() => {
      findFrontmatter(source);
      buildBlockIndex(source, 1);
      parseGfmTables(source);
      buildTechnicalPlan(source, { from: 0, to: 0 });
      buildProjectionPlan(source, { sourceIslands: islands });
    }).not.toThrow();
    expect(source).toBe(before);
    expect(applyPatchSet(source, [])).toBe(before);
    expect(islands.map((island) => island.reason)).toEqual(expect.arrayContaining(['MDX', 'custom directive']));
  });

  test.each(corpusVariants())('%s changes only the declared range and undoes exactly', (_name, source) => {
    const needle = 'Plain prose';
    const from = source.indexOf(needle);
    expect(from).toBeGreaterThan(-1);
    const patch = createTextPatch(from, from + needle.length, 'Edited prose');
    const edited = applyPatchSet(source, [patch]);

    expect(edited.slice(0, from)).toBe(source.slice(0, from));
    expect(edited.slice(from + 'Edited prose'.length)).toBe(source.slice(from + needle.length));
    expect(applyPatchSet(edited, invertPatchSet(source, [patch]))).toBe(source);
  });
});
