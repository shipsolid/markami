import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { executeWhenReady, removeDirectory } from './support.js';

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await wait(50);
  }
  assert.fail(`timed out waiting for ${description}`);
}

// A Git checkout or an AI agent rewrites the file under an open editor; neither goes through VS Code.
suite('external edits while markami is open', function () {
  this.timeout(60_000);
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'markami-external-'));
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await removeDirectory(directory);
  });

  async function openRendered(name: string, source: string): Promise<{ file: string; document: vscode.TextDocument }> {
    const file = path.join(directory, name);
    await writeFile(file, source);
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.commands.executeCommand('vscode.openWith', document.uri, 'markami.editor');
    await executeWhenReady('markami.resetFileViewPreferences');
    return { file, document };
  }

  test('a rewrite on disk reaches a clean document exactly and is never echoed back', async () => {
    const { file, document } = await openRendered('checkout.md', '﻿# Old\r\n\r\ntext  \r\n');
    const rewritten = '# Other branch\n\n- one\n- two\n\nNo final newline';

    await writeFile(file, rewritten);
    await waitFor(() => document.getText() === rewritten, 'VS Code to reload the rewritten file');

    assert.equal(document.isDirty, false, 'the sync must not mark the document dirty');
    const settled = document.version;
    await wait(1_500);
    assert.equal(document.version, settled, 'markami must not answer the external change with an edit of its own');
    assert.equal(await readFile(file, 'utf8'), rewritten, 'the file must keep exactly the bytes the external writer produced');
  });

  test('an agent editing one line leaves every other byte of the open document alone', async () => {
    const original = '# Plan  \r\n\r\n* keep this  \r\n* change this\r\n\r\n| a | b |\r\n|:--|--:|\r\n| 1 | 2 |\r\n';
    const { file, document } = await openRendered('agent.md', original);
    const edited = original.replace('change this', 'changed by an agent');

    await writeFile(file, edited);
    await waitFor(() => document.getText() === edited, 'VS Code to reload the agent edit');
    await wait(1_000);

    assert.equal(document.isDirty, false);
    assert.equal(await readFile(file, 'utf8'), edited);
  });

  test('a disk change under unsaved edits overwrites neither side', async () => {
    const { file, document } = await openRendered('conflict.md', '# Title\n\nbody\n');
    const local = new vscode.WorkspaceEdit();
    local.insert(document.uri, new vscode.Position(2, 4), ' typed locally');
    assert.equal(await vscode.workspace.applyEdit(local), true);
    const typed = document.getText();
    const external = '# Title\n\nbody changed on disk\n';

    await writeFile(file, external);
    await wait(2_500);

    assert.equal(document.isDirty, true, 'unsaved local work stays unsaved');
    assert.equal(document.getText(), typed, 'the external change must not replace local edits');
    assert.equal(await readFile(file, 'utf8'), external, 'markami must not write local edits over the external version');
  });
});
