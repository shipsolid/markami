import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import { executeWhenReady } from '../support.js';

/**
 * Runs in an untrusted workspace whose own settings try to switch remote images on. Launched by
 * scripts/restrictedModeSmoke.mjs, because the standard runner always disables Workspace Trust.
 */
export async function run(): Promise<void> {
  assert.equal(vscode.workspace.isTrusted, false, 'this suite must run in Restricted Mode');
  const extension = vscode.extensions.getExtension('shipsolid.markami');
  assert.ok(extension, 'markami must be installed');

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the suite opens a workspace folder');
  const file = vscode.Uri.joinPath(folder.uri, 'restricted.md');
  const before = await readFile(file.fsPath, 'utf8');

  const fixture = JSON.parse(await readFile(vscode.Uri.joinPath(folder.uri, '.vscode', 'settings.json').fsPath, 'utf8')) as
    Record<string, unknown>;
  assert.equal(fixture['markami.remoteImages'], 'allow', 'the fixture workspace asks for remote images');
  const configuration = vscode.workspace.getConfiguration('markami', file);
  assert.equal(
    configuration.get('codeBlock.wrap'),
    false,
    'control: an ordinary workspace setting still applies, so the settings file is being read'
  );
  assert.equal(
    configuration.get('remoteImages'),
    'prompt',
    'workspace settings must not change the remote image policy in Restricted Mode'
  );

  await vscode.commands.executeCommand('vscode.openWith', file, 'markami.editor');
  await executeWhenReady('markami.resetFileViewPreferences');

  assert.equal(extension.isActive, true, 'markami activates in Restricted Mode');
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  assert.ok(input instanceof vscode.TabInputCustom && input.viewType === 'markami.editor', 'the file opens in markami');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  assert.equal(await readFile(file.fsPath, 'utf8'), before, 'opening in Restricted Mode does not touch the file');
}
