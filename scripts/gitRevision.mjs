import { spawnSync } from 'node:child_process';

export function readGitRevision(cwd) {
  const result = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd, encoding: 'utf8' });
  const revision = result.stdout?.trim();
  if (result.status !== 0 || !revision || !/^[a-f0-9]{7,}$/u.test(revision)) {
    const reason = result.error?.message ?? result.stderr?.trim() ?? 'unknown Git error';
    throw new Error(`Cannot resolve Git revision: ${reason}`);
  }
  return revision;
}
