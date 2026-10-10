import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const runFile = promisify(execFile);
const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

suite('packaged Marketplace surface', function () {
  this.timeout(90_000);

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('captures the approved product views from the packaged extension', async () => {
    const outputDirectory = process.env.MARKETPLACE_CAPTURE_DIR;
    const captureTool = process.env.MARKETPLACE_CAPTURE_TOOL;
    const workspace = vscode.workspace.workspaceFolders?.[0];
    assert.ok(outputDirectory, 'MARKETPLACE_CAPTURE_DIR is required');
    assert.ok(captureTool, 'MARKETPLACE_CAPTURE_TOOL is required');
    assert.ok(workspace, 'Marketplace fixture workspace is required');
    await mkdir(outputDirectory, { recursive: true });

    await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('window').update('zoomLevel', 0, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('git').update('openRepositoryInParentFolders', 'never', vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');

    // The listing leads with the default VS Code style and shows the opt-in Document style once.
    await openRendered(workspace.uri, 'overview.md');
    await setDocumentPresentation('vscode', 'auto');
    await capture(captureTool, outputDirectory, 'rendered-editor.png');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await openRendered(workspace.uri, 'source-fidelity.md');
    await setDocumentPresentation('document', 'readable');
    await executeWhenReady('markami.toggleSourceReveal');
    await wait(1_000);
    await capture(captureTool, outputDirectory, 'source-preserving-editing.png');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await openRendered(workspace.uri, 'technical.md');
    await setDocumentPresentation('vscode', 'auto');
    await wait(3_000);
    await capture(captureTool, outputDirectory, 'technical-markdown.png');

    // The listing claims small diffs, so the image is only taken after proving the saved bytes changed in one place.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const notes = vscode.Uri.joinPath(workspace.uri, 'release-notes.md');
    const committed = await readFile(notes.fsPath, 'utf8');
    await openRendered(workspace.uri, 'release-notes.md');
    await setDocumentPresentation('vscode', 'auto');
    // The animation's frames: before the edit, after the edit, then the diff below.
    const frames = path.join(outputDirectory, 'frames');
    await mkdir(frames, { recursive: true });
    await capture(captureTool, frames, '1-before.png');
    await executeWhenReady('markami.heading1');
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === notes.toString());
    assert.ok(document, 'release-notes.md must be open');
    await waitFor(() => document.isDirty, 'the heading edit reaching the document');
    assert.equal(await document.save(), true);
    assert.equal(
      await readFile(notes.fsPath, 'utf8'),
      committed.replace('Release checklist\r\n', '# Release checklist\r\n'),
      'promoting the paragraph must change that one line and nothing else'
    );

    await wait(1_000);
    await capture(captureTool, frames, '2-after.png');

    await waitForGitChange(notes);
    await vscode.commands.executeCommand('workbench.action.splitEditorRight');
    await vscode.commands.executeCommand('git.openChange', notes);
    await wait(2_000);
    await capture(captureTool, outputDirectory, 'git-diff.png');
    await capture(captureTool, frames, '3-diff.png');
  });
});

async function openRendered(workspace: vscode.Uri, filename: string): Promise<void> {
  const uri = vscode.Uri.joinPath(workspace, filename);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'markami.editor');
  await wait(2_000);
}

// markami commands answer false until the freshly opened webview completes its ready handshake.
async function executeWhenReady(command: string, ...args: readonly unknown[]): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await vscode.commands.executeCommand<boolean>(command, ...args)) return;
    await wait(50);
  }
  assert.fail(`${command} was not accepted by a ready markami editor within 15s`);
}

async function setDocumentPresentation(appearance: 'vscode' | 'document', width: 'auto' | 'readable'): Promise<void> {
  await executeWhenReady('markami.setDocumentAppearance', appearance);
  await executeWhenReady('markami.setDocumentWidth', width);
  await wait(1_000);
}

async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await wait(50);
  }
  assert.fail(`timed out waiting for ${description}`);
}

interface GitApi {
  readonly repositories: readonly { readonly state: { readonly workingTreeChanges: readonly { readonly uri: vscode.Uri }[] } }[];
}

async function waitForGitChange(uri: vscode.Uri): Promise<void> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
  assert.ok(extension, 'the built-in Git extension is required for the diff capture');
  const api = (await extension.activate()).getAPI(1);
  await waitFor(
    () => api.repositories.some((repository) =>
      repository.state.workingTreeChanges.some((change) => change.uri.toString() === uri.toString())),
    'Git to report the saved change'
  );
}

async function capture(tool: string, directory: string, filename: string): Promise<void> {
  // Host toasts (extensions disabled, parent-folder Git prompt) must never reach a public listing image.
  await vscode.commands.executeCommand('notifications.clearAll');
  await wait(500);
  const output = path.join(directory, filename);
  await runFile(tool, ['-window', 'root', output]);
  assert.ok((await stat(output)).size > 0, `${filename} must not be empty`);
}
