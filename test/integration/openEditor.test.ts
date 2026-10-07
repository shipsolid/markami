import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';

suite('custom editor', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-open-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await rm(directory, { force: true, recursive: true });
  });

  test('opens_md_as_optional_custom_editor', async () => {
    for (const filename of ['document.md', 'document.markdown']) {
      const filePath = path.join(directory, filename);
      const original = Buffer.from('# Source\r\n\r\nUntouched.\r\n', 'utf8');
      await writeFile(filePath, original);

      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      assert.deepEqual(await readFile(filePath), original);
    }

    const sourcePath = path.join(directory, 'source.ts');
    const source = Buffer.from('export const value = 1;\n', 'utf8');
    await writeFile(sourcePath, source);
    const document = await vscode.workspace.openTextDocument(sourcePath);
    const editor = await vscode.window.showTextDocument(document);

    assert.equal(editor.document.languageId, 'typescript');
    assert.deepEqual(await readFile(sourcePath), source);
  });
});
