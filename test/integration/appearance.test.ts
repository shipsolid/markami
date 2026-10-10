import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { executeWhenReady, removeDirectory } from './support.js';

suite('document appearance commands', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-appearance-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await removeDirectory(directory);
  });

  test('all command values are source-neutral', async () => {
    const source = '# Appearance\n\nPending-safe content.\n';
    const filePath = path.join(directory, 'appearance.md');
    await writeFile(filePath, source);
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');

    for (const appearance of ['vscode', 'document']) {
      await executeWhenReady('markami.setDocumentAppearance', appearance);
    }
    for (const width of ['auto', 'readable', 'full']) {
      await executeWhenReady('markami.setDocumentWidth', width);
    }

    assert.equal(document.getText(), source);
    assert.equal(document.isDirty, false);
  });
});
