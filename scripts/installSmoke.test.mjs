import assert from 'node:assert/strict';
import test from 'node:test';

import { assertInstalled, assertNotInstalled, parseExtensionList, verifyChecksum } from './installSmoke.mjs';

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
