import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'markami-bench-'));
const output = path.join(temporaryDirectory, 'bench.mjs');
const revision = await readRevision();
try {
  await build({
    entryPoints: [path.resolve('scripts/bench.ts')],
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning'
  });
  const execution = spawnSync(process.execPath, ['--expose-gc', output], {
    cwd: process.cwd(),
    env: { ...process.env, MARKAMI_BENCH_REVISION: revision },
    stdio: 'inherit'
  });
  if (execution.status !== 0) process.exitCode = execution.status ?? 1;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function readRevision() {
  const head = (await readFile('.git/HEAD', 'utf8')).trim();
  if (!head.startsWith('ref: ')) return head.slice(0, 7);
  const reference = head.slice('ref: '.length);
  try {
    return (await readFile(path.join('.git', reference), 'utf8')).trim().slice(0, 7);
  } catch {
    const packed = await readFile('.git/packed-refs', 'utf8');
    return packed.split('\n').find((line) => line.endsWith(` ${reference}`))?.slice(0, 7) ?? 'unknown';
  }
}
