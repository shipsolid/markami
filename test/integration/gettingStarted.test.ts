import assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('getting started', function () {
  this.timeout(20_000);

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('open_sample_shows_the_bundled_document_in_markami_without_writing_a_file', async () => {
    const extension = vscode.extensions.getExtension('shipsolid.markami');
    assert.ok(extension, 'markami must be installed');
    const bundled = Buffer.from(await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(extension.extensionUri, 'media', 'walkthrough', 'sample.md')
    )).toString('utf8');

    await vscode.commands.executeCommand('markami.openSample');

    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom, 'the sample opens in a custom editor');
    assert.equal(input.viewType, 'markami.editor');
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === input.uri.toString());
    assert.ok(document, 'the sample has a text document');
    assert.equal(document.isUntitled, true, 'the sample never touches the file system until the user saves');
    assert.equal(document.getText(), bundled);
  });

  test('default_editor_commands_are_registered_but_do_not_change_settings_on_activation', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('markami.setAsDefault'));
    assert.ok(commands.includes('markami.restoreNativeDefault'));

    const associations = vscode.workspace.getConfiguration('workbench').inspect<Record<string, string>>('editorAssociations');
    assert.equal(associations?.globalValue?.['*.md'], undefined);
    assert.equal(associations?.globalValue?.['*.markdown'], undefined);
  });
});
