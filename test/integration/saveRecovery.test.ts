import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';

suite('save and recovery', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-save-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await rm(directory, { force: true, recursive: true });
  });

  test('save_flushes_pending_before_success', async () => {
    const filePath = path.join(directory, 'save.md');
    await writeFile(filePath, 'before\n');
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 6), ' saved');
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    assert.equal(document.isDirty, true);
    assert.equal(await document.save(), true);
    assert.equal(document.isDirty, false);
    assert.equal(await readFile(filePath, 'utf8'), 'before saved\n');
  });

  test('failed_read_only_save_keeps_document_dirty', async () => {
    const provider: vscode.FileSystemProvider = {
      onDidChangeFile: new vscode.EventEmitter<vscode.FileChangeEvent[]>().event,
      watch: () => new vscode.Disposable(() => undefined),
      stat: () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 7 }),
      readDirectory: () => [],
      createDirectory: () => undefined,
      readFile: () => new TextEncoder().encode('before\n'),
      writeFile: () => { throw vscode.FileSystemError.NoPermissions('read only'); },
      delete: () => undefined,
      rename: () => undefined
    };
    const registration = vscode.workspace.registerFileSystemProvider('markami-readonly', provider, { isCaseSensitive: true });
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('markami-readonly:/doc.md'));
      await vscode.window.showTextDocument(document);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 6), ' local');
      assert.equal(await vscode.workspace.applyEdit(edit), true);
      assert.equal(await document.save(), false);
      assert.equal(document.isDirty, true);
      assert.equal(document.getText(), 'before local\n');
    } finally {
      registration.dispose();
    }
  });
});
