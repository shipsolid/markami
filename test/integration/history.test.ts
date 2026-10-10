import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { removeDirectory } from './support.js';

suite('canonical history', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-history-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await removeDirectory(directory);
  });

  test('visual_undo_source_redo_same_history', async () => {
    const filePath = path.join(directory, 'history.md');
    await writeFile(filePath, 'before\n');
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 6), ' visual');
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    assert.equal(document.getText(), 'before visual\n');
    assert.equal(document.isDirty, true);

    await vscode.commands.executeCommand('undo');
    assert.equal(document.getText(), 'before\n');
    assert.equal(document.isDirty, false);
    await vscode.commands.executeCommand('redo');
    assert.equal(document.getText(), 'before visual\n');
    assert.equal(document.isDirty, true);
  });
});
