import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { executeWhenReady } from './support.js';

interface PreferenceState {
  readonly effective: {
    readonly appearance: string;
    readonly width: string;
  };
}

suite('durable view preferences', function () {
  this.timeout(30_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-preferences-'));
    await mkdir(path.join(directory, 'a'));
    await mkdir(path.join(directory, 'b'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('markami')
      .update('viewPreferences.rememberPerFile', undefined, vscode.ConfigurationTarget.Global);
    await rm(directory, { force: true, recursive: true });
  });

  test('duplicate basenames split views reopen rename and reset without touching source', async () => {
    const source = '# Preferences\r\n\r\nCanonical source stays exact.\r\n';
    const firstPath = path.join(directory, 'a', 'README.md');
    const secondPath = path.join(directory, 'b', 'README.md');
    await writeFile(firstPath, source);
    await writeFile(secondPath, source);
    const first = vscode.Uri.file(firstPath);
    const second = vscode.Uri.file(secondPath);

    await vscode.commands.executeCommand('vscode.openWith', first, 'markami.editor', vscode.ViewColumn.One);
    await vscode.commands.executeCommand('vscode.openWith', first, 'markami.editor', vscode.ViewColumn.Two);
    await executeWhenReady('markami.setDocumentAppearance', 'document');
    await executeWhenReady('markami.setDocumentWidth', 'readable');
    await waitForPreferences(first, { appearance: 'document', width: 'readable' });

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.openWith', first, 'markami.editor');
    await waitForPreferences(first, { appearance: 'document', width: 'readable' });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.openWith', second, 'markami.editor');
    await waitForPreferences(second, { appearance: 'vscode', width: 'auto' });
    await executeWhenReady('markami.setDocumentWidth', 'full');
    await waitForPreferences(second, { appearance: 'vscode', width: 'full' });
    await executeWhenReady('markami.resetFileViewPreferences');
    await waitForPreferences(second, { appearance: 'vscode', width: 'auto' });
    await executeWhenReady('markami.setDocumentWidth', 'full');
    await waitForPreferences(second, { appearance: 'vscode', width: 'full' });

    const renamed = vscode.Uri.file(path.join(directory, 'b', 'RENAMED.md'));
    const rename = new vscode.WorkspaceEdit();
    rename.renameFile(second, renamed);
    assert.equal(await vscode.workspace.applyEdit(rename), true);
    await vscode.commands.executeCommand('vscode.openWith', renamed, 'markami.editor');
    await waitForPreferences(renamed, { appearance: 'vscode', width: 'full' });
    await executeWhenReady('markami.setDocumentAppearance', 'document');
    await waitForPreferences(renamed, { appearance: 'document', width: 'full' });
    await executeWhenReady('markami.resetWorkspaceViewPreferences');
    await waitForPreferences(renamed, { appearance: 'vscode', width: 'auto' });
    await waitForPreferences(first, { appearance: 'vscode', width: 'auto' });

    assert.equal(await readFile(firstPath, 'utf8'), source);
    assert.equal(await readFile(renamed.fsPath, 'utf8'), source);
  });

  test('disabled remembrance lasts until the canonical document closes', async () => {
    await vscode.workspace.getConfiguration('markami')
      .update('viewPreferences.rememberPerFile', false, vscode.ConfigurationTarget.Global);
    const filePath = path.join(directory, 'session.md');
    await writeFile(filePath, '# Session\n');
    const uri = vscode.Uri.file(filePath);
    // openTextDocument() would pin the model in the extension host for minutes, so closing every editor
    // would never close the canonical document this test is about.
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default', vscode.ViewColumn.One);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor', vscode.ViewColumn.Two);
    await executeWhenReady('markami.setDocumentAppearance', 'document');
    await waitForPreferences(uri, { appearance: 'document', width: 'auto' });

    const customTab = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString());
    assert.ok(customTab);
    assert.equal(await vscode.window.tabGroups.close(customTab), true);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor', vscode.ViewColumn.Two);
    await waitForPreferences(uri, { appearance: 'document', width: 'auto' });

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
    await waitForPreferences(uri, { appearance: 'vscode', width: 'auto' });
    assert.equal(await readFile(filePath, 'utf8'), '# Session\n');
  });
});

async function waitForPreferences(
  uri: vscode.Uri,
  expected: { readonly appearance: string; readonly width: string }
): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const state = await vscode.commands.executeCommand<PreferenceState | undefined>(
      'markami.test.inspectViewPreferences',
      uri.toString()
    );
    if (state?.effective.appearance === expected.appearance && state.effective.width === expected.width) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const state = await vscode.commands.executeCommand<PreferenceState | undefined>(
    'markami.test.inspectViewPreferences',
    uri.toString()
  );
  assert.equal(state?.effective.appearance, expected.appearance);
  assert.equal(state.effective.width, expected.width);
}
