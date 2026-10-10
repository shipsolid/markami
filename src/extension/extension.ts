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
import { FORWARDED_COMMANDS, isMarkamiCustomEditorInput } from './commands.js';
import { applyDefaultEditor, type DefaultEditorHost, type DefaultEditorMode } from './defaultEditor.js';

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
  const directlyRegistered = new Set([
    'markami.setDocumentAppearance',
    'markami.setDocumentWidth',
    'markami.resetFileViewPreferences',
    'markami.resetWorkspaceViewPreferences'
  ]);
  const defaultEditorHost: DefaultEditorHost = {
    readUserAssociations: () => vscode.workspace.getConfiguration('workbench')
      .inspect<unknown>('editorAssociations')?.globalValue,
    writeUserAssociations: (associations) => vscode.workspace.getConfiguration('workbench')
      .update('editorAssociations', associations, vscode.ConfigurationTarget.Global),
    confirm: async (message, action) =>
      (await vscode.window.showInformationMessage(message, { modal: true }, action)) === action,
    inform: (message) => void vscode.window.showInformationMessage(message)
  };
  const setDefaultEditor = (mode: DefaultEditorMode) => (): Promise<boolean> =>
    applyDefaultEditor(mode, defaultEditorHost);
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
      if (active instanceof vscode.TabInputCustom && isMarkamiCustomEditorInput(active)) {
        await vscode.commands.executeCommand('vscode.openWith', active.uri, 'default');
      }
    }),
    vscode.commands.registerCommand('markami.openSample', async () => {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'walkthrough', 'sample.md')
      );
      const sample = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: new TextDecoder().decode(bytes)
      });
      await vscode.commands.executeCommand('vscode.openWith', sample.uri, MarkamiProvider.viewType);
    }),
    vscode.commands.registerCommand('markami.setAsDefault', setDefaultEditor('markami')),
    vscode.commands.registerCommand('markami.restoreNativeDefault', setDefaultEditor('native')),
    vscode.commands.registerCommand('markami.setDocumentAppearance', async (supplied?: unknown) => {
      const target = provider.captureActiveView();
      if (target === undefined) return false;
      const appearance = await chooseDocumentAppearance(supplied, pickPreference);
      return appearance === undefined ? false : provider.executeAction('markami.setDocumentAppearance', appearance, target);
    }),
    vscode.commands.registerCommand('markami.setDocumentWidth', async (supplied?: unknown) => {
      const target = provider.captureActiveView();
      if (target === undefined) return false;
      const width = await chooseDocumentWidth(supplied, pickPreference);
      return width === undefined ? false : provider.executeAction('markami.setDocumentWidth', width, target);
    }),
    vscode.commands.registerCommand('markami.resetFileViewPreferences', () =>
      provider.executeAction('markami.resetFileViewPreferences')),
    vscode.commands.registerCommand('markami.resetWorkspaceViewPreferences', () =>
      provider.executeAction('markami.resetWorkspaceViewPreferences')),
    vscode.workspace.onDidRenameFiles((event) => {
      void Promise.all(event.files.map(({ oldUri, newUri }) =>
        Promise.all([
          provider.renameViewPreferences(oldUri, newUri),
          recovery.rename(oldUri.toString(), newUri.toString())
        ])));
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      void Promise.all(event.files.map((uri) => Promise.all([
        viewPreferences.delete(uri.toString()),
        recovery.delete(uri.toString())
      ])));
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      void viewPreferences.closeSession(document.uri.toString());
    }),
    ...FORWARDED_COMMANDS
      .filter((command) => !directlyRegistered.has(command.id))
      .map((command) => vscode.commands.registerCommand(command.id, () => provider.executeAction(command.id)))
  );
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(vscode.commands.registerCommand('markami.test.inspectViewPreferences', (uri: string) =>
      provider.inspectViewPreferences(uri)));
  }
}

export function deactivate(): void {}
