import * as vscode from 'vscode';
import { MarkamiProvider } from './MarkamiProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkamiProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MarkamiProvider.viewType, provider, {
      supportsMultipleEditorsPerDocument: false,
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
