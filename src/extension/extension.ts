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
import { ScopedMementoViewPreferencesStorage, ViewPreferencesStore } from './ViewPreferencesStore.js';

export function activate(context: vscode.ExtensionContext): void {
  const recovery = new RecoveryStore(new MementoRecoveryStorage(context.workspaceState));
  const sessions = new DocumentSessionRegistry(recovery);
  const history = new HistoryRouter();
  const hasWorkspace = (): boolean => vscode.workspace.name !== undefined ||
    vscode.workspace.workspaceFile !== undefined || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  const viewPreferences = new ViewPreferencesStore(new ScopedMementoViewPreferencesStorage(
    context.workspaceState,
    context.globalState,
    hasWorkspace
  ), {
    rememberPerFile: () => vscode.workspace.getConfiguration('markami')
      .get<boolean>('viewPreferences.rememberPerFile', true)
  });
  const provider = new MarkamiProvider(context.extensionUri, sessions, history, viewPreferences);
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
    vscode.commands.registerCommand('markami.resetFileViewPreferences', () =>
      provider.executeAction('markami.resetFileViewPreferences')),
    vscode.commands.registerCommand('markami.resetWorkspaceViewPreferences', () =>
      provider.executeAction('markami.resetWorkspaceViewPreferences')),
    vscode.workspace.onDidRenameFiles((event) => {
      void Promise.all(event.files.map(({ oldUri, newUri }) =>
        provider.renameViewPreferences(oldUri, newUri)));
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      void Promise.all(event.files.map((uri) => viewPreferences.delete(uri.toString())));
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      void viewPreferences.closeSession(document.uri.toString());
    }),
    ...formattingCommands.map((command) => vscode.commands.registerCommand(command, () => provider.executeAction(command)))
  );
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(vscode.commands.registerCommand('markami.test.inspectViewPreferences', (uri: string) =>
      provider.inspectViewPreferences(uri)));
  }
}

export function deactivate(): void {}
