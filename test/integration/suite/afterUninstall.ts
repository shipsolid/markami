import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { removeDirectory } from '../support.js';

export async function run(): Promise<void> {
  assert.equal(vscode.extensions.getExtension('shipsolid.markami'), undefined, 'markami must be gone after uninstall');
  assert.ok(!(await vscode.commands.getCommands(true)).includes('markami.openRendered'), 'markami commands must be gone');

  const directory = await mkdtemp(path.join(tmpdir(), 'markami-after-uninstall-'));
  try {
    const source = '\uFEFF# Heading\r\n\r\nTrailing  \r\nEmoji 😀 e\u0301\r\n';
    const file = path.join(directory, 'after.md');
    await writeFile(file, source, 'utf8');

    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
    assert.ok(
      vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText,
      'Markdown opens in the native text editor'
    );
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    assert.equal(await readFile(file, 'utf8'), source);
  } finally {
    await removeDirectory(directory);
  }
}
