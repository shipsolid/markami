import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'out', 'suite', 'index.js'),
  launchArgs: [
    '--disable-extensions',
    '--disable-gpu',
    '--no-sandbox',
    '--skip-welcome',
    '--skip-release-notes',
    '--user-data-dir',
    path.join(root, '.vscode-test', 'user-data'),
    '--extensions-dir',
    path.join(root, '.vscode-test', 'extensions')
  ]
});
