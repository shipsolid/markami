import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { devNull } from 'node:os';
import path from 'node:path';

// The diff capture proves line endings survive an edit, so this fixture is committed with CRLF regardless of
// how the repository stores it.
const CRLF_FIXTURES = new Set(['release-notes.md']);

export async function prepareCaptureWorkspace(destination, fixtureRoot) {
  await mkdir(destination, { recursive: true });
  const names = (await readdir(fixtureRoot)).filter((name) => name.endsWith('.md')).sort();
  for (const name of names) {
    const target = path.join(destination, name);
    if (CRLF_FIXTURES.has(name)) {
      const source = await readFile(path.join(fixtureRoot, name), 'utf8');
      await writeFile(target, source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
    } else {
      await copyFile(path.join(fixtureRoot, name), target);
    }
  }

  const git = (...arguments_) => execFileSync('git', ['-C', destination, ...arguments_], {
    stdio: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_SYSTEM: devNull }
  });
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'core.autocrlf', 'false');
  git('add', '--all');
  git(
    '-c', 'user.name=markami capture',
    '-c', 'user.email=capture@invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '--message', 'Capture fixtures'
  );
}
