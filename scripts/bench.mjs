import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { readGitRevision } from './gitRevision.mjs';

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'markami-bench-'));
const output = path.join(temporaryDirectory, 'bench.mjs');
const revision = readGitRevision(process.cwd());
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
