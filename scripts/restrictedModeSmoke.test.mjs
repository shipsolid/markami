import assert from 'node:assert/strict';
import test from 'node:test';
import { restrictedLaunchArguments, restrictedUserSettings } from './restrictedModeSmoke.mjs';

const input = {
  workspace: '/tmp/ws',
  hostDirectory: '/tmp/host',
  testsPath: '/repo/out/suite/restrictedMode.js',
  extensionsDirectory: '/tmp/extensions',
  userDataDirectory: '/tmp/user-data'
};

test('launch arguments never disable workspace trust, because the suite must run in Restricted Mode', () => {
  const launch = restrictedLaunchArguments(input);

  assert.ok(!launch.includes('--disable-workspace-trust'));
  assert.ok(launch.includes('--extensionTestsPath=/repo/out/suite/restrictedMode.js'));
  assert.ok(launch.includes('--extensionDevelopmentPath=/tmp/host'));
  assert.equal(launch[0], '/tmp/ws', 'the untrusted folder is opened as the workspace');
  assert.ok(launch.includes('--user-data-dir') && launch.includes('--extensions-dir'));
});

test('user settings keep trust enabled and only suppress the prompts that would block the suite', () => {
  const settings = restrictedUserSettings();

  assert.equal(settings['security.workspace.trust.enabled'], true);
  assert.equal(settings['security.workspace.trust.startupPrompt'], 'never');
  assert.equal(settings['security.workspace.trust.untrustedFiles'], 'open');
});
