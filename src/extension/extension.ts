import * as vscode from 'vscode';
import { DocumentSessionRegistry } from './DocumentSessionRegistry.js';
import { HistoryRouter } from './history.js';
import { MarkamiProvider } from './MarkamiProvider.js';
import { MementoRecoveryStorage, RecoveryStore } from './RecoveryStore.js';
import {
  chooseDocumentAppearance,
  chooseDocumentWidth,
  type PreferenceChoice
} from './appearanceCommands.js';

export function activate(context: vscode.ExtensionContext): void {
  const recovery = new RecoveryStore(new MementoRecoveryStorage(context.workspaceState));
  const sessions = new DocumentSessionRegistry(recovery);
  const history = new HistoryRouter();
  const provider = new MarkamiProvider(context.extensionUri, sessions, history);
  const formattingCommands = [
    'markami.bold',
    'markami.italic',
    'markami.strikethrough',
    'markami.inlineCode',
    'markami.link',
    'markami.clearFormatting',
    'markami.paragraph',
    'markami.heading1',
    'markami.heading2',
    'markami.heading3',
    'markami.heading4',
    'markami.heading5',
    'markami.heading6',
    'markami.showSelectionToolbar',
    'markami.openSlashCommands',
    'markami.moveBlockUp',
    'markami.moveBlockDown',
    'markami.moveBlockTo'
  ];
  const pickPreference = (items: readonly PreferenceChoice[]): Thenable<PreferenceChoice | undefined> =>
    vscode.window.showQuickPick(items, { placeHolder: 'Choose a document presentation setting' });

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
    }),
    vscode.commands.registerCommand('markami.setDocumentAppearance', async (supplied?: unknown) => {
      const appearance = await chooseDocumentAppearance(supplied, pickPreference);
      return appearance === undefined ? false : provider.executeAction('markami.setDocumentAppearance', appearance);
    }),
    vscode.commands.registerCommand('markami.setDocumentWidth', async (supplied?: unknown) => {
      const width = await chooseDocumentWidth(supplied, pickPreference);
      return width === undefined ? false : provider.executeAction('markami.setDocumentWidth', width);
    }),
    ...formattingCommands.map((command) => vscode.commands.registerCommand(command, () => provider.executeAction(command)))
  );
}

export function deactivate(): void {}
