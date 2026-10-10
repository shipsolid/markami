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
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closePanel');

    await openRendered(workspace.uri, 'overview.md');
    await setDocumentPresentation();
    await capture(captureTool, outputDirectory, 'rendered-editor.png');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await openRendered(workspace.uri, 'source-fidelity.md');
    await setDocumentPresentation();
    assert.equal(await vscode.commands.executeCommand('markami.toggleSourceReveal'), true);
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

async function setDocumentPresentation(): Promise<void> {
  assert.equal(await vscode.commands.executeCommand('markami.setDocumentAppearance', 'document'), true);
  assert.equal(await vscode.commands.executeCommand('markami.setDocumentWidth', 'readable'), true);
  await wait(1_000);
}

async function capture(tool: string, directory: string, filename: string): Promise<void> {
  const output = path.join(directory, filename);
  await runFile(tool, ['-window', 'root', output]);
  assert.ok((await stat(output)).size > 0, `${filename} must not be empty`);
}
