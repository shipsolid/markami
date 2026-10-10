import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { removeDirectory } from './support.js';

suite('resources', function () {
  this.timeout(20_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-resources-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('markami').update('remoteImages', undefined, vscode.ConfigurationTarget.Global);
    await removeDirectory(directory);
  });

  test('blocked_remote_and_missing_local_resources_preserve_source', async () => {
    const filePath = path.join(directory, 'resources.md');
    const original = Buffer.from([
      '# Resources',
      '',
      '![Local](./missing.png)',
      '![Remote](https://example.com/image.png)',
      '[Same heading](#resources)',
      ''
    ].join('\r\n'), 'utf8');
    await writeFile(filePath, original);
    await vscode.workspace.getConfiguration('markami', vscode.Uri.file(filePath))
      .update('remoteImages', 'block', vscode.ConfigurationTarget.Global);

    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(filePath), 'markami.editor');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    assert.deepEqual(await readFile(filePath), original);
  });

  test('remote_policy_reload_preserves_canonical_edits', async () => {
    const filePath = path.join(directory, 'policy.md');
    await writeFile(filePath, '# Policy\n');
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString());
    assert.ok(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, document.positionAt(document.getText().length), '\nCanonical edit.\n');
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    assert.equal(await document.save(), true);

    await vscode.workspace.getConfiguration('markami', uri)
      .update('remoteImages', 'allow', vscode.ConfigurationTarget.Global);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    assert.equal(await readFile(filePath, 'utf8'), '# Policy\n\nCanonical edit.\n');
  });
});
