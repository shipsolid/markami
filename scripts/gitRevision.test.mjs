import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readGitRevision } from './gitRevision.mjs';

test('reads the current revision from a linked worktree', async () => {
  const expected = await revisionFromGitMetadata();
  assert.equal(readGitRevision(process.cwd()), expected);
});

test('rejects a directory that is not a Git checkout', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-not-git-'));
  try {
    assert.throws(() => readGitRevision(directory), /cannot resolve Git revision/iu);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

async function revisionFromGitMetadata() {
  const dotGit = (await readFile('.git', 'utf8')).trim();
  const gitDirectory = dotGit.startsWith('gitdir: ')
    ? path.resolve(dotGit.slice('gitdir: '.length))
    : path.resolve('.git');
  const head = (await readFile(path.join(gitDirectory, 'HEAD'), 'utf8')).trim();
  if (!head.startsWith('ref: ')) return head.slice(0, 7);

  const reference = head.slice('ref: '.length);
  let commonDirectory = gitDirectory;
  try {
    commonDirectory = path.resolve(gitDirectory, (await readFile(path.join(gitDirectory, 'commondir'), 'utf8')).trim());
  } catch {
    // A normal checkout keeps refs directly under its Git directory.
  }
  try {
    return (await readFile(path.join(commonDirectory, reference), 'utf8')).trim().slice(0, 7);
  } catch {
    const packed = await readFile(path.join(commonDirectory, 'packed-refs'), 'utf8');
    const revision = packed.split('\n').find((line) => line.endsWith(` ${reference}`))?.slice(0, 7);
    assert.ok(revision, `missing ${reference} in Git metadata`);
    return revision;
  }
}
