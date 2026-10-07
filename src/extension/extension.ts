import * as vscode from 'vscode';
import { DocumentSessionRegistry } from './DocumentSessionRegistry.js';
import { HistoryRouter } from './history.js';
import { MarkamiProvider } from './MarkamiProvider.js';
import { MementoRecoveryStorage, RecoveryStore } from './RecoveryStore.js';

export function activate(context: vscode.ExtensionContext): void {
  const recovery = new RecoveryStore(new MementoRecoveryStorage(context.workspaceState));
  const sessions = new DocumentSessionRegistry(recovery);
  const history = new HistoryRouter();
  const provider = new MarkamiProvider(context.extensionUri, sessions, history);

  context.subscriptions.push(
    sessions,
    vscode.window.registerCustomEditorProvider(MarkamiProvider.viewType, provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('markami.openRendered', async () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (uri !== undefined) {
        await vscode.commands.executeCommand('vscode.openWith', uri, MarkamiProvider.viewType);
      }
    }),
    vscode.commands.registerCommand('markami.openSource', async () => {
      const active = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      if (active instanceof vscode.TabInputCustom) {
        await vscode.commands.executeCommand('vscode.openWith', active.uri, 'default');
      }
    })
  );
}

export function deactivate(): void {}
