import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { removeDirectory } from './support.js';

suite('multi-view synchronization', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-sync-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await removeDirectory(directory);
  });

  test('source_and_custom_views_share_one_canonical_document', async () => {
    const filePath = path.join(directory, 'views.md');
    await writeFile(filePath, 'first\n');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor', vscode.ViewColumn.Two);

    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(1, 0), 'external\n');
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    assert.equal(document.getText(), 'first\nexternal\n');
    assert.equal(await document.save(), true);
    assert.equal(await readFile(filePath, 'utf8'), 'first\nexternal\n');
  });
});
