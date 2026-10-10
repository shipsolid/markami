import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareCaptureWorkspace } from './captureWorkspace.mjs';

const fixtures = new URL('../fixtures/marketplace/', import.meta.url);

test('stages the capture fixtures in a clean one-commit Git repository', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-capture-workspace-'));
  try {
    await prepareCaptureWorkspace(directory, fixtures.pathname);

    const git = (...arguments_) => execFileSync('git', ['-C', directory, ...arguments_], { encoding: 'utf8' });
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(git('rev-list', '--count', 'HEAD').trim(), '1');
    assert.match(git('ls-files'), /overview\.md\nrelease-notes\.md\nsource-fidelity\.md\ntechnical\.md/u);
    for (const name of ['overview.md', 'source-fidelity.md', 'technical.md']) {
      assert.deepEqual(await readFile(path.join(directory, name)), await readFile(new URL(name, fixtures)));
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('commits the diff fixture with CRLF line endings and its trailing hard-break spaces', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-capture-workspace-'));
  try {
    await prepareCaptureWorkspace(directory, fixtures.pathname);

    const committed = execFileSync('git', ['-C', directory, 'show', 'HEAD:release-notes.md'], { encoding: 'utf8' });
    assert.ok(committed.startsWith('Release checklist\r\n\r\n'));
    assert.equal(committed.replaceAll('\r\n', '').includes('\n'), false, 'every line ends with CRLF');
    assert.match(committed, /Update the changelog {2}\r\n/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('does not depend on the host Git identity or global configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-capture-workspace-'));
  const emptyHome = await mkdtemp(path.join(tmpdir(), 'markami-empty-home-'));
  const saved = { HOME: process.env.HOME, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL };
  try {
    process.env.HOME = emptyHome;
    process.env.GIT_CONFIG_GLOBAL = path.join(emptyHome, 'missing-gitconfig');

    await assert.doesNotReject(() => prepareCaptureWorkspace(directory, fixtures.pathname));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { force: true, recursive: true });
    await rm(emptyHome, { force: true, recursive: true });
  }
});
