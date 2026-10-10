import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
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

    await openRendered(workspace.uri, 'overview.md');
    await setDocumentPresentation();
    await capture(captureTool, outputDirectory, 'rendered-editor.png');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await openRendered(workspace.uri, 'source-fidelity.md');
    await setDocumentPresentation();
    await executeWhenReady('markami.toggleSourceReveal');
    await wait(1_000);
    await capture(captureTool, outputDirectory, 'source-preserving-editing.png');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await openRendered(workspace.uri, 'technical.md');
    await setDocumentPresentation();
    await wait(3_000);
    await capture(captureTool, outputDirectory, 'technical-markdown.png');
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

async function setDocumentPresentation(): Promise<void> {
  await executeWhenReady('markami.setDocumentAppearance', 'document');
  await executeWhenReady('markami.setDocumentWidth', 'readable');
  await wait(1_000);
}

async function capture(tool: string, directory: string, filename: string): Promise<void> {
  // Host toasts (extensions disabled, parent-folder Git prompt) must never reach a public listing image.
  await vscode.commands.executeCommand('notifications.clearAll');
  await wait(500);
  const output = path.join(directory, filename);
  await runFile(tool, ['-window', 'root', output]);
  assert.ok((await stat(output)).size > 0, `${filename} must not be empty`);
}
