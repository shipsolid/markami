import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { buildBlockIndex } from '../src/core/markdown/blockIndex.js';
import { findUnknownSyntaxRanges, buildProjectionPlan } from '../src/core/markdown/syntax.js';
import { parseGfmTables } from '../src/core/markdown/tables.js';
import { applyPatchSet, createTextPatch } from '../src/core/source/PatchSet.js';
import { buildTechnicalPlan } from '../src/webview/features/technicalBlocks.js';

const runs = 5;
const targets = [
  { label: '10 KiB', bytes: 10 * 1024, openTargetMs: 200 },
  { label: '100 KiB', bytes: 100 * 1024, openTargetMs: 500 },
  { label: '1 MiB', bytes: 1024 * 1024, openTargetMs: 1500 }
] as const;

interface Measurement {
  readonly label: string;
  readonly bytes: number;
  readonly runsMs: readonly number[];
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly targetMs: number;
  readonly passed: boolean;
}

let checksum = 0;

function fixture(targetBytes: number): string {
  const chunk = [
    '# Heading',
    '',
    'Paragraph with **strong**, _emphasis_, `code`, and Unicode e\u0301.',
    '',
    '- [x] task',
    '- list item',
    '',
    '| left | right |',
    '| :--- | ---: |',
    '| one | two |',
    '',
    '```ts',
    'const value = 1;',
    '```',
    '',
    '> [!NOTE]',
    '> benchmark block',
    ''
  ].join('\n');
  let source = '';
  while (Buffer.byteLength(source, 'utf8') < targetBytes) source += chunk;
  return source.slice(0, targetBytes);
}

function project(source: string): void {
  const islands = findUnknownSyntaxRanges(source);
  const projection = buildProjectionPlan(source, { sourceIslands: islands });
  const blocks = buildBlockIndex(source, 1);
  const tables = parseGfmTables(source);
  const technical = buildTechnicalPlan(source, { from: 0, to: 0 });
  checksum += projection.marks.length + blocks.length + tables.length + technical.codeBlocks.length;
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function measureOpen(label: string, targetBytes: number, targetMs: number): Measurement {
  const source = fixture(targetBytes);
  project(source);
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    project(source);
    samples.push(performance.now() - start);
  }
  const p95Ms = rounded(percentile(samples, 0.95));
  return {
    label,
    bytes: Buffer.byteLength(source, 'utf8'),
    runsMs: samples.map(rounded),
    medianMs: rounded(percentile(samples, 0.5)),
    p95Ms,
    targetMs,
    passed: p95Ms <= targetMs
  };
}

function measureTyping(): Measurement {
  let source = fixture(100 * 1024);
  const samples: number[] = [];
  for (let run = 0; run < 100; run += 1) {
    const position = Math.min(source.length, 128 + run);
    const start = performance.now();
    source = applyPatchSet(source, [createTextPatch(position, position, 'x')]);
    project(source);
    samples.push(performance.now() - start);
  }
  const p95Ms = rounded(percentile(samples, 0.95));
  return {
    label: '100 KiB synthetic typing-to-projection proxy',
    bytes: Buffer.byteLength(source, 'utf8'),
    runsMs: samples.map(rounded),
    medianMs: rounded(percentile(samples, 0.5)),
    p95Ms,
    targetMs: 50,
    passed: p95Ms < 50
  };
}

function gitRevision(): string {
  if (process.env.MARKAMI_BENCH_REVISION !== undefined) return process.env.MARKAMI_BENCH_REVISION;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const forceGc = (globalThis as { gc?: () => void }).gc;
forceGc?.();
const heapBefore = process.memoryUsage().heapUsed;
const opening = targets.map((target) => measureOpen(target.label, target.bytes, target.openTargetMs));
for (let run = 0; run < 25; run += 1) project(fixture(100 * 1024));
forceGc?.();
const heapAfterRepeatedProjection = process.memoryUsage().heapUsed;
const typing = measureTyping();
const result = {
  kind: 'synthetic-node-parser-projection-proxy',
  caveat: 'This does not measure VS Code webview startup, DOM layout, paint, or native IME latency.',
  environment: {
    revision: gitRevision(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpus: os.cpus().length,
    node: process.version,
    runs
  },
  opening,
  typing,
  repeatedProjection: {
    iterations: 25,
    heapBeforeBytes: heapBefore,
    heapAfterBytes: heapAfterRepeatedProjection,
    heapDeltaBytes: heapAfterRepeatedProjection - heapBefore,
    note: 'Heap is sampled after forced GC; it remains a process-level diagnostic rather than a browser leak verdict.'
  },
  checksum
};

console.log(JSON.stringify(result, null, 2));
if (opening.some((measurement) => !measurement.passed) || !typing.passed) process.exitCode = 1;
