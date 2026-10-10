import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';

const READY_TIMEOUT_MS = 15_000;
const WARM_UP_ATTEMPTS = 3;
const WARM_UP_TIMEOUT_MS = 10_000;

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acceptedWithin(timeoutMs: number, command: string, args: readonly unknown[]): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await vscode.commands.executeCommand<boolean>(command, ...args)) return true;
    await wait(50);
  }
  return false;
}

/**
 * markami commands answer `false` until the active webview has completed its ready handshake, so a
 * freshly opened editor needs a short retry rather than a fixed sleep.
 */
export async function executeWhenReady(command: string, ...args: readonly unknown[]): Promise<void> {
  if (await acceptedWithin(READY_TIMEOUT_MS, command, args)) return;
  assert.fail(`${command} was not accepted by a ready markami editor within ${String(READY_TIMEOUT_MS)}ms`);
}

/**
 * The first custom editor opened in a fresh VS Code instance is occasionally never resolved while the
 * workbench is still settling. Prove the webview pipeline works once, retrying the open, before any test
 * depends on it; fail loudly if it never does.
 */
export async function warmUpMarkamiEditor(): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'markami-warmup-'));
  try {
    const file = vscode.Uri.file(path.join(directory, 'warmup.md'));
    await writeFile(file.fsPath, '# warm-up\n');
    for (let attempt = 1; attempt <= WARM_UP_ATTEMPTS; attempt += 1) {
      await vscode.commands.executeCommand('vscode.openWith', file, 'markami.editor');
      if (await acceptedWithin(WARM_UP_TIMEOUT_MS, 'markami.resetFileViewPreferences', [])) return;
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    }
    assert.fail(`markami editor never became ready after ${String(WARM_UP_ATTEMPTS)} warm-up attempts`);
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await rm(directory, { force: true, recursive: true });
  }
}
