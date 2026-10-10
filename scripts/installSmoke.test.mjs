import assert from 'node:assert/strict';
import test from 'node:test';

import { assertInstalled, assertNotInstalled, cliInvocation, parseExtensionList, verifyChecksum } from './installSmoke.mjs';

const listing = 'vscode.git@1.0.0\nShipSolid.Markami@0.1.0\n\nms-python.python@2025.1.0\n';

test('parses the CLI extension listing case-insensitively and ignores blank lines', () => {
  const parsed = parseExtensionList(listing);

  assert.equal(parsed.get('shipsolid.markami'), '0.1.0');
  assert.equal(parsed.size, 3);
});

test('requires the exact extension id and version after install', () => {
  assert.doesNotThrow(() => assertInstalled(listing, 'shipsolid.markami', '0.1.0'));
  assert.throws(() => assertInstalled(listing, 'shipsolid.markami', '0.2.0'), /0\.1\.0.*0\.2\.0/su);
  assert.throws(() => assertInstalled('vscode.git@1.0.0\n', 'shipsolid.markami', '0.1.0'), /not installed/iu);
});

test('requires the extension to be gone after uninstall', () => {
  assert.doesNotThrow(() => assertNotInstalled('vscode.git@1.0.0\n', 'shipsolid.markami'));
  assert.throws(() => assertNotInstalled(listing, 'shipsolid.markami'), /still installed/iu);
});

test('verifies the published checksum line against the artifact name and digest', () => {
  const digest = 'a'.repeat(64);

  assert.doesNotThrow(() => verifyChecksum(`${digest}  markami-0.1.0.vsix\n`, 'markami-0.1.0.vsix', digest));
  assert.throws(() => verifyChecksum(`${digest}  markami-0.1.0.vsix\n`, 'markami-0.1.0.vsix', 'b'.repeat(64)), /does not match/iu);
  assert.throws(() => verifyChecksum(`${digest}  other.vsix\n`, 'markami-0.1.0.vsix', digest), /other\.vsix/u);
});

test('runs the CLI directly on POSIX hosts, including paths that contain spaces', () => {
  const cli = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';

  assert.deepEqual(cliInvocation(cli, ['--list-extensions'], 'darwin'), { file: cli, args: ['--list-extensions'], shell: false });
});

test('runs the Windows .cmd shim through a shell and quotes every argument that needs it', () => {
  const invocation = cliInvocation(
    String.raw`C:\Program Files\Code\bin\code.cmd`,
    ['--extensions-dir', String.raw`C:\Users\run ner\ext`, '--install-extension', String.raw`D:\a\markami.vsix`],
    'win32'
  );

  assert.equal(invocation.shell, true);
  assert.equal(invocation.file, String.raw`"C:\Program Files\Code\bin\code.cmd"`);
  assert.deepEqual(invocation.args, [
    '--extensions-dir', String.raw`"C:\Users\run ner\ext"`, '--install-extension', String.raw`D:\a\markami.vsix`
  ]);
});

test('refuses Windows arguments that cannot be quoted safely for cmd.exe', () => {
  assert.throws(() => cliInvocation('code.cmd', ['a"b'], 'win32'), /quote/iu);
  assert.throws(() => cliInvocation('code.cmd', ['%PATH%'], 'win32'), /percent/iu);
});
